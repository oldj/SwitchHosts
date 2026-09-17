//! Toggling a hosts entry on or off without a renderer.
//!
//! The renderer normally owns this: `List/index.tsx::onToggleItem`
//! flips the node, applies the selection and persists the tree. But a
//! Tauri event with no listener is dropped, and there are supported
//! configurations with no main window — `hide_at_launch` skips window
//! creation at setup, and `lightweight_mode` destroys the window when
//! the user closes it. Callers that can be reached in those states need
//! to do the work themselves.
//!
//! This module is that backend-side equivalent, shared by every such
//! caller: the HTTP API's `/api/toggle` (which falls back to it when no
//! main window is alive) and the tray menu's per-entry check items
//! (which never involve a window at all). It reuses the renderer's own
//! selection rules (`manifest::set_on_state_of_item`) and the same
//! apply pipeline a UI-driven apply runs
//! (`commands::apply_aggregated_content`) rather than a bare write.

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::commands;
use crate::hosts_apply::{self, HostsApplyError};
use crate::lifecycle;
use crate::storage::{manifest, manifest::Manifest, AppState};
use crate::tray;

/// Serialises backend applies. Without it two concurrent toggles would
/// each stack an OS auth prompt and race to write the same files.
static BACKEND_APPLY_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Backend-side equivalent of the renderer's `onToggleItem`: flip the
/// node, apply through the same pipeline a UI-driven apply uses, then
/// persist the tree.
pub(crate) async fn apply_toggle<R: Runtime>(
    app: &AppHandle<R>,
    manifest: Manifest,
    id: &str,
    on: bool,
) -> Result<(), ToggleError> {
    // One backend apply at a time. The privileged write can sit on an OS
    // auth prompt indefinitely, and `cmd_after_hosts_apply` adds up to
    // 30s on top; letting requests overlap would stack prompts and make
    // the store races below unavoidable.
    let _apply_guard = BACKEND_APPLY_LOCK.lock().await;

    let app_state = app.state::<AppState>();
    app_state
        .require_data_dir_usable()
        .map_err(|e| ToggleError::Storage(e.to_string()))?;

    let (choice_mode, multi_chose_folder_switch_all, remove_duplicate, write_mode) = {
        let cfg = app_state.config.lock().expect("config mutex poisoned");
        (
            cfg.choice_mode as u64,
            cfg.multi_chose_folder_switch_all,
            cfg.remove_duplicate_records,
            cfg.write_mode.clone(),
        )
    };

    // The renderer refuses to apply before a write mode is chosen and
    // opens the picker instead (`onToggleItem` in List/index.tsx). A
    // caller with no UI to fall back on must refuse rather than silently
    // taking `apply_to_system_hosts`'s overwrite default — that would
    // wipe hand-written entries for anyone still carrying the empty
    // value from an Electron-era config.
    if write_mode.is_empty() {
        return Err(ToggleError::WriteModeUnset);
    }

    let mut proposed = manifest;
    manifest::set_on_state_of_item(
        &mut proposed.root,
        id,
        on,
        choice_mode,
        multi_chose_folder_switch_all,
    );

    let content =
        hosts_apply::aggregate_selected_content(&proposed.root, &app_state.paths, remove_duplicate)
            .map_err(|e| ToggleError::Storage(e.to_string()))?;

    commands::apply_aggregated_content(app, app_state.inner(), &content)
        .await
        .map_err(|commands::ApplyPipelineError::Apply(e)| ToggleError::Apply(e))?;

    // Re-read under the store lock and re-apply the flip, rather than
    // saving the tree we loaded before the write. The apply above can
    // block on an auth prompt for minutes, and the refresh scanner or a
    // tray window may have legitimately rewritten manifest.json in the
    // meantime — saving our stale snapshot would clobber that. Same
    // reasoning as the remote-refresh path in `refresh.rs`.
    {
        let _guard = app_state.store_lock.lock().expect("store lock poisoned");
        let mut fresh =
            Manifest::load(&app_state.paths).map_err(|e| ToggleError::Persist(e.to_string()))?;
        manifest::set_on_state_of_item(
            &mut fresh.root,
            id,
            on,
            choice_mode,
            multi_chose_folder_switch_all,
        );
        fresh
            .save(&app_state.paths)
            .map_err(|e| ToggleError::Persist(e.to_string()))?;
    }

    // `tray::refresh_title` reads manifest.json from disk, so the call
    // inside the apply pipeline saw the pre-toggle tree. Refresh again
    // now that the new one has landed, otherwise the menubar title
    // trails one toggle behind — and with no window open it is the only
    // place the user can see which profile is active.
    if let Err(e) = tray::refresh_title(app, app_state.inner()) {
        log::warn!("failed to refresh tray title after backend toggle: {e}");
    }
    // Mirrors the renderer's post-apply broadcast: a tray mini window is
    // built lazily and then reused, so without this its list keeps
    // showing the pre-toggle state. The channel name is the *value* of
    // `events.tray_list_updated` in `src/common/events.ts`, not the key
    // — they differ for this one event.
    let _ = app.emit("tray:list_updated", json!({ "_args": [] }));

    Ok(())
}

/// Entry point for the tray menu's per-entry check items.
///
/// Spawned rather than awaited: menu events arrive on the main thread,
/// and the privileged write can sit on an OS auth prompt for as long as
/// the user takes to answer it.
pub fn spawn_tray_toggle<R: Runtime + 'static>(app: &AppHandle<R>, id: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        toggle_from_tray(&app, &id).await;
    });
}

async fn toggle_from_tray<R: Runtime + 'static>(app: &AppHandle<R>, id: &str) {
    let state = app.state::<AppState>();

    // While the data directory is unavailable we're running on the
    // fallback root purely to show the recovery dialog. Toggling then
    // would apply the wrong data behind the user's back — send them to
    // the dialog instead, exactly like the tray icon's click handler.
    if state.data_dir_recovery.is_some() {
        lifecycle::show_main_window(app);
        return;
    }

    let manifest = match Manifest::load(&state.paths) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("failed to load the manifest for a tray toggle: {e}");
            return;
        }
    };
    let Some(node) = manifest::find_node(&manifest.root, id) else {
        // The menu was built from an older manifest — the entry has been
        // deleted since. Rebuild so the stale item disappears.
        tray::refresh_menu(app);
        return;
    };
    let on = !node
        .get("on")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);

    match apply_toggle(app, manifest, id, on).await {
        Ok(()) => {
            // Keep any open window in step. Folder and choice-mode rules
            // can flip more than the entry that was clicked, so the list
            // reloads rather than patching the one row — the explicit
            // status broadcast bypasses `Tree`'s deep-equal memo, which
            // can otherwise swallow the change.
            let _ = app.emit("set_hosts_on_status", json!({ "_args": [id, on] }));
            let _ = app.emit("reload_list", json!({ "_args": [] }));
        }
        Err(ToggleError::WriteModeUnset) => {
            // Unlike the HTTP API, the tray can fall back on a UI: show
            // the picker the renderer would have shown. Best effort —
            // if the main window has to be built first, it may come up
            // after this broadcast, and the user simply toggles again.
            lifecycle::show_main_window(app);
            let _ = app.emit(
                "show_set_write_mode",
                json!({ "_args": [{ "id": id, "on": on }] }),
            );
        }
        Err(ToggleError::Apply(HostsApplyError::Cancelled)) => {
            log::info!("tray toggle cancelled by the user: {id}");
        }
        Err(e) => log::warn!("tray toggle failed for {id}: {e}"),
    }

    // Always rebuild: the OS flips a check item's mark on click, so a
    // failed or cancelled apply would otherwise leave the menu claiming
    // a state the hosts file doesn't have.
    tray::refresh_menu(app);
}

/// Why a backend toggle failed. Kept distinct so callers can say which,
/// instead of collapsing a user-cancelled prompt, a policy denial and a
/// full disk into one opaque string.
pub(crate) enum ToggleError {
    WriteModeUnset,
    Apply(HostsApplyError),
    /// The write succeeded but the tree could not be persisted — the
    /// system file and manifest.json now disagree.
    Persist(String),
    Storage(String),
}

impl std::fmt::Display for ToggleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToggleError::WriteModeUnset => write!(f, "write mode is not set"),
            ToggleError::Apply(e) => write!(f, "{e}"),
            ToggleError::Persist(e) => write!(f, "applied but failed to persist the tree: {e}"),
            ToggleError::Storage(e) => write!(f, "{e}"),
        }
    }
}
