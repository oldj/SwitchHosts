//! No-window HTTP toggles own the entire apply/commit/compensate operation.
//! The system I/O boundary is replaceable so tests exercise the real storage
//! and recovery flow without changing the machine's hosts file.

use std::future::Future;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::commands;
use crate::hosts_apply::{
    self, recovery::ApplicationRecovery, write::ApplyOutcome, HostsApplyError,
};
use crate::storage::{
    manifest::{self, Manifest},
    transaction::{self, Target},
    tree_format::legacy_root_to_v5,
    AppState, StorageError,
};
use crate::tray;

pub(super) async fn apply_toggle_in_backend(
    app: &AppHandle<Wry>,
    id: &str,
) -> Result<(), ToggleError> {
    let state = app.state::<AppState>();
    let result = toggle(&state, id, &NativeHosts { app, state: &state }).await;
    // Publish failures too: compensation may restore the old file or leave a
    // recovery notice that a lazily created tray/main window must display.
    if let Err(error) = tray::refresh_title(app, &state) {
        log::warn!("failed to refresh tray title after backend toggle: {error}");
    }
    let _ = app.emit("system_hosts_updated", json!({ "_args": [] }));
    let _ = app.emit("tray_list_updated", json!({ "_args": [] }));
    result
}

trait SystemHosts: Sync {
    fn apply(
        &self,
        content: &str,
    ) -> impl Future<Output = Result<ApplyOutcome, HostsApplyError>> + Send;
    fn restore(
        &self,
        outcome: &ApplyOutcome,
    ) -> impl Future<Output = Result<(), HostsApplyError>> + Send;
    fn matches(&self, content: &str, original_bytes: Option<&[u8]>) -> bool;
}

struct NativeHosts<'a> {
    app: &'a AppHandle<Wry>,
    state: &'a AppState,
}

impl SystemHosts for NativeHosts<'_> {
    async fn apply(&self, content: &str) -> Result<ApplyOutcome, HostsApplyError> {
        commands::apply_aggregated_content(self.app, self.state, content)
            .await
            .map_err(|commands::ApplyPipelineError::Apply(error)| error)
    }

    async fn restore(&self, outcome: &ApplyOutcome) -> Result<(), HostsApplyError> {
        let previous = outcome.previous_content.clone();
        let expected = outcome.new_content.clone();
        let bytes = outcome.previous_bytes.clone();
        tauri::async_runtime::spawn_blocking(move || {
            hosts_apply::write::restore_system_hosts(&previous, &expected, Some(&bytes))
        })
        .await
        .unwrap_or_else(|error| {
            Err(HostsApplyError::Io {
                message: error.to_string(),
            })
        })
    }

    fn matches(&self, content: &str, original_bytes: Option<&[u8]>) -> bool {
        hosts_apply::write::system_hosts_matches_snapshot(content, original_bytes)
    }
}

async fn toggle(state: &AppState, id: &str, system: &impl SystemHosts) -> Result<(), ToggleError> {
    let recovery = &state.application_recovery;
    // Share serialization with renderer applies, and keep it through commit
    // and compensation. Queued requests must prepare from the previous commit.
    let _apply_guard = recovery.lock_apply().await;
    state.require_data_dir_usable()?;
    ensure_toggle_allowed(recovery)?;
    let selection = Selection::prepare(state, id)?;

    recovery.begin();
    let outcome = match system.apply(&selection.content).await {
        Ok(outcome) => outcome,
        Err(error) => {
            recovery.apply_failed();
            return Err(ToggleError::Apply(error));
        }
    };

    if let Err(error) = selection.commit(state) {
        match system.restore(&outcome).await {
            Ok(()) => {
                recovery.restored_with(
                    system.matches(&outcome.previous_content, Some(&outcome.previous_bytes)),
                );
                if recovery.is_pending() {
                    return Err(ToggleError::RecoveryRequired);
                }
                // The apply was rolled back; do not claim it is still applied.
                return Err(ToggleError::Storage(error.to_string()));
            }
            Err(restore_error) => {
                recovery.record(selection.proposed.root, outcome.new_content);
                recovery.inspect_and_notify(|content| system.matches(content, None), || {});
                return Err(ToggleError::Persist(format!(
                    "{error}; compensation failed: {restore_error}"
                )));
            }
        }
    }

    if recovery
        .finish_with(system.matches(&outcome.new_content, None))
        .is_some()
    {
        return Err(ToggleError::RecoveryRequired);
    }
    Ok(())
}

struct Selection {
    expected: Manifest,
    proposed: Manifest,
    content: String,
    remove_duplicate: bool,
}

impl Selection {
    fn prepare(state: &AppState, id: &str) -> Result<Self, ToggleError> {
        let (choice_mode, switch_folder, remove_duplicate, write_mode) = {
            let config = state.config.lock().expect("config mutex poisoned");
            (
                config.choice_mode as u64,
                config.multi_chose_folder_switch_all,
                config.remove_duplicate_records,
                config.write_mode.clone(),
            )
        };
        let _guard = state.lock_store()?;
        let expected = Manifest::load(&state.paths)?;
        let node = manifest::find_node(&expected.root, id).ok_or(ToggleError::NotFound)?;
        // There is no renderer to open the write-mode picker. Never default
        // an unset preference to overwriting the system file.
        if write_mode.is_empty() {
            return Err(ToggleError::WriteModeUnset);
        }
        let on = node.get("on").and_then(Value::as_bool).unwrap_or(false);
        let mut proposed = expected.clone();
        manifest::set_on_state_of_item(&mut proposed.root, id, !on, choice_mode, switch_folder);
        let content = hosts_apply::aggregate_selected_content(
            &proposed.root,
            &state.paths,
            remove_duplicate,
        )?;
        Ok(Self {
            expected,
            proposed,
            content,
            remove_duplicate,
        })
    }

    fn commit(&self, state: &AppState) -> Result<(), StorageError> {
        let _guard = state.lock_store()?;
        let current = Manifest::load(&state.paths)?;
        if legacy_root_to_v5(&current.root) != legacy_root_to_v5(&self.expected.root)
            || hosts_apply::aggregate_selected_content(
                &self.proposed.root,
                &state.paths,
                self.remove_duplicate,
            )? != self.content
        {
            // Local edits can change content without changing the manifest.
            // Do not label either a changed tree or changed sources as applied.
            return Err(StorageError::Conflict {
                reason: "The hosts selection changed during application. Retry the toggle.".into(),
            });
        }
        transaction::run(&state.paths, vec![Target::State, Target::Manifest], || {
            self.proposed.save(&state.paths)
        })
    }
}

pub(super) fn ensure_toggle_allowed(recovery: &ApplicationRecovery) -> Result<(), ToggleError> {
    if recovery.is_pending() {
        Err(ToggleError::RecoveryRequired)
    } else {
        Ok(())
    }
}

#[derive(Debug)]
pub(super) enum ToggleError {
    NotFound,
    RecoveryRequired,
    WriteModeUnset,
    Apply(HostsApplyError),
    /// The write could neither be committed nor compensated.
    Persist(String),
    Storage(String),
}

impl From<StorageError> for ToggleError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error.to_string())
    }
}

impl ToggleError {
    pub(super) fn as_body(&self) -> &'static str {
        match self {
            Self::NotFound => "not found.",
            Self::RecoveryRequired => "recovery required.",
            Self::WriteModeUnset => "write mode not set.",
            Self::Apply(HostsApplyError::Cancelled) => "cancelled.",
            Self::Apply(_) | Self::Storage(_) => "apply failed.",
            Self::Persist(_) => "applied but not persisted.",
        }
    }
}

impl std::fmt::Display for ToggleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "hosts entry not found"),
            Self::RecoveryRequired => write!(f, "resolve the pending hosts application first"),
            Self::WriteModeUnset => write!(f, "write mode is not set"),
            Self::Apply(error) => write!(f, "{error}"),
            Self::Persist(error) => write!(f, "applied but failed to persist the tree: {error}"),
            Self::Storage(error) => write!(f, "{error}"),
        }
    }
}

#[cfg(test)]
mod tests;
