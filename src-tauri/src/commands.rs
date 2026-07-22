//! Tauri commands.
//!
//! Phase 1A stubs landed everything as `_args: Vec<serde_json::Value>`
//! returning fixtures. Phase 1B steps progressively replace stubs with
//! real implementations backed by the `storage` module.
//!
//! Convention: every command accepts `args: Vec<serde_json::Value>` to
//! match the positional-argument marshalling the front-end adapter uses
//! (`src/renderer/core/agent.ts` sends `invoke(cmd, { args: params })`).
//! Commands also take a `State<'_, AppState>` when they need shared
//! storage access.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

use crate::app_menu;
use crate::find::{self, FindHistoryEntry, FindOptions};
use crate::hosts_apply::{self, ApplyHistoryItem, HostsApplyError};
use crate::http;
use crate::http_api;
use crate::import_export;
use crate::lifecycle::{self, MAIN_WINDOW_LABEL};
use crate::refresh::{self, RefreshOutcome};
use crate::storage::{
    data_dir_pointer, entries, fs_copy,
    manifest::{self, Manifest},
    paths, AppConfig, AppState, StorageError, Trashcan,
};
use crate::tray;

/// Per-process counter so apply-history ids generated within the
/// same nanosecond are still unique. Cheap, opaque, never compared
/// across machines or runs — adequate for journal entries.
static APPLY_HISTORY_COUNTER: AtomicU64 = AtomicU64::new(0);

fn make_history_id(now_ms: i64) -> String {
    let seq = APPLY_HISTORY_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("apply_{now_ms}_{seq}")
}

type Args = Vec<Value>;

// ---- small helpers ---------------------------------------------------------

fn load_manifest(state: &AppState) -> Result<Manifest, StorageError> {
    Manifest::load(&state.paths)
}

fn save_manifest(state: &AppState, m: &Manifest) -> Result<(), StorageError> {
    m.save(&state.paths)
}

fn load_trashcan(state: &AppState) -> Result<Trashcan, StorageError> {
    Trashcan::load(&state.paths.trashcan_file)
}

fn save_trashcan(state: &AppState, t: &Trashcan) -> Result<(), StorageError> {
    t.save(&state.paths.trashcan_file)
}

fn arg_str<'a>(args: &'a Args, index: usize, field: &'static str) -> Result<&'a str, StorageError> {
    args.get(index)
        .and_then(Value::as_str)
        .ok_or_else(|| StorageError::InvalidConfigValue {
            key: field.into(),
            reason: format!("expected a string at args[{index}]"),
        })
}

// ---- startup critical ------------------------------------------------------

#[tauri::command]
pub async fn ping(_args: Args) -> Value {
    json!("pong")
}

#[tauri::command]
pub async fn get_basic_data(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let manifest = load_manifest(&state)?;
    let trashcan = load_trashcan(&state)?;
    Ok(json!({
        "list": manifest.root,
        "trashcan": trashcan.items,
        "version": env!("SWH_VERSION"),
    }))
}

#[tauri::command]
pub async fn migration_status(_args: Args) -> Value {
    // In v5, PotDb → v5 migration runs once inside `AppState::bootstrap`
    // before the renderer is ever served. By the time this command is
    // reachable from the renderer, migration has already been attempted
    // (and either applied or skipped). Returning `false` tells the old
    // Electron-era `actions.migrateCheck()` caller in index.tsx that it
    // should not prompt the user — which is what we want in v5.
    json!(false)
}

#[tauri::command]
pub async fn dark_mode_toggle<R: Runtime>(app: AppHandle<R>, args: Args) -> Value {
    let theme_str = args.first().and_then(Value::as_str).unwrap_or("system");
    let theme = match theme_str {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None, // "system" → follow OS
    };
    // Set theme on all known windows so native title bars match
    for label in [
        lifecycle::MAIN_WINDOW_LABEL,
        crate::tray::TRAY_WINDOW_LABEL,
        crate::find::FIND_WINDOW_LABEL,
    ] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_theme(theme);
        }
    }
    Value::Null
}

// ---- config ----------------------------------------------------------------

#[tauri::command]
pub async fn config_all(state: State<'_, AppState>, _args: Args) -> Result<Value, StorageError> {
    let cfg = state.config.lock().expect("config mutex poisoned");
    Ok(cfg.to_flat_value())
}

#[tauri::command]
pub async fn config_get(state: State<'_, AppState>, args: Args) -> Result<Value, StorageError> {
    let key =
        args.first()
            .and_then(Value::as_str)
            .ok_or_else(|| StorageError::InvalidConfigValue {
                key: "<arg0>".into(),
                reason: "config_get requires a string key as the first argument".into(),
            })?;
    let cfg = state.config.lock().expect("config mutex poisoned");
    Ok(cfg.get_key(key).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn config_set(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let key = args
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| StorageError::InvalidConfigValue {
            key: "<arg0>".into(),
            reason: "config_set requires a string key as the first argument".into(),
        })?
        .to_string();
    let value = args.get(1).cloned().unwrap_or(Value::Null);

    let patch = json!({ key: value });
    let touched = commit_config_patch(&app, state.inner(), &patch)?;
    let touched_refs: Vec<&str> = touched.iter().map(String::as_str).collect();
    apply_side_effects(&app, state.inner(), &touched_refs);
    Ok(Value::Null)
}

#[tauri::command]
pub async fn config_update(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let patch = args.first().cloned().unwrap_or(Value::Null);
    if patch.is_null() {
        return Err(StorageError::InvalidConfigValue {
            key: "<arg0>".into(),
            reason: "config_update requires a partial object as the first argument".into(),
        });
    }
    let touched = commit_config_patch(&app, state.inner(), &patch)?;
    let touched_refs: Vec<&str> = touched.iter().map(String::as_str).collect();
    apply_side_effects(&app, state.inner(), &touched_refs);
    Ok(Value::Null)
}

fn commit_config_patch(
    app: &AppHandle<Wry>,
    state: &AppState,
    patch: &Value,
) -> Result<Vec<String>, StorageError> {
    let patch_obj = patch
        .as_object()
        .ok_or_else(|| StorageError::InvalidConfigValue {
            key: "<patch>".into(),
            reason: "expected a JSON object".into(),
        })?;
    let touched: Vec<String> = patch_obj.keys().cloned().collect();

    // Tauri runs async commands concurrently on tokio, so two
    // `config_update` invocations can otherwise interleave and lose
    // each other's writes. Hold this guard across the entire commit
    // pipeline — it serializes writers without blocking readers that
    // only touch `state.config`.
    let _commit_guard = state
        .config_write_lock
        .lock()
        .expect("config write lock poisoned");

    // Step 1: under a short cfg lock, derive the proposed `next` value
    // and remember whether launch_at_login is changing. We deliberately
    // do not hold the cfg mutex across OS calls or disk writes; the
    // outer `_commit_guard` provides ordering, the inner cfg mutex only
    // needs to cover the read-modify view and the final publish.
    let (next, previous_launch_at_login, launch_at_login_changed) = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        let mut next: AppConfig = cfg.clone();
        next.apply_partial(patch)?;
        // `apply_partial` only mutates fields named in the patch, so a
        // value-level diff is sufficient — no need to also scan `touched`.
        let changed = cfg.launch_at_login != next.launch_at_login;
        (next, cfg.launch_at_login, changed)
    };

    // Step 2: apply the OS-side change first, then persist to disk. If
    // disk persistence fails, roll the OS change back so the user-visible
    // state matches what got stored.
    if launch_at_login_changed {
        apply_launch_at_login(app, next.launch_at_login)?;
    }
    if let Err(e) = next.save(&state.paths.config_file) {
        if launch_at_login_changed {
            if let Err(rollback_err) = apply_launch_at_login(app, previous_launch_at_login) {
                log::warn!(
                    "failed to roll back launch_at_login after config save failed: {rollback_err}"
                );
            }
        }
        return Err(e);
    }

    // Step 3: re-acquire the lock briefly to publish the new value.
    *state.config.lock().expect("config mutex poisoned") = next;

    Ok(touched)
}

fn apply_launch_at_login(app: &AppHandle<Wry>, enabled: bool) -> Result<(), StorageError> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };

    result.map_err(|e| StorageError::SideEffect {
        key: "launch_at_login".into(),
        reason: e.to_string(),
    })?;

    // Keep AppKit from restoring a second instance on login when the
    // LaunchAgent is already responsible for starting the app.
    lifecycle::apply_launch_at_login_relaunch_policy(app, enabled);
    Ok(())
}

/// Run any out-of-process side effects that depend on a config key
/// just changing. Currently:
///
/// - `http_api_on` / `http_api_only_local` → start, stop or rebind
///   the local HTTP API server.
/// - `locale` → rebuild native application and tray menus.
/// - `show_title_on_tray` → refresh or clear the tray title text.
/// - `hide_dock_icon` → apply the macOS Dock policy and update the tray
///   toggle label.
///
/// Always reads the *fresh* config snapshot rather than trusting the
/// patch, so a rebind picks up both keys even if only one of them was
/// in the patch.
///
/// Pinned to `Wry` because the HTTP API server is itself pinned to
/// `Wry` (see the comment in `http_api.rs`).
fn apply_side_effects(app: &AppHandle<Wry>, state: &AppState, touched_keys: &[&str]) {
    let touches_http_api = touched_keys
        .iter()
        .any(|k| *k == "http_api_on" || *k == "http_api_only_local");
    let touches_locale = touched_keys.iter().any(|k| *k == "locale");
    let touches_tray_title = touched_keys.iter().any(|k| *k == "show_title_on_tray");
    let touches_auto_update = touched_keys.iter().any(|k| *k == "auto_check_update");

    if touches_locale {
        if let Err(e) = app_menu::refresh(app) {
            log::warn!("failed to refresh app menu: {e}");
        }
        tray::refresh_menu(app);
        find::refresh_find_window_title(app);
    }

    if touches_tray_title {
        if let Err(e) = tray::refresh_title(app, state) {
            log::warn!("failed to refresh tray title after config update: {e}");
        }
    }

    #[cfg(target_os = "macos")]
    {
        let touches_hide_dock_icon = touched_keys.iter().any(|k| *k == "hide_dock_icon");
        if touches_hide_dock_icon {
            let hide = {
                let cfg = state.config.lock().expect("config mutex poisoned");
                cfg.hide_dock_icon
            };
            lifecycle::apply_dock_icon_policy(app, hide);
            tray::refresh_menu(app);
        }
    }

    if touches_http_api {
        let (on, only_local) = {
            let cfg = state.config.lock().expect("config mutex poisoned");
            (cfg.http_api_on, cfg.http_api_only_local)
        };
        if on {
            if let Err(e) = http_api::start(app.clone(), only_local) {
                log::warn!("http_api start failed: {e}");
                // Roll back the in-memory config + persist, otherwise
                // the preferences pane keeps reporting "API on" against
                // a dead listener. Acquire the writer guard so this
                // rollback doesn't race a concurrent `commit_config_patch`
                // — `apply_side_effects` runs after the commit guard has
                // already been released, so without this we could lose
                // each other's writes. Lock scope ends before
                // persist_config because that helper takes config mutex.
                let _commit_guard = state
                    .config_write_lock
                    .lock()
                    .expect("config write lock poisoned");
                {
                    let mut cfg = state.config.lock().expect("config mutex poisoned");
                    cfg.http_api_on = false;
                }
                if let Err(save_err) = state.persist_config() {
                    log::warn!("failed to persist http_api_on rollback: {save_err}");
                }
                let _ = app.emit("http_api_start_failed", json!({ "_args": [e] }));
            }
        } else {
            http_api::stop();
        }
    }

    if touches_auto_update {
        let enabled = {
            let cfg = state.config.lock().expect("config mutex poisoned");
            cfg.auto_check_update
        };
        if enabled {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                run_auto_update_check(&app).await;
            });
        }
    }
}

// ---- list / tree -----------------------------------------------------------

#[tauri::command]
pub async fn get_list(state: State<'_, AppState>, _args: Args) -> Result<Value, StorageError> {
    let m = load_manifest(&state)?;
    Ok(Value::Array(m.root))
}

#[tauri::command]
pub async fn get_item_from_list(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    let id = arg_str(&args, 0, "id")?;
    let m = load_manifest(&state)?;
    Ok(manifest::find_node(&m.root, id).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn get_content_of_list(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    // The renderer hands us its current in-memory list as args[0]; we
    // intentionally do NOT re-read manifest.json here. The Apply button
    // is supposed to write whatever the user is looking at, including
    // edits that haven't yet been persisted via set_list.
    let list_value = args.into_iter().next().unwrap_or(Value::Null);
    let list: Vec<Value> = match list_value {
        Value::Array(arr) => arr,
        Value::Null => Vec::new(),
        _ => {
            return Err(StorageError::InvalidConfigValue {
                key: "get_content_of_list.args[0]".into(),
                reason: "expected an array of host nodes".into(),
            });
        }
    };

    let remove_duplicate = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.remove_duplicate_records
    };

    let content = hosts_apply::aggregate_selected_content(&list, &state.paths, remove_duplicate)?;
    Ok(json!(content))
}

#[tauri::command]
pub async fn set_list(app: AppHandle<Wry>, state: State<'_, AppState>, args: Args) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let list = args.into_iter().next().unwrap_or(Value::Null);
    let root = match list {
        Value::Array(arr) => arr,
        Value::Null => Vec::new(),
        _ => {
            return Err(StorageError::InvalidConfigValue {
                key: "set_list.args[0]".into(),
                reason: "expected an array of host nodes".into(),
            });
        }
    };
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    let mut m = load_manifest(&state).unwrap_or_default();
    m.root = root;
    save_manifest(&state, &m)?;
    tray::refresh_menu(&app);
    Ok(Value::Null)
}

#[tauri::command]
pub async fn move_to_trashcan(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let id = arg_str(&args, 0, "id")?.to_string();
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    move_ids_to_trashcan(&state, &[id])?;
    tray::refresh_menu(&app);
    Ok(Value::Null)
}

#[tauri::command]
pub async fn move_many_to_trashcan(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let ids_value = args.into_iter().next().unwrap_or(Value::Null);
    let ids: Vec<String> = match ids_value {
        Value::Array(arr) => arr
            .into_iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => {
            return Err(StorageError::InvalidConfigValue {
                key: "move_many_to_trashcan.args[0]".into(),
                reason: "expected an array of ids".into(),
            });
        }
    };
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    move_ids_to_trashcan(&state, &ids)?;
    tray::refresh_menu(&app);
    Ok(Value::Null)
}

fn move_ids_to_trashcan(state: &AppState, ids: &[String]) -> Result<(), StorageError> {
    let mut m = load_manifest(state).unwrap_or_default();
    let mut t = load_trashcan(state).unwrap_or_default();
    for id in ids {
        if let Some((node, parent_id)) = manifest::remove_node(&mut m.root, id) {
            t.add_item(node, parent_id);
        }
    }
    save_manifest(state, &m)?;
    save_trashcan(state, &t)?;
    Ok(())
}

#[tauri::command]
pub async fn get_trashcan_list(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let t = load_trashcan(&state)?;
    Ok(Value::Array(t.items))
}

#[tauri::command]
pub async fn clear_trashcan(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    let mut t = load_trashcan(&state).unwrap_or_default();

    // Collect all content ids from every trashcan item before clearing,
    // then delete the corresponding entries/<id>.hosts files.
    let mut content_ids = Vec::new();
    for item in &t.items {
        if let Some(data) = item.get("data") {
            manifest::collect_content_ids(std::slice::from_ref(data), &mut content_ids);
        }
    }
    for cid in &content_ids {
        let _ = entries::delete_entry(&state.paths.entries_dir, cid);
    }

    t.items.clear();
    save_trashcan(&state, &t)?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn delete_item_from_trashcan(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let id = arg_str(&args, 0, "id")?.to_string();
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    let mut t = load_trashcan(&state).unwrap_or_default();
    let removed_item = t.remove_item(&id);
    save_trashcan(&state, &t)?;

    // Clean up entries/<id>.hosts files for the permanently deleted item
    // (and any children if it was a folder).
    if let Some(item) = &removed_item {
        if let Some(data) = item.get("data") {
            let mut content_ids = Vec::new();
            manifest::collect_content_ids(std::slice::from_ref(data), &mut content_ids);
            for cid in &content_ids {
                let _ = entries::delete_entry(&state.paths.entries_dir, cid);
            }
        }
    }

    Ok(json!(removed_item.is_some()))
}

#[tauri::command]
pub async fn restore_item_from_trashcan(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let id = arg_str(&args, 0, "id")?.to_string();
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    let mut t = load_trashcan(&state).unwrap_or_default();
    let item = match t.remove_item(&id) {
        Some(item) => item,
        None => return Ok(json!(false)),
    };

    let parent_id = item
        .get("parent_id")
        .and_then(Value::as_str)
        .map(String::from);
    let node = item.get("data").cloned().unwrap_or(Value::Null);
    if node.is_null() {
        // Trashcan entry was malformed — save the (now-shorter)
        // trashcan and report failure so the UI shows an error.
        save_trashcan(&state, &t)?;
        return Ok(json!(false));
    }

    let mut m = load_manifest(&state).unwrap_or_default();
    manifest::insert_node(&mut m.root, node, parent_id.as_deref());
    save_manifest(&state, &m)?;
    save_trashcan(&state, &t)?;
    tray::refresh_menu(&app);
    Ok(json!(true))
}

// ---- hosts content ---------------------------------------------------------

#[tauri::command]
pub async fn get_hosts_content(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    let id = arg_str(&args, 0, "id")?;
    let content = entries::read_entry(&state.paths.entries_dir, id)?;
    Ok(json!(content))
}

#[tauri::command]
pub async fn set_hosts_content(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let id = arg_str(&args, 0, "id")?.to_string();
    let content = args
        .get(1)
        .and_then(Value::as_str)
        .ok_or_else(|| StorageError::InvalidConfigValue {
            key: "set_hosts_content.args[1]".into(),
            reason: "expected a string content at args[1]".into(),
        })?
        .to_string();
    entries::write_entry(&state.paths.entries_dir, &id, &content)?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn get_system_hosts(_args: Args) -> Result<Value, StorageError> {
    let path = system_hosts_path()?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(json!(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!("")),
        Err(e) => Err(StorageError::io(path.display().to_string(), e)),
    }
}

#[tauri::command]
pub async fn get_path_of_system_hosts(_args: Args) -> Result<Value, StorageError> {
    Ok(json!(system_hosts_path()?.display().to_string()))
}

fn system_hosts_path() -> Result<PathBuf, StorageError> {
    hosts_apply::write::system_hosts_path().map_err(|e| StorageError::Io {
        path: "system hosts path".to_string(),
        reason: e.to_string(),
    })
}

// ---- apply / refresh -------------------------------------------------------

#[tauri::command]
pub async fn apply_hosts_selection<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    // args[0] = content (string, already aggregated by get_content_of_list).
    // No further args are read — OS-native elevation handles credentials,
    // so the legacy `{ sudo_pswd }` options object from the Electron port
    // has been removed renderer-side.
    let content = match args.first().and_then(Value::as_str) {
        Some(s) => s.to_string(),
        None => {
            return Ok(json!({
                "success": false,
                "code": "fail",
                "message": "apply_hosts_selection: args[0] must be a string",
            }));
        }
    };

    Ok(apply_aggregated_content(&app, state.inner(), content).await)
}

/// Apply already-aggregated hosts content to the system file, persist
/// apply history, refresh the tray title, and run cmd-after-apply.
/// Shared by the renderer-driven `apply_hosts_selection` command and
/// the backend-only tray toggle path so both traverse an identical
/// pipeline. Returns the renderer-facing result `Value`.
pub async fn apply_aggregated_content<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    content: String,
) -> Value {
    let (write_mode, history_limit, cmd_after_apply) = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        (
            cfg.write_mode.clone(),
            cfg.history_limit as i32,
            cfg.cmd_after_hosts_apply.clone(),
        )
    };

    // The privileged write is potentially long-running (waits for the
    // user at the OS auth prompt) and *must not* hold the store_lock —
    // see implementation-notes A5. We do all the work outside the lock
    // and only retake it for the history journal write below.
    let outcome = match hosts_apply::apply_to_system_hosts(&content, &write_mode) {
        Ok(o) => o,
        Err(HostsApplyError::Cancelled) => {
            return HostsApplyError::Cancelled.into_renderer_value();
        }
        Err(e) => {
            log::warn!("apply failed: {e}");
            return e.into_renderer_value();
        }
    };

    // Persist apply history (mirrors Electron behaviour: insert
    // previous content first if it differs from the last entry, then
    // insert the new content). Skip the journal updates entirely when
    // the file was already up-to-date — we don't want a noop apply
    // to spam the history.
    if !outcome.unchanged {
        let history_path = state.paths.histories_dir.join("system-hosts.json");
        let now_ms = chrono::Utc::now().timestamp_millis();

        // Step 1: previous content, only if not redundant.
        let existing = hosts_apply::history::load(&history_path).unwrap_or_default();
        let last_content = existing.last().map(|i| i.content.as_str());
        if last_content != Some(outcome.previous_content.as_str()) {
            let item = ApplyHistoryItem {
                id: make_history_id(now_ms),
                content: outcome.previous_content.clone(),
                add_time_ms: now_ms,
                label: None,
            };
            if let Err(e) = hosts_apply::history::insert(&history_path, item, history_limit) {
                log::warn!("failed to write previous content history: {e}");
            }
        }

        // Step 2: new content.
        let new_item = ApplyHistoryItem {
            id: make_history_id(now_ms),
            content: outcome.new_content.clone(),
            add_time_ms: now_ms,
            label: None,
        };
        if let Err(e) = hosts_apply::history::insert(&history_path, new_item, history_limit) {
            log::warn!("failed to write new content history: {e}");
        }
    }

    // Notify any listening windows that the system file has changed.
    // Editor.HostsEditor refreshes the system view; tray refreshes its
    // selection display. Wrapped in the standard `_args` envelope.
    let _ = app.emit("system_hosts_updated", json!({ "_args": [] }));

    // Push the freshest tray title to the menubar without waiting on
    // the renderer to call `update_tray_title` — the user expects to
    // see the title flip immediately after an apply.
    if let Err(e) = tray::refresh_title(app, state) {
        log::warn!("failed to refresh tray title: {e}");
    }

    // Run `cmd_after_hosts_apply` (if configured) as the current user
    // — never elevated. We deliberately await it inside this command
    // so the renderer's existing `await actions.setSystemHosts(...)`
    // call site can show "running" state without changes; the 30s
    // timeout in the runner caps the wait. The result is appended to
    // its own journal and broadcast as `cmd_run_result`.
    if let Some(result) = hosts_apply::cmd_runner::run(&cmd_after_apply).await {
        let cmd_history_path = state.paths.histories_dir.join("cmd-after-apply.json");
        if let Err(e) = hosts_apply::cmd_runner::insert(&cmd_history_path, result.clone()) {
            log::warn!("failed to persist cmd-after-apply history: {e}");
        }
        match serde_json::to_value(&result) {
            Ok(payload) => {
                let _ = app.emit("cmd_run_result", json!({ "_args": [payload] }));
            }
            Err(e) => {
                log::warn!("failed to serialise cmd-after-apply result: {e}");
            }
        }
    }

    json!({
        "success": true,
        "old_content": outcome.previous_content,
        "new_content": outcome.new_content,
    })
}

/// Toggle a single hosts item's on-state from a native tray-menu click
/// and apply the result to the system — entirely in the backend, with
/// no dependency on any webview being alive. This is what makes tray
/// toggling work in lightweight mode where the main window has been
/// destroyed.
///
/// Runs the mutation + apply on a background task (the privileged write
/// may block at the OS auth prompt) and mirrors the renderer's
/// `onToggleItem` gate: when no write mode is configured we can't apply
/// silently, so we surface the main window instead.
pub fn toggle_host_from_tray<R: Runtime>(app: &AppHandle<R>, id: &str, on: bool) {
    let state = app.state::<AppState>();
    let write_mode_empty = state
        .config
        .lock()
        .map(|c| c.write_mode.is_empty())
        .unwrap_or(true);
    if write_mode_empty {
        // No write mode configured — can't silently apply. Surface the
        // main window (and ask it to prompt) like the renderer does.
        lifecycle::show_main_window(app);
        let _ = app.emit("show_set_write_mode", json!({ "_args": [{ "id": id, "on": on }] }));
        return;
    }

    let app = app.clone();
    let id = id.to_string();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = toggle_host_and_apply(&app, &id, on).await {
            log::warn!("tray toggle failed: {e}");
        }
    });
}

async fn toggle_host_and_apply<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    on: bool,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.require_data_dir_usable().map_err(|e| e.to_string())?;

    let (choice_mode, multi_switch_all, remove_duplicate) = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        (
            cfg.choice_mode,
            cfg.multi_chose_folder_switch_all,
            cfg.remove_duplicate_records,
        )
    };

    // Mutate the manifest on-state under the store lock, then release it
    // before the potentially long-blocking privileged system write.
    let new_list = {
        let _guard = state.store_lock.lock().expect("store lock poisoned");
        let mut m = load_manifest(&state).unwrap_or_default();
        manifest::set_on_state_of_item(&mut m.root, id, on, choice_mode, multi_switch_all);
        save_manifest(&state, &m).map_err(|e| e.to_string())?;
        m.root.clone()
    };

    let content =
        hosts_apply::aggregate_selected_content(&new_list, &state.paths, remove_duplicate)
            .map_err(|e| e.to_string())?;

    let _ = apply_aggregated_content(app, state.inner(), content).await;

    // Refresh tray menu checkmarks and let any live window reload its list.
    tray::refresh_menu(app);
    let _ = app.emit("reload_list", json!({ "_args": [] }));

    Ok(())
}

// ---- privileged helper (macOS SMAppService) --------------------------------
//
// Install / query / remove the root daemon that performs silent
// `/etc/hosts` writes. On non-macOS (or unsigned / pre-13 macOS) these
// report `not_supported` and the apply path keeps using AEWP/pkexec/UAC.

#[tauri::command]
pub async fn helper_status() -> Result<Value, String> {
    Ok(json!({ "status": hosts_apply::helper_admin::status().as_code() }))
}

#[tauri::command]
pub async fn helper_install() -> Result<Value, String> {
    match hosts_apply::helper_admin::register() {
        Ok(status) => Ok(json!({ "success": true, "status": status.as_code() })),
        Err(e) => Ok(json!({
            "success": false,
            "status": hosts_apply::helper_admin::status().as_code(),
            "message": e.to_string(),
        })),
    }
}

#[tauri::command]
pub async fn helper_repair() -> Result<Value, String> {
    match hosts_apply::helper_admin::repair() {
        Ok(status) => Ok(json!({ "success": true, "status": status.as_code() })),
        Err(e) => Ok(json!({
            "success": false,
            "status": hosts_apply::helper_admin::status().as_code(),
            "message": e.to_string(),
        })),
    }
}

#[tauri::command]
pub async fn helper_uninstall() -> Result<Value, String> {
    match hosts_apply::helper_admin::unregister() {
        Ok(()) => Ok(json!({
            "success": true,
            "status": hosts_apply::helper_admin::status().as_code(),
        })),
        Err(e) => Ok(json!({ "success": false, "message": e.to_string() })),
    }
}

#[tauri::command]
pub async fn helper_open_login_items() -> Value {
    // Open System Settings → Login Items & Extensions so the user can
    // approve / re-enable the background helper. Fixed URL, no caller
    // input — nothing to validate or inject.
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.LoginItems-Settings.extension")
            .spawn();
    }
    Value::Null
}

#[tauri::command]
pub async fn refresh_remote_hosts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let id = args
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| "refresh_remote_hosts: args[0] must be a string".to_string())?;
    match refresh::refresh_one(&app, state.inner(), id).await {
        Ok(RefreshOutcome::Updated { node }) | Ok(RefreshOutcome::Unchanged { node }) => {
            Ok(json!({ "success": true, "data": node }))
        }
        Err(e) => Ok(e.into_renderer_value()),
    }
}

#[tauri::command]
pub async fn refresh_all_remote_hosts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let results = refresh::refresh_all(&app, state.inner()).await;
    let payload: Vec<Value> = results
        .into_iter()
        .map(|(id, outcome)| match outcome {
            Ok(RefreshOutcome::Updated { node }) | Ok(RefreshOutcome::Unchanged { node }) => {
                json!({ "id": id, "success": true, "data": node })
            }
            Err(e) => {
                let mut v = e.into_renderer_value();
                if let Some(obj) = v.as_object_mut() {
                    obj.insert("id".to_string(), json!(id));
                }
                v
            }
        })
        .collect();
    Ok(Value::Array(payload))
}

#[tauri::command]
pub async fn get_apply_history(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let path = state.paths.histories_dir.join("system-hosts.json");
    let items = hosts_apply::history::load(&path)?;
    let value = serde_json::to_value(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    Ok(value)
}

#[tauri::command]
pub async fn delete_apply_history_item(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let id = arg_str(&args, 0, "id")?;
    let path = state.paths.histories_dir.join("system-hosts.json");
    let removed = hosts_apply::history::delete_by_id(&path, id)?;
    Ok(json!(removed))
}

// ---- cmd_after_hosts_apply history -----------------------------------------

#[tauri::command]
pub async fn cmd_get_history_list(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let path = state.paths.histories_dir.join("cmd-after-apply.json");
    let items = hosts_apply::cmd_runner::load(&path)?;
    let value = serde_json::to_value(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    Ok(value)
}

#[tauri::command]
pub async fn cmd_delete_history_item(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let id = arg_str(&args, 0, "id")?;
    let path = state.paths.histories_dir.join("cmd-after-apply.json");
    let removed = hosts_apply::cmd_runner::delete_by_id(&path, id)?;
    Ok(json!(removed))
}

#[tauri::command]
pub async fn cmd_clear_history(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let path = state.paths.histories_dir.join("cmd-after-apply.json");
    hosts_apply::cmd_runner::clear(&path)?;
    Ok(Value::Null)
}

// ---- find window -----------------------------------------------------------

#[tauri::command]
pub async fn find_show<R: Runtime + 'static>(
    app: AppHandle<R>,
    _args: Args,
) -> Result<Value, String> {
    find::show_find_window(&app).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn find_set_window_title<R: Runtime + 'static>(
    app: AppHandle<R>,
    args: Args,
) -> Result<Value, String> {
    let title = arg_str(&args, 0, "title").map_err(|e| format!("{e:?}"))?;
    find::set_find_window_title(&app, title).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn find_by(state: State<'_, AppState>, args: Args) -> Result<Value, String> {
    let keyword = args
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| "find_by: args[0] must be a string keyword".to_string())?
        .to_string();
    let options: FindOptions = match args.get(1) {
        Some(v) if !v.is_null() => serde_json::from_value(v.clone())
            .map_err(|e| format!("find_by: invalid options: {e}"))?,
        _ => FindOptions::default(),
    };
    let items = find::find_in_manifest(state.inner(), &keyword, &options)?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_replace_one(state: State<'_, AppState>, args: Args) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let request = args
        .into_iter()
        .next()
        .ok_or_else(|| "find_replace_one: args[0] must be a request object".to_string())
        .and_then(|v| {
            serde_json::from_value(v).map_err(|e| format!("find_replace_one: invalid request: {e}"))
        })?;
    let replaced = find::replace_one_in_manifest(state.inner(), request)?;
    Ok(json!(replaced))
}

#[tauri::command]
pub async fn find_replace_all(state: State<'_, AppState>, args: Args) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let keyword = args
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| "find_replace_all: args[0] must be a string keyword".to_string())?
        .to_string();
    let options: FindOptions = match args.get(1) {
        Some(v) if !v.is_null() => serde_json::from_value(v.clone())
            .map_err(|e| format!("find_replace_all: invalid options: {e}"))?,
        _ => FindOptions::default(),
    };
    let replace_to = args
        .get(2)
        .and_then(Value::as_str)
        .ok_or_else(|| "find_replace_all: args[2] must be a string replacement".to_string())?
        .to_string();

    let outcome = find::replace_all_in_manifest(state.inner(), &keyword, &options, &replace_to)?;
    serde_json::to_value(outcome).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_add_history(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let entry: FindHistoryEntry = match args.into_iter().next() {
        Some(v) => serde_json::from_value(v).map_err(|e| StorageError::InvalidConfigValue {
            key: "find_add_history.args[0]".into(),
            reason: e.to_string(),
        })?,
        None => {
            return Err(StorageError::InvalidConfigValue {
                key: "find_add_history.args[0]".into(),
                reason: "expected a FindHistoryEntry object".into(),
            });
        }
    };
    let all = find::add_find_history(state.inner(), entry)?;
    Ok(serde_json::to_value(all).map_err(|e| StorageError::serialize("find.json", e))?)
}

#[tauri::command]
pub async fn find_get_history(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let all = find::get_find_history(state.inner())?;
    Ok(serde_json::to_value(all).map_err(|e| StorageError::serialize("find.json", e))?)
}

#[tauri::command]
pub async fn find_set_history(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let items: Vec<FindHistoryEntry> = match args.into_iter().next() {
        Some(Value::Array(arr)) => arr
            .into_iter()
            .filter_map(|v| serde_json::from_value::<FindHistoryEntry>(v).ok())
            .collect(),
        _ => Vec::new(),
    };
    find::set_find_history(state.inner(), &items)?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn find_add_replace_history(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let value = arg_str(&args, 0, "find_add_replace_history")?.to_string();
    let all = find::add_replace_history(state.inner(), value)?;
    Ok(serde_json::to_value(all).map_err(|e| StorageError::serialize("replace.json", e))?)
}

#[tauri::command]
pub async fn find_get_replace_history(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let all = find::get_replace_history(state.inner())?;
    Ok(serde_json::to_value(all).map_err(|e| StorageError::serialize("replace.json", e))?)
}

#[tauri::command]
pub async fn find_set_replace_history(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    state.require_data_dir_usable()?;
    let items: Vec<String> = match args.into_iter().next() {
        Some(Value::Array(arr)) => arr
            .into_iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => Vec::new(),
    };
    find::set_replace_history(state.inner(), &items)?;
    Ok(Value::Null)
}

// ---- window / misc ---------------------------------------------------------

#[tauri::command]
pub async fn hide_main_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let quit_on_close = state
            .config
            .lock()
            .map(|cfg| cfg.quit_on_close)
            .unwrap_or(false);
        if quit_on_close {
            // Frameless Windows/Linux close button routes here; honour
            // quit-on-close the same way the macOS CloseRequested path does.
            lifecycle::quit_app(&app);
            return Ok(Value::Null);
        }

        let lightweight = state
            .config
            .lock()
            .map(|cfg| cfg.lightweight_mode)
            .unwrap_or(false);
        if lightweight {
            // Lightweight mode: mirror the native close-button path so
            // the lifecycle `CloseRequested` handler can destroy the
            // webview and arm the hide-to-tray state. On Windows/Linux
            // the main window is `decorations(false)` and the title-bar
            // close button is implemented in the renderer (TopBar), so
            // this command is the *only* entry point a user has to
            // close the window — calling `hide()` directly here would
            // silently bypass `lightweight_mode` on those platforms.
            // macOS gets the same routing for free via NSWindow's close
            // button.
            let _ = window.close();
        } else {
            lifecycle::mark_main_window_user_hide();
            let _ = window.hide();
        }
    }
    Ok(Value::Null)
}

#[tauri::command]
pub async fn focus_main_window<R: Runtime>(app: AppHandle<R>, _args: Args) -> Value {
    crate::lifecycle::show_main_window(&app);
    Value::Null
}

#[tauri::command]
pub async fn is_main_window_alive<R: Runtime>(app: AppHandle<R>) -> bool {
    app.get_webview_window(crate::lifecycle::MAIN_WINDOW_LABEL).is_some()
}

#[tauri::command]
pub async fn quit_app<R: Runtime>(
    app: AppHandle<R>,
    _state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    lifecycle::quit_app(&app);
    Ok(Value::Null)
}

#[tauri::command]
pub async fn update_tray_title<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    tray::refresh_title(&app, &state)?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn open_url(args: Args) -> Value {
    let Some(url) = args.first().and_then(Value::as_str) else {
        return Value::Null;
    };
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
    {
        let _ = open::that(url);
    } else {
        log::warn!("open_url rejected non-whitelisted scheme: {}", url);
    }
    Value::Null
}

#[tauri::command]
pub async fn show_item_in_folder(args: Args) -> Value {
    let Some(path) = args.first().and_then(Value::as_str) else {
        return Value::Null;
    };

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["-R", path])
            .spawn();
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string());
        let _ = std::process::Command::new("xdg-open").arg(&parent).spawn();
    }

    Value::Null
}

// ---- import / export -------------------------------------------------------
//
// All three commands preserve the Electron-era return shape so the
// existing renderer error handling in TopBar/ConfigMenu and
// TopBar/ImportFromUrl keeps working without changes:
//
//   exportData()            -> null (cancelled) | false (failed) | string (path)
//   importData()            -> null (cancelled) | true (ok)       | string (error_code)
//   importDataFromUrl(url)  -> null (error?)    | true (ok)       | string (error_code or msg)
//
// Hard filesystem / Tauri errors bubble up as Err(String) so the
// invoke promise rejects; soft errors (parse failure, invalid shape)
// come back as Ok(Value::String("error_code")) the renderer can
// display.

fn export_file_name_for(now: chrono::DateTime<chrono::Local>) -> String {
    format!("switchhosts_{}.json", now.format("%Y%m%d_%H%M%S%.3f"))
}

fn default_export_file_name() -> String {
    export_file_name_for(chrono::Local::now())
}

#[tauri::command]
pub async fn export_data<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    // Refuse during recovery: the active root is a fallback default, so an
    // export there would silently dump that fallback's data rather than the
    // user's real (unavailable) data. Block it until the location is resolved.
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let picked = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(&default_export_file_name())
        .blocking_save_file();

    let Some(dest) = picked else {
        return Ok(Value::Null);
    };

    let dest_path = match dest.into_path() {
        Ok(p) => p,
        Err(e) => return Err(format!("invalid save path: {e}")),
    };

    let _guard = state.store_lock.lock().expect("store lock poisoned");
    if let Err(e) = import_export::export_to_file(&dest_path, &state.paths) {
        log::warn!("export failed: {e}");
        return Ok(Value::Bool(false));
    }
    Ok(Value::String(dest_path.display().to_string()))
}

#[cfg(test)]
mod export_file_name_tests {
    use chrono::{TimeZone, Timelike};

    use super::export_file_name_for;

    #[test]
    fn includes_millisecond_timestamp() {
        let now = chrono::Local
            .with_ymd_and_hms(2026, 5, 9, 12, 14, 36)
            .single()
            .expect("test timestamp should be representable")
            .with_nanosecond(789_000_000)
            .expect("test nanosecond should be valid");

        assert_eq!(
            export_file_name_for(now),
            "switchhosts_20260509_121436.789.json"
        );
    }
}

#[tauri::command]
pub async fn import_data<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let picked = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    let Some(src) = picked else {
        return Ok(Value::Null);
    };

    let src_path = match src.into_path() {
        Ok(p) => p,
        Err(e) => return Err(format!("invalid pick path: {e}")),
    };

    let bytes = match http::read_file_with_limit(&src_path, http::MAX_IMPORT_BACKUP_BYTES) {
        Ok(b) => b,
        Err(e) => {
            log::warn!("import read failed: {e}");
            return Ok(Value::String(import_export::ERR_PARSE.into()));
        }
    };

    let _guard = state.store_lock.lock().expect("store lock poisoned");
    match import_export::import_backup_bytes(&bytes, &state.paths) {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("import failed: {e}")),
    }
}

#[tauri::command]
pub async fn import_data_from_url(state: State<'_, AppState>, args: Args) -> Result<Value, String> {
    state.require_data_dir_usable().map_err(|e| e.to_string())?;
    let url = arg_str(&args, 0, "url").map_err(|e| format!("{e:?}"))?;

    // Build the HTTP client outside of any lock so the proxy snapshot
    // doesn't pin store_lock during the network round trip. The
    // shared `http::build_client` honours `use_proxy` config — this
    // clears implementation-notes D8.
    let client = http::build_client(state.inner())?;
    let bytes = match fetch_url(&client, url).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("import-from-url fetch failed: {e}");
            return Ok(Value::String(e));
        }
    };

    let _guard = state.store_lock.lock().expect("store lock poisoned");
    match import_export::import_backup_bytes(&bytes, &state.paths) {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("import failed: {e}")),
    }
}

async fn fetch_url(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("error_{}", status.as_u16()));
    }
    http::response_bytes_with_limit(response, http::MAX_IMPORT_BACKUP_BYTES).await
}

// ---- updater ---------------------------------------------------------------

const AUTO_UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(12 * 60 * 60);

pub fn start_auto_update_checker<R: Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        run_auto_update_check(&app).await;

        loop {
            tokio::time::sleep(AUTO_UPDATE_CHECK_INTERVAL).await;
            run_auto_update_check(&app).await;
        }
    });
}

async fn run_auto_update_check<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    // Backstop for the gate in lib.rs setup: while the data directory is
    // unavailable we're on a fallback root, so the config we'd read isn't the
    // user's (and defaults to auto-check on), and emitting `new_version` would
    // pop the update dialog over the recovery dialog. Don't check until the
    // user has resolved their data location.
    if state.data_dir_recovery.is_some() {
        return;
    }
    let auto_check_update = state
        .config
        .lock()
        .map(|cfg| cfg.auto_check_update)
        .unwrap_or(false);

    if !auto_check_update {
        return;
    }

    if let Err(e) = check_update_inner(app, state.inner()).await {
        log::info!("automatic update check failed: {e}");
    }
}

async fn check_update_inner<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Result<Value, String> {
    let _guard = state.update_check_lock.lock().await;
    let updater = updater_builder_with_proxy(app, state)?
        .build()
        .map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    match update {
        Some(update) => {
            let info = json!({
                "has_update": true,
                "version": update.version,
                "releaseNotes": update.body,
            });
            let _ = app.emit("new_version", json!({ "_args": [info.clone()] }));
            Ok(info)
        }
        None => Ok(json!({ "has_update": false })),
    }
}

#[tauri::command]
pub async fn check_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    check_update_inner(&app, state.inner()).await
}

#[tauri::command]
pub async fn download_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    let _guard = state.update_check_lock.lock().await;
    let updater = updater_builder_with_proxy(&app, state.inner())?
        .build()
        .map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no update available".to_string())?;
    let downloaded_version = update.version.clone();
    let downloaded_release_notes = update.body.clone();

    let app_for_progress = app.clone();
    update
        .download_and_install(
            move |downloaded, total| {
                let percent = total
                    .map(|t| {
                        if t > 0 {
                            (downloaded as f64 / t as f64) * 100.0
                        } else {
                            0.0
                        }
                    })
                    .unwrap_or(0.0);
                let _ = app_for_progress.emit(
                    "update_download_progress",
                    json!({ "_args": [{
                        "percent": percent,
                        "transferred": downloaded,
                        "total": total.unwrap_or(0),
                        "bytesPerSecond": 0,
                    }] }),
                );
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "update_downloaded",
        json!({ "_args": [{
            "version": downloaded_version,
            "releaseNotes": downloaded_release_notes,
        }] }),
    );
    Ok(Value::Null)
}

#[tauri::command]
pub async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window(lifecycle::MAIN_WINDOW_LABEL) {
        lifecycle::persist_window_geometry(&window, state.inner());
    }
    state
        .is_will_quit
        .store(true, std::sync::atomic::Ordering::SeqCst);
    app.restart();
    #[allow(unreachable_code)]
    Ok(Value::Null)
}

fn updater_builder_with_proxy<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Result<tauri_plugin_updater::UpdaterBuilder, String> {
    use tauri_plugin_updater::UpdaterExt;

    let mut builder = app.updater_builder();
    let app_for_before_exit = app.clone();
    builder = builder.on_before_exit(move || {
        let state = app_for_before_exit.state::<AppState>();
        if let Some(window) = app_for_before_exit.get_webview_window(lifecycle::MAIN_WINDOW_LABEL) {
            lifecycle::persist_window_geometry(&window, state.inner());
        }
        state.is_will_quit.store(true, Ordering::SeqCst);
    });

    if let Some(proxy_url) = http::configured_proxy_url_from_state(state) {
        let proxy = proxy_url
            .parse()
            .map_err(|e| format!("invalid proxy {proxy_url}: {e}"))?;
        builder = builder.proxy(proxy);
    }
    Ok(builder)
}

// ---- popup menu ------------------------------------------------------------
//
// The renderer's PopupMenu helper stays unchanged: for each menu item with
// a click handler it generates a unique `_click_evt` event name, registers
// an `agent.once(_click_evt, handler)`, then calls `agent.popupMenu({menu_id,
// items})`. We build a Tauri context menu using the same `_click_evt` strings
// as menu item ids, show it at the cursor, then emit a close signal. The
// matching click event is fan-out by the `.on_menu_event(...)` handler
// installed in `lib.rs` which forwards any menu id starting with
// `popup_menu_item_` as a same-named Tauri event.

#[tauri::command]
pub fn popup_menu<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    args: Args,
) -> Result<Value, String> {
    let spec = args.into_iter().next().unwrap_or(Value::Null);
    let menu_id = spec
        .get("menu_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let items: Vec<Value> = spec
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut builder = MenuBuilder::new(&app);
    let mut fallback_counter = 0u32;
    for item in &items {
        let item_type = item.get("type").and_then(Value::as_str);
        if item_type == Some("separator") {
            builder = builder.separator();
            continue;
        }

        let label = item.get("label").and_then(Value::as_str).unwrap_or("");
        let enabled = item.get("enabled").and_then(Value::as_bool).unwrap_or(true);
        let id = match item.get("_click_evt").and_then(Value::as_str) {
            Some(evt) if !evt.is_empty() => evt.to_string(),
            _ => {
                fallback_counter += 1;
                format!("__swh_popup_noop_{fallback_counter}")
            }
        };

        let mi = MenuItemBuilder::with_id(&id, label)
            .enabled(enabled)
            .build(&app)
            .map_err(|e| e.to_string())?;
        builder = builder.item(&mi);
    }

    let menu = builder.build().map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())?;

    // The popup call is synchronous on all three desktop platforms (NSMenu
    // modal on macOS, TrackPopupMenu with TPM_RETURNCMD on Windows, GTK main
    // iteration loop on Linux). By the time it returns, any click event has
    // already been routed through the on_menu_event handler, so emitting the
    // close signal now is safe.
    let _ = app.emit(
        &format!("popup_menu_close:{menu_id}"),
        json!({ "_args": [] }),
    );

    Ok(Value::Null)
}

// ---- data dir --------------------------------------------------------------

#[tauri::command]
pub async fn get_data_dir(state: State<'_, AppState>, _args: Args) -> Result<Value, StorageError> {
    Ok(json!(state.paths.root.display().to_string()))
}

/// Startup status for the renderer: the active data directory, the default
/// location, whether a reset would actually change anything (`can_reset`),
/// and a `recovery` descriptor when the recorded custom directory is
/// unavailable (so the UI can prompt the user). `recovery` is `null` in the
/// normal case; otherwise `{ kind, path }` where `kind` is `"missing"` (the
/// directory is gone/unusable, `path` is its path) or `"invalid"` (the
/// pointer file is unreadable/corrupt, `path` is `null`). `can_reset` is
/// `false` when there is no pointer to clear (already on the default root),
/// so the UI can disable a pointless "reset".
#[tauri::command]
pub async fn get_data_dir_status(
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let recovery = state.data_dir_recovery.as_ref().map(|r| match r {
        paths::DataDirRecovery::Missing(p) => json!({
            "kind": "missing",
            "path": p.display().to_string(),
        }),
        paths::DataDirRecovery::Invalid => json!({
            "kind": "invalid",
            "path": Value::Null,
        }),
    });
    Ok(json!({
        "active_dir": state.paths.root.display().to_string(),
        "default_dir": paths::default_root()?.display().to_string(),
        "can_reset": data_dir_pointer::pointer_exists(),
        "recovery": recovery,
    }))
}

/// Show a folder picker and report what the chosen folder resolves to.
/// Returns `null` if the user cancels. Otherwise returns
/// `{ kind, data_dir, is_empty, is_same_as_current }` where `kind` is
/// `"default"` (the choice maps to the default location → a reset) or
/// `"custom"`, `data_dir` is the final `SwitchHosts.data` directory,
/// `is_empty` ignores OS metadata, and `is_same_as_current` guards the
/// no-op case. Does not create any directory.
#[tauri::command]
pub async fn pick_data_dir<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    let current_root = state.paths.root.clone();

    let picked = app
        .dialog()
        .file()
        .set_directory(&current_root)
        .set_can_create_directories(true)
        .blocking_pick_folder();

    let Some(picked) = picked else {
        return Ok(Value::Null);
    };
    let picked_path = picked
        .into_path()
        .map_err(|e| StorageError::InvalidDataDirChoice {
            reason: format!("invalid folder path: {e}"),
        })?;

    let default = paths::default_root()?;
    let current_c = fs_copy::lexical_canonicalize(&current_root);

    match paths::resolve_target_dir(&picked_path, &default) {
        paths::TargetKind::Default => Ok(json!({
            "kind": "default",
            "data_dir": default.display().to_string(),
            "is_empty": true,
            "is_same_as_current": fs_copy::lexical_canonicalize(&default) == current_c,
        })),
        paths::TargetKind::Custom(final_dir) => Ok(json!({
            "kind": "custom",
            "data_dir": final_dir.display().to_string(),
            "is_empty": fs_copy::dir_is_empty_ignoring_meta(&final_dir),
            "is_same_as_current": fs_copy::lexical_canonicalize(&final_dir) == current_c,
        })),
    }
}

/// Switch the data directory to `target` (the final `SwitchHosts.data`
/// path). If `copy` is set, the current data is copied first (merge,
/// overwriting same-named files; the source is never modified). If
/// `target` resolves to the default location this is treated as a reset
/// (pointer cleared, no copy; a no-op without restart when no pointer is
/// recorded). Persists window geometry first so the
/// copied `state.json` is current, then restarts the app to pick up the
/// new root. Returns `Err` (no restart) on any validation/copy failure.
#[tauri::command]
pub async fn apply_data_dir<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    let obj = args.first().and_then(Value::as_object).ok_or_else(|| {
        StorageError::InvalidDataDirChoice {
            reason: "missing arguments".into(),
        }
    })?;
    let target = obj.get("target").and_then(Value::as_str).ok_or_else(|| {
        StorageError::InvalidDataDirChoice {
            reason: "missing 'target'".into(),
        }
    })?;
    let copy = obj.get("copy").and_then(Value::as_bool).unwrap_or(false);
    let raw_target = PathBuf::from(target);
    // Reject a relative path up front, before any side effect: the pointer
    // only stores absolute paths (and rejects relative ones on read), so a
    // relative target would otherwise "succeed + restart" then be dropped on
    // the next launch.
    if !raw_target.is_absolute() {
        return Err(StorageError::InvalidDataDirChoice {
            reason: "the target data directory must be an absolute path".into(),
        });
    }

    let default = paths::default_root()?;
    // Normalize through the same rule as `pick_data_dir`: a folder not named
    // `SwitchHosts.data` gets that sub-dir appended, and the default location
    // is treated as a reset. Guards against a caller passing a raw parent
    // (e.g. ~/Desktop) — data would otherwise land directly in it.
    let (target, is_default) = match paths::resolve_target_dir(&raw_target, &default) {
        paths::TargetKind::Default => (default.clone(), true),
        paths::TargetKind::Custom(p) => (p, false),
    };
    let current_root = state.paths.root.clone();

    let target_c = fs_copy::lexical_canonicalize(&target);
    let current_c = fs_copy::lexical_canonicalize(&current_root);

    // Validate up front (cheap, no side effects) before touching disk.
    if !is_default {
        if target_c == current_c {
            return Err(StorageError::InvalidDataDirChoice {
                reason: "the chosen folder is already the current data directory".into(),
            });
        }
        if target_c.starts_with(&current_c) || current_c.starts_with(&target_c) {
            return Err(StorageError::InvalidDataDirChoice {
                reason:
                    "the chosen folder and the current data directory cannot contain each other"
                        .into(),
            });
        }
    }

    // Resetting to the default location is a no-op (no geometry persist, no
    // restart) only when there's nothing to clear AND we're not in recovery:
    // already on the default root in a healthy state. In recovery the active
    // root is a degraded fallback, so even a missing pointer must still
    // restart to leave recovery — never short-circuit there, or the dialog's
    // button spins forever on a no-op that never restarts.
    if is_default
        && !data_dir_pointer::pointer_exists()
        && state.data_dir_recovery.is_none()
    {
        return Ok(json!({ "changed": false }));
    }

    // Persist geometry on the OLD root before any copy so the copied
    // state.json reflects the latest window position.
    if let Some(window) = app.get_webview_window(lifecycle::MAIN_WINDOW_LABEL) {
        lifecycle::persist_window_geometry(&window, state.inner());
    }

    if is_default {
        // Reset: verify the default root is usable *before* forgetting the
        // pointer, so we don't clear it and then crash bootstrap on a broken
        // default (e.g. ~/.SwitchHosts blocked by a file, or read-only). Then
        // forget the pointer (no copy back into default).
        paths::V5Paths::under(default.clone())
            .ensure_usable()
            .map_err(|e| StorageError::InvalidDataDirChoice {
                reason: format!("the default data directory is not usable: {e}"),
            })?;
        data_dir_pointer::clear()?;
    } else {
        if copy {
            // Hold store_lock for the copy, like export_data. This
            // serializes against the manifest/trashcan read-modify-write
            // cycles (renderer edits and refresh's stamp step), keeping
            // those files consistent in the copy. Note: refresh writes
            // entry files *outside* this lock (see refresh.rs), so a
            // remote refresh landing mid-copy could pair a freshly written
            // entry with a slightly older manifest stamp in the copy —
            // harmless, since each file is written atomically and the app
            // re-refreshes after the imminent restart. Synchronous because
            // the data is small and we restart right after.
            let _guard = state.store_lock.lock().expect("store lock poisoned");
            fs_copy::copy_dir_recursive(&current_root, &target)?;
        }
        // Prepare and verify the target can host the full v5 layout AND is
        // writable before committing the pointer, so we never restart into a
        // root that fails data writes (or crashes bootstrap). `ensure_usable`
        // catches a folder already containing a *file* named entries/internal,
        // a read-only volume, and read-only existing sub-dirs alike (a root-
        // only probe would miss the last). For the copy path it's idempotent.
        paths::V5Paths::under(target.clone())
            .ensure_usable()
            .map_err(|e| StorageError::InvalidDataDirChoice {
                reason: format!("the chosen folder can't store SwitchHosts data: {e}"),
            })?;
        // Only flip the pointer once the layout is ready and writable.
        data_dir_pointer::save(&target)?;
    }

    state.is_will_quit.store(true, Ordering::SeqCst);
    app.restart();
    #[allow(unreachable_code)]
    Ok(Value::Null)
}

/// Reset the data directory back to the default `~/.SwitchHosts`: clear
/// the pointer and restart. Does not copy data back. Shared by the
/// preferences "reset" button and the missing-directory recovery dialog.
/// No-op (returns `{ "changed": false }` without restarting) only when there
/// is no pointer to clear AND we're not in recovery — i.e. already on the
/// default root in a healthy state, where a restart would just interrupt the
/// user. In recovery this ALWAYS restarts (even if the pointer is already
/// gone) so the user actually leaves the recovery state instead of the
/// dialog's "Use Default" button spinning forever on a silent no-op.
#[tauri::command]
pub async fn reset_data_dir<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    if !data_dir_pointer::pointer_exists() && state.data_dir_recovery.is_none() {
        return Ok(json!({ "changed": false }));
    }
    // Verify the default root is usable before clearing the pointer, so we
    // don't reset into a broken default and crash bootstrap on next launch.
    paths::V5Paths::under(paths::default_root()?)
        .ensure_usable()
        .map_err(|e| StorageError::InvalidDataDirChoice {
            reason: format!("the default data directory is not usable: {e}"),
        })?;
    if let Some(window) = app.get_webview_window(lifecycle::MAIN_WINDOW_LABEL) {
        lifecycle::persist_window_geometry(&window, state.inner());
    }
    data_dir_pointer::clear()?;
    state.is_will_quit.store(true, Ordering::SeqCst);
    app.restart();
    #[allow(unreachable_code)]
    Ok(Value::Null)
}
