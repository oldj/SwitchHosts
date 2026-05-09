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

use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow, Wry};
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
    entries, manifest::{self, Manifest},
    AppState, StorageError, Trashcan,
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
    let key = args
        .first()
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
    let key = args
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| StorageError::InvalidConfigValue {
            key: "<arg0>".into(),
            reason: "config_set requires a string key as the first argument".into(),
        })?
        .to_string();
    let value = args.get(1).cloned().unwrap_or(Value::Null);

    {
        let mut cfg = state.config.lock().expect("config mutex poisoned");
        cfg.set_key(&key, value)?;
    }
    state.persist_config()?;
    apply_side_effects(&app, state.inner(), &[key.as_str()]);
    Ok(Value::Null)
}

#[tauri::command]
pub async fn config_update(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    let patch = args.first().cloned().unwrap_or(Value::Null);
    if patch.is_null() {
        return Err(StorageError::InvalidConfigValue {
            key: "<arg0>".into(),
            reason: "config_update requires a partial object as the first argument".into(),
        });
    }
    let touched: Vec<String> = patch
        .as_object()
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();
    {
        let mut cfg = state.config.lock().expect("config mutex poisoned");
        cfg.apply_partial(&patch)?;
    }
    state.persist_config()?;
    let touched_refs: Vec<&str> = touched.iter().map(String::as_str).collect();
    apply_side_effects(&app, state.inner(), &touched_refs);
    Ok(Value::Null)
}

/// Run any out-of-process side effects that depend on a config key
/// just changing. Currently:
///
/// - `http_api_on` / `http_api_only_local` → start, stop or rebind
///   the local HTTP API server.
/// - `locale` → rebuild native application and tray menus.
/// - `hide_dock_icon` → apply the macOS Dock policy and update the tray
///   toggle label.
///
/// Always reads the *fresh* config snapshot rather than trusting the
/// patch, so a rebind picks up both keys even if only one of them was
/// in the patch.
///
/// Pinned to `Wry` because the HTTP API server is itself pinned to
/// `Wry` (see the comment in `http_api.rs`).
fn apply_side_effects(
    app: &AppHandle<Wry>,
    state: &AppState,
    touched_keys: &[&str],
) {
    let touches_http_api = touched_keys
        .iter()
        .any(|k| *k == "http_api_on" || *k == "http_api_only_local");
    let touches_locale = touched_keys.iter().any(|k| *k == "locale");

    if touches_locale {
        if let Err(e) = app_menu::refresh(app) {
            log::warn!("failed to refresh app menu: {e}");
        }
        tray::refresh_menu(app);
        find::refresh_find_window_title(app);
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
                log::warn!("http_api reconfigure failed: {e}");
            }
        } else {
            http_api::stop();
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

    let content = hosts_apply::aggregate_selected_content(
        &list,
        &state.paths,
        remove_duplicate,
    )?;
    Ok(json!(content))
}

#[tauri::command]
pub async fn set_list(state: State<'_, AppState>, args: Args) -> Result<Value, StorageError> {
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
    Ok(Value::Null)
}

#[tauri::command]
pub async fn move_to_trashcan(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
    let id = arg_str(&args, 0, "id")?.to_string();
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    move_ids_to_trashcan(&state, &[id])?;
    Ok(Value::Null)
}

#[tauri::command]
pub async fn move_many_to_trashcan(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
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
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
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
    let path = system_hosts_path();
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(json!(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!("")),
        Err(e) => Err(StorageError::io(path.to_string(), e)),
    }
}

#[tauri::command]
pub async fn get_path_of_system_hosts(_args: Args) -> Value {
    json!(system_hosts_path())
}

fn system_hosts_path() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        r"C:\Windows\System32\drivers\etc\hosts"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "/etc/hosts"
    }
}

// ---- apply / refresh -------------------------------------------------------

#[tauri::command]
pub async fn apply_hosts_selection<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
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
            return Ok(HostsApplyError::Cancelled.into_renderer_value());
        }
        Err(e) => {
            log::warn!("apply failed: {e}");
            return Ok(e.into_renderer_value());
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
    if let Err(e) = refresh_tray_title(&app, state.inner()) {
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

    Ok(json!({
        "success": true,
        "old_content": outcome.previous_content,
        "new_content": outcome.new_content,
    }))
}

#[tauri::command]
pub async fn toggle_hosts_item(_args: Args) -> Value {
    Value::Null
}

#[tauri::command]
pub async fn refresh_remote_hosts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
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
    let value = serde_json::to_value(items).map_err(|e| {
        StorageError::serialize(path.display().to_string(), e)
    })?;
    Ok(value)
}

#[tauri::command]
pub async fn delete_apply_history_item(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
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
    let value = serde_json::to_value(items).map_err(|e| {
        StorageError::serialize(path.display().to_string(), e)
    })?;
    Ok(value)
}

#[tauri::command]
pub async fn cmd_delete_history_item(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, StorageError> {
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
pub async fn find_by(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
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
pub async fn find_replace_one(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
    let request = args
        .into_iter()
        .next()
        .ok_or_else(|| "find_replace_one: args[0] must be a request object".to_string())
        .and_then(|v| {
            serde_json::from_value(v)
                .map_err(|e| format!("find_replace_one: invalid request: {e}"))
        })?;
    let replaced = find::replace_one_in_manifest(state.inner(), request)?;
    Ok(json!(replaced))
}

#[tauri::command]
pub async fn find_replace_all(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
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
pub async fn hide_main_window<R: Runtime>(app: AppHandle<R>, _args: Args) -> Value {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
    Value::Null
}

#[tauri::command]
pub async fn focus_main_window<R: Runtime>(app: AppHandle<R>, _args: Args) -> Value {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Value::Null
}

#[tauri::command]
pub async fn quit_app<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    // Persist window geometry while the window is still around. The
    // ExitRequested run-event hook also covers Cmd+Q / system
    // shutdown paths; this branch covers the renderer-driven Quit.
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        lifecycle::persist_window_geometry(&window, state.inner());
    }

    // Flip the flag so the close handler stops intercepting close
    // events as "hide", then ask Tauri to exit cleanly.
    state.is_will_quit.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(Value::Null)
}

#[tauri::command]
pub async fn update_tray_title<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, StorageError> {
    refresh_tray_title(&app, &state)?;
    Ok(Value::Null)
}

/// Compute the tray title from the current manifest + config and push
/// it to the tray icon. Used both by the `update_tray_title` command
/// (renderer-driven) and by `apply_hosts_selection` after a successful
/// write so the menubar text stays in sync without a renderer round
/// trip.
fn refresh_tray_title<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Result<(), StorageError> {
    let show = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.show_title_on_tray
    };
    let manifest = load_manifest(state)?;
    let title = tray::compute_tray_title(&manifest.root, show);
    tray::set_tray_title(app, title.as_deref());
    Ok(())
}

#[tauri::command]
pub async fn open_url(args: Args) -> Value {
    let Some(url) = args.first().and_then(Value::as_str) else {
        return Value::Null;
    };
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
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

    let bytes = match std::fs::read(&src_path) {
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
pub async fn import_data_from_url(
    state: State<'_, AppState>,
    args: Args,
) -> Result<Value, String> {
    let url = arg_str(&args, 0, "url").map_err(|e| format!("{e:?}"))?;

    // Build the HTTP client outside of any lock so the proxy snapshot
    // doesn't pin store_lock during the network round trip. The
    // shared `http::build_client` honours `use_proxy` config — this
    // clears implementation-notes D8.
    let client = http::build_client(state.inner())?;
    let body = match fetch_url(&client, url).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("import-from-url fetch failed: {e}");
            return Ok(Value::String(e));
        }
    };

    let _guard = state.store_lock.lock().expect("store lock poisoned");
    match import_export::import_backup_bytes(body.as_bytes(), &state.paths) {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("import failed: {e}")),
    }
}

async fn fetch_url(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("error_{}", status.as_u16()));
    }
    response.text().await.map_err(|e| e.to_string())
}

// ---- updater ---------------------------------------------------------------

#[tauri::command]
pub async fn check_update<R: Runtime>(
    app: AppHandle<R>,
    _args: Args,
) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
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
pub async fn download_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    _args: Args,
) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no update available".to_string())?;

    let app_for_progress = app.clone();
    update
        .download_and_install(
            move |downloaded, total| {
                let percent = total
                    .map(|t| if t > 0 { (downloaded as f64 / t as f64) * 100.0 } else { 0.0 })
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

    if let Some(window) = app.get_webview_window(lifecycle::MAIN_WINDOW_LABEL) {
        lifecycle::persist_window_geometry(&window, state.inner());
    }
    state
        .is_will_quit
        .store(true, std::sync::atomic::Ordering::SeqCst);

    let _ = app.emit(
        "update_downloaded",
        json!({ "_args": [{ "version": "" }] }),
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
