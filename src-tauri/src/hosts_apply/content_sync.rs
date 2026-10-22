//! Backend-owned content synchronization, independent of any webview.
//! Changes are queued at the storage commit boundary. A pending renderer apply
//! defers them until acknowledgement/recovery; a failed write retains them.

use std::collections::HashSet;
use std::future::Future;
use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};

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
    after_apply: bool,
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
        // A read-only preservation must not cancel an earlier confirmed
        // selection apply whose reconciliation failed. Keep after_apply until
        // that outstanding work succeeds; mark_all itself never grants it.
        self.0.lock().unwrap().all = true;
    }

    /// A confirmed selection apply owns its system content, including removing
    /// it if the saved selection became empty before acknowledgement.
    pub(crate) fn mark_after_apply(&self) {
        let mut pending = self.0.lock().unwrap();
        pending.all = true;
        pending.after_apply = true;
    }

    fn restore(&self, changes: Changes) {
        let mut pending = self.0.lock().unwrap();
        pending.ids.extend(changes.ids);
        pending.all |= changes.all;
        pending.after_apply |= changes.after_apply;
    }
}

fn dirty_path(state: &AppState) -> std::path::PathBuf {
    state.paths.internal.join("pending-content-sync.json")
}

fn read_dirty(state: &AppState) -> Result<HashSet<String>, StorageError> {
    let path = dirty_path(state);
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| StorageError::parse(path.display().to_string(), error)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(HashSet::new()),
        Err(error) => Err(StorageError::io(path.display().to_string(), error)),
    }
}

/// Caller holds store_lock. Persist intent before find writes any entry: a
/// process exit anywhere after this point leaves enough information to retry
/// from the saved manifest, including a partially committed replace-all.
pub(crate) fn persist_find_changes<'a>(
    state: &AppState,
    ids: impl IntoIterator<Item = &'a str>,
) -> Result<HashSet<String>, StorageError> {
    let ids: HashSet<String> = ids.into_iter().map(str::to_owned).collect();
    if ids.is_empty() {
        return Ok(HashSet::new());
    }
    let mut pending = read_dirty(state).inspect_err(|_| {
        // Runtime damage must expose the same recovery path as startup damage.
        // Keep the unreadable record until explicit reconciliation succeeds.
        state.content_sync.mark_all();
        state.application_recovery.require_reconciliation();
    })?;
    let added = ids.difference(&pending).cloned().collect();
    pending.extend(ids);
    write_dirty(state, &pending)?;
    Ok(added)
}

fn write_dirty(state: &AppState, pending: &HashSet<String>) -> Result<(), StorageError> {
    let path = dirty_path(state);
    if pending.is_empty() {
        return match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(StorageError::io(path.display().to_string(), error)),
        };
    }
    let bytes = serde_json::to_vec(pending)
        .map_err(|error| StorageError::serialize(path.display().to_string(), error))?;
    crate::storage::atomic::atomic_write(&path, &bytes)?;
    // A writable handle also permits FlushFileBuffers on Windows.
    std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .and_then(|file| file.sync_all())
        .map_err(|error| StorageError::io(path.display().to_string(), error))
}

/// Caller still holds store_lock from persist through the entry writes. Remove
/// only new intents whose writes did not commit; preserve older and partial work.
pub(crate) fn discard_unwritten_find_changes(
    state: &AppState,
    added: &HashSet<String>,
    committed: &[String],
) -> Result<(), StorageError> {
    if added.is_empty() {
        return Ok(());
    }
    let mut pending = read_dirty(state)?;
    for id in added {
        if !committed.contains(id) {
            pending.remove(id);
        }
    }
    write_dirty(state, &pending)
}

/// Called only for the intended, recovered data root during startup.
pub(crate) fn resume_saved_changes(state: &AppState) -> Result<(), StorageError> {
    let _store = state.lock_store()?;
    for id in read_dirty(state)? {
        state.content_sync.mark(&id);
    }
    Ok(())
}

fn dirty_requires_quarantine(state: &AppState) -> Result<bool, StorageError> {
    match read_dirty(state) {
        Ok(_) => Ok(false),
        Err(StorageError::Parse { .. }) => Ok(true),
        Err(_) if dirty_path(state).is_dir() => Ok(true),
        // Permission and transient I/O failures must not discard unread intents.
        Err(error) => Err(error),
    }
}

fn quarantine_dirty(state: &AppState) -> Result<(), StorageError> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let path = dirty_path(state);
    let backup = path.with_file_name(format!(
        "pending-content-sync.invalid-{stamp}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::rename(&path, &backup)
        .map_err(|error| StorageError::io(path.display().to_string(), error))?;
    log::warn!(
        "invalid content-sync record preserved at {} after reconciliation",
        backup.display()
    );
    Ok(())
}

fn clear_dirty_if_idle(
    state: &AppState,
    reconciled_invalid_record: bool,
) -> Result<bool, StorageError> {
    // Serialize with persist -> source write -> mark. A newer committed source
    // must not lose its durable intent while an older apply is completing.
    let _store = state.lock_store()?;
    if state.content_sync.is_pending() {
        return Ok(false);
    }
    if dirty_requires_quarantine(state)? {
        if !reconciled_invalid_record {
            return Err(sync_error(
                "pending sync record became invalid; reapply saved settings",
            ));
        }
        quarantine_dirty(state)?;
        return Ok(true);
    }
    let path = dirty_path(state);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(StorageError::io(path.display().to_string(), error)),
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

/// Find commands report committed replacements immediately. A task owned by
/// the application (not the find webview) applies them and publishes recovery.
pub(crate) fn schedule<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    spawn_sync(async move {
        let state = app.state::<AppState>();
        let _ = apply_pending(&app, state.inner()).await;
    });
}

fn spawn_sync(
    task: impl Future<Output = ()> + Send + 'static,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(task)
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

    let dirty_check = (|| {
        let _store = state.lock_store()?;
        dirty_requires_quarantine(state)
    })();
    let quarantine = match dirty_check {
        Ok(invalid) => invalid,
        Err(error) => {
            state.content_sync.mark_all();
            recovery.finish_with(false);
            return Err(error);
        }
    };
    if quarantine {
        // The ids are unknowable. Reconcile the complete saved configuration
        // before moving the invalid record aside; never unblock find by losing it.
        state.content_sync.mark_all();
    }

    let mut wrote_content = false;
    loop {
        let changes = std::mem::take(&mut *state.content_sync.0.lock().unwrap());
        wrote_content |= changes.after_apply;
        if !changes.all && changes.ids.is_empty() {
            match clear_dirty_if_idle(state, quarantine) {
                Ok(true) => return Ok(()),
                Ok(false) => continue,
                Err(error) => {
                    state.content_sync.mark_all();
                    recovery.finish_with(false);
                    return Err(error);
                }
            }
        }
        let prepared = (|| {
            let (write_mode, dedup) = {
                let config = state.config.lock().unwrap();
                (config.write_mode.clone(), config.remove_duplicate_records)
            };
            let _store = state.lock_store()?;
            let manifest = crate::storage::manifest::Manifest::load(&state.paths)?;
            let sources = aggregate::selected_source_ids(&manifest.root);
            // An initially empty selection is not a request to clear system
            // hosts. If this pass already wrote selected content, however,
            // reconcile a concurrent deselection so that write is not left active.
            if sources.is_empty() && !wrote_content {
                return Ok(None);
            }
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
                // Acknowledgement may have just cleared an older apply. The
                // saved sources still need synchronization even if preparing
                // their content failed before we reached the native writer.
                recovery.finish_with(false);
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
                // Unlike a cancelled toggle, the source has already committed:
                // clearing recovery would hide the saved/system mismatch and
                // let periodic scans repeatedly reopen the authorization prompt.
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
        wrote_content = true;
        state.content_sync.mark_after_apply();
    }
}

#[cfg(test)]
mod tests;
