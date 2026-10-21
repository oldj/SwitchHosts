//! Backend-owned content synchronization, independent of any webview.
//! Changes are queued at the storage commit boundary. A pending renderer apply
//! defers them until acknowledgement/recovery; a failed write retains them.

use std::collections::HashSet;
use std::future::Future;
use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};

use super::{aggregate, write::ApplyOutcome, HostsApplyError};
use crate::{
    commands,
    storage::{AppState, StorageError},
    tray,
};

#[derive(Default)]
struct Changes {
    ids: HashSet<String>,
    all: bool,
}

#[derive(Default)]
pub struct ContentSync(Mutex<Changes>);

impl ContentSync {
    pub(crate) fn is_pending(&self) -> bool {
        let changes = self.0.lock().unwrap();
        changes.all || !changes.ids.is_empty()
    }

    pub fn mark(&self, id: &str) {
        self.0.lock().unwrap().ids.insert(id.into());
    }

    pub fn mark_all(&self) {
        self.0.lock().unwrap().all = true;
    }

    fn restore(&self, changes: Changes) {
        let mut pending = self.0.lock().unwrap();
        pending.ids.extend(changes.ids);
        pending.all |= changes.all;
    }
}

pub(crate) async fn apply_pending<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Result<(), StorageError> {
    if !state.content_sync.is_pending() {
        return Ok(());
    }
    let result = synchronize(state, &NativeHosts { app, state }).await;
    if let Err(error) = &result {
        log::warn!("saved hosts content could not be applied: {error}");
    }
    let _ = tray::refresh_title(app, state);
    let _ = app.emit("tray_list_updated", json!({"_args": []}));
    result
}

trait SystemHosts: Sync {
    fn is_current(&self, content: &str, write_mode: &str) -> bool;
    fn apply(
        &self,
        content: &str,
    ) -> impl Future<Output = Result<ApplyOutcome, HostsApplyError>> + Send;
    fn matches(&self, content: &str) -> bool;
}

struct NativeHosts<'a, R: Runtime> {
    app: &'a AppHandle<R>,
    state: &'a AppState,
}

impl<R: Runtime> SystemHosts for NativeHosts<'_, R> {
    fn is_current(&self, content: &str, write_mode: &str) -> bool {
        super::write::applied_content_matches(content, write_mode)
    }

    async fn apply(&self, content: &str) -> Result<ApplyOutcome, HostsApplyError> {
        commands::apply_aggregated_content(self.app, self.state, content)
            .await
            .map_err(|commands::ApplyPipelineError::Apply(error)| error)
    }

    fn matches(&self, content: &str) -> bool {
        super::write::system_hosts_matches(content)
    }
}

fn sync_error(reason: impl ToString) -> StorageError {
    StorageError::SideEffect {
        key: "hosts_content_sync".into(),
        reason: format!(
            "Hosts content was saved but could not be applied: {}",
            reason.to_string()
        ),
    }
}

async fn synchronize(state: &AppState, system: &impl SystemHosts) -> Result<(), StorageError> {
    let recovery = &state.application_recovery;
    let _apply_guard = recovery.lock_apply().await;
    state.require_data_dir_usable()?;
    // A renderer owns the write -> persist -> acknowledge sequence. Do not
    // overwrite it or clear its recovery state; finish/recovery drains us later.
    if recovery.is_pending() {
        return Ok(());
    }

    loop {
        let changes = std::mem::take(&mut *state.content_sync.0.lock().unwrap());
        if !changes.all && changes.ids.is_empty() {
            return Ok(());
        }
        let prepared = (|| {
            let (write_mode, dedup) = {
                let config = state.config.lock().unwrap();
                (config.write_mode.clone(), config.remove_duplicate_records)
            };
            let _store = state.lock_store()?;
            let manifest = crate::storage::manifest::Manifest::load(&state.paths)?;
            let sources = aggregate::selected_source_ids(&manifest.root);
            if !changes.all && !sources.iter().any(|id| changes.ids.contains(id)) {
                return Ok(None);
            }
            if write_mode.is_empty() {
                return Err(sync_error("select a write mode before applying"));
            }
            let content =
                aggregate::aggregate_selected_content(&manifest.root, &state.paths, dedup)?;
            Ok(Some((content, write_mode)))
        })();
        let (content, write_mode) = match prepared {
            Ok(Some(prepared)) => prepared,
            Ok(None) => continue,
            Err(error) => {
                state.content_sync.restore(changes);
                return Err(error);
            }
        };
        // Avoid duplicate prompts, histories and post-apply commands when a
        // renderer already applied the latest content before acknowledging it.
        if system.is_current(&content, &write_mode) {
            continue;
        }
        recovery.begin();
        let outcome = match system.apply(&content).await {
            Ok(outcome) => outcome,
            Err(error) => {
                state.content_sync.restore(changes);
                // The source is already saved. Keep Unknown so the existing
                // recovery UI can retry even if no further refresh changes it.
                return Err(sync_error(error));
            }
        };
        if recovery
            .finish_with(system.matches(&outcome.new_content))
            .is_some()
        {
            state.content_sync.restore(changes);
            return Err(sync_error(
                "system hosts changed during application; reapply the saved configuration",
            ));
        }
        // A source, group reference, or selection may have changed while an
        // elevation prompt/post-apply command was pending. Re-read it once more
        // under the same apply lock before declaring synchronization complete.
        state.content_sync.mark_all();
    }
}

#[cfg(test)]
mod tests;
