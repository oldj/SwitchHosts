//! Toggling a hosts entry on or off without the renderer.
//!
//! The tray menu lists every hosts entry as a check item so the user can
//! switch configurations straight from the menu bar. Clicking one has to
//! do everything `List/index.tsx::onToggleItem` does in the renderer:
//!
//! 1. Flip the entry's `on` flag, applying `choice_mode` /
//!    `multi_chose_folder_switch_all` folder semantics (`set_on_state_of_item`
//!    below is a port of `setOnStateOfItem` in `src/common/hostsFn.ts`).
//! 2. Aggregate the selected content and write it to the system hosts
//!    file — same pipeline `apply_hosts_selection` runs.
//! 3. Persist `manifest.json` only if the write succeeded, so a
//!    dismissed auth prompt leaves the stored selection untouched.
//! 4. Tell every live window what changed.
//!
//! Why not simply emit `toggle_item` and let the renderer handle it, the
//! way `http_api::api_toggle` does? Because the menu bar is reachable in
//! states where no renderer is: with `lightweight_mode` on, closing the
//! main window destroys its webview, and `hide_at_launch` never creates
//! one. A menu-bar toggle that silently does nothing in exactly the
//! "app lives in the tray" setup it exists for would be useless.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::commands;
use crate::hosts_apply;
use crate::lifecycle;
use crate::storage::{
    manifest::{self, Manifest},
    AppState, StorageError,
};
use crate::tray;

/// Flip the `on` state of the hosts entry `id` and apply the result to
/// the system hosts file.
///
/// Runs on a background task (see `spawn_toggle`) because the privileged
/// write can block on an OS auth prompt for as long as the user takes to
/// answer it.
pub async fn toggle_item<R: Runtime + 'static>(app: &AppHandle<R>, id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();

    // While the data directory is unavailable we're running on the
    // fallback root purely to show the recovery dialog. Toggling then
    // would apply the wrong data behind the user's back — send them to
    // the dialog instead, exactly like the tray icon's click handler.
    if state.data_dir_recovery.is_some() {
        lifecycle::show_main_window(app);
        return Ok(());
    }
    state.require_data_dir_usable().map_err(|e| e.to_string())?;

    let (write_mode, choice_mode, multi_switch_all, remove_duplicate_records) = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        (
            cfg.write_mode.clone(),
            cfg.choice_mode,
            cfg.multi_chose_folder_switch_all,
            cfg.remove_duplicate_records,
        )
    };

    let m = Manifest::load(&state.paths).map_err(|e| e.to_string())?;
    let Some(node) = manifest::find_node(&m.root, id) else {
        // The menu was built from an older manifest — the entry has been
        // deleted since. Rebuild so the stale item disappears.
        tray::refresh_menu(app);
        return Ok(());
    };
    let on = !node.get("on").and_then(Value::as_bool).unwrap_or(false);

    // Same gate as the renderer's `onToggleItem`: with no write mode
    // chosen yet we must not guess between append and overwrite. Ask
    // first, and let the dialog's OK button resume this toggle through
    // its usual `toggle_item` broadcast.
    if write_mode.is_empty() {
        lifecycle::show_main_window(app);
        let _ = app.emit(
            "show_set_write_mode",
            json!({ "_args": [{ "id": id, "on": on }] }),
        );
        return Ok(());
    }

    let mut root = m.root.clone();
    set_on_state_of_item(&mut root, id, on, choice_mode, multi_switch_all);

    let content =
        hosts_apply::aggregate_selected_content(&root, &state.paths, remove_duplicate_records)
            .map_err(|e| e.to_string())?;

    let result = commands::apply_content_to_system(app, state.inner(), &content).await;
    let applied = result
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if applied {
        // Persist only after a successful write, mirroring
        // `writeHostsToSystem`: a cancelled auth prompt must leave the
        // stored selection exactly as it was.
        persist_root(state.inner(), root).map_err(|e| e.to_string())?;
        if let Err(e) = tray::refresh_title(app, state.inner()) {
            log::warn!("failed to refresh tray title after toggle: {e}");
        }
        let _ = app.emit("set_hosts_on_status", json!({ "_args": [id, on] }));
        let _ = app.emit("reload_list", json!({ "_args": [] }));
        let _ = app.emit("tray:list_updated", json!({ "_args": [] }));
    } else if result.get("code").and_then(Value::as_str) != Some("cancelled") {
        log::warn!(
            "tray toggle of {id} failed: {}",
            result
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown error")
        );
    }

    // Always rebuild: the OS flips a check item's mark on click, so a
    // failed or cancelled apply would otherwise leave the menu claiming
    // a state the hosts file doesn't have.
    tray::refresh_menu(app);

    Ok(())
}

/// Fire-and-forget wrapper for menu-event handlers, which run on the
/// main thread and can't await.
pub fn spawn_toggle<R: Runtime + 'static>(app: &AppHandle<R>, id: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = toggle_item(&app, &id).await {
            log::warn!("toggle of hosts entry {id} failed: {e}");
        }
    });
}

fn persist_root(state: &AppState, root: Vec<Value>) -> Result<(), StorageError> {
    let _guard = state.store_lock.lock().expect("store lock poisoned");
    let mut m = Manifest::load(&state.paths).unwrap_or_default();
    m.root = root;
    m.save(&state.paths)
}

// ---- `setOnStateOfItem` port ----------------------------------------------
//
// Direct port of `setOnStateOfItem` and its helpers in
// `src/common/hostsFn.ts`, operating in place on the manifest root
// rather than on a deep clone. Behaviour is kept identical so a toggle
// from the menu bar and the same toggle from the list produce the same
// tree — including the falsy-zero fallback in
// `parent.folder_mode || defaultChoiceMode`, where folder mode 0
// ("default") defers to the global choice mode.

/// Single-choice mode: only one entry among a set may be on at a time.
const FOLDER_MODE_SINGLE: u64 = 1;

pub fn set_on_state_of_item(
    list: &mut Vec<Value>,
    id: &str,
    on: bool,
    default_choice_mode: u8,
    multi_chose_folder_switch_all: bool,
) {
    let Some(item) = find_node_mut(list, id) else {
        return;
    };
    set_on(item, on);
    if multi_chose_folder_switch_all {
        switch_folder_child(item, on);
    }

    let is_top_level = list.iter().any(|n| node_id(n) == Some(id));

    if multi_chose_folder_switch_all && !is_top_level {
        switch_item_parent_is_on(list, id, on);
    }

    // Switching an entry off never forces anything else to change.
    if !on {
        return;
    }

    if is_top_level {
        if u64::from(default_choice_mode) == FOLDER_MODE_SINGLE {
            for node in list.iter_mut() {
                if node_id(node) == Some(id) {
                    continue;
                }
                set_on(node, false);
                if multi_chose_folder_switch_all {
                    switch_folder_child(node, false);
                }
            }
        }
        return;
    }

    let Some(parent_id) = parent_id_of(list, id) else {
        return;
    };
    let Some(parent) = find_node_mut(list, &parent_id) else {
        return;
    };
    let folder_mode = match parent.get("folder_mode").and_then(Value::as_u64) {
        Some(mode) if mode != 0 => mode,
        _ => u64::from(default_choice_mode),
    };
    if folder_mode != FOLDER_MODE_SINGLE {
        return;
    }
    let Some(children) = parent.get_mut("children").and_then(Value::as_array_mut) else {
        return;
    };
    for child in children.iter_mut() {
        if node_id(child) == Some(id) {
            continue;
        }
        set_on(child, false);
        if multi_chose_folder_switch_all {
            switch_folder_child(child, false);
        }
    }
}

/// Propagate a child's new state up the folder chain: a folder is on
/// only while every one of its children is. Single-choice folders opt
/// out — their own state is not derived from their children.
fn switch_item_parent_is_on(list: &mut Vec<Value>, id: &str, on: bool) {
    let mut current = id.to_string();
    while let Some(parent_id) = parent_id_of(list, &current) {
        let Some(parent) = find_node_mut(list, &parent_id) else {
            return;
        };
        if parent.get("folder_mode").and_then(Value::as_u64) == Some(FOLDER_MODE_SINGLE) {
            return;
        }
        if !on {
            set_on(parent, false);
        } else if let Some(children) = parent.get("children").and_then(Value::as_array) {
            let all_on = children.iter().all(is_on);
            set_on(parent, all_on);
        }
        current = parent_id;
    }
}

/// Cascade a folder's state to everything inside it. Single-choice
/// folders are left alone — switching all of their children on would
/// break the one-at-a-time invariant.
fn switch_folder_child(item: &mut Value, on: bool) {
    if item.get("type").and_then(Value::as_str) != Some("folder") {
        return;
    }
    if item.get("folder_mode").and_then(Value::as_u64) == Some(FOLDER_MODE_SINGLE) {
        return;
    }
    let Some(children) = item.get_mut("children").and_then(Value::as_array_mut) else {
        return;
    };
    for child in children.iter_mut() {
        set_on(child, on);
        switch_folder_child(child, on);
    }
}

fn find_node_mut<'a>(nodes: &'a mut [Value], id: &str) -> Option<&'a mut Value> {
    for node in nodes.iter_mut() {
        if node.get("id").and_then(Value::as_str) == Some(id) {
            return Some(node);
        }
        if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            if let Some(found) = find_node_mut(children, id) {
                return Some(found);
            }
        }
    }
    None
}

fn parent_id_of(nodes: &[Value], id: &str) -> Option<String> {
    for node in nodes {
        let Some(children) = node.get("children").and_then(Value::as_array) else {
            continue;
        };
        if children.iter().any(|c| node_id(c) == Some(id)) {
            return node_id(node).map(str::to_string);
        }
        if let Some(found) = parent_id_of(children, id) {
            return Some(found);
        }
    }
    None
}

fn node_id(node: &Value) -> Option<&str> {
    node.get("id").and_then(Value::as_str)
}

fn is_on(node: &Value) -> bool {
    node.get("on").and_then(Value::as_bool).unwrap_or(false)
}

fn set_on(node: &mut Value, on: bool) {
    if let Some(obj) = node.as_object_mut() {
        obj.insert("on".to_string(), Value::Bool(on));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// root
    /// ├── local-1 (on)
    /// ├── folder-a
    /// │   ├── local-2
    /// │   └── folder-b
    /// │       └── local-3 (on)
    /// └── local-4
    fn tree() -> Vec<Value> {
        json!([
            { "id": "local-1", "type": "local", "on": true },
            {
                "id": "folder-a",
                "type": "folder",
                "on": false,
                "children": [
                    { "id": "local-2", "type": "local", "on": false },
                    {
                        "id": "folder-b",
                        "type": "folder",
                        "on": false,
                        "children": [
                            { "id": "local-3", "type": "local", "on": true }
                        ]
                    }
                ]
            },
            { "id": "local-4", "type": "local", "on": false }
        ])
        .as_array()
        .cloned()
        .unwrap()
    }

    fn on_state(list: &[Value], id: &str) -> bool {
        is_on(&manifest::find_node(list, id).expect("node exists"))
    }

    #[test]
    fn multi_choice_mode_leaves_siblings_alone() {
        let mut list = tree();
        set_on_state_of_item(&mut list, "local-4", true, 2, false);
        assert!(on_state(&list, "local-4"));
        assert!(on_state(&list, "local-1"), "sibling stays on");
    }

    #[test]
    fn single_choice_mode_switches_other_top_level_items_off() {
        let mut list = tree();
        set_on_state_of_item(&mut list, "local-4", true, 1, false);
        assert!(on_state(&list, "local-4"));
        assert!(!on_state(&list, "local-1"));
        assert!(!on_state(&list, "folder-a"));
    }

    #[test]
    fn switching_off_never_touches_siblings() {
        let mut list = tree();
        set_on_state_of_item(&mut list, "local-1", false, 1, false);
        assert!(!on_state(&list, "local-1"));
        assert!(on_state(&list, "local-3"), "nested entry untouched");
    }

    #[test]
    fn single_choice_folder_switches_off_only_its_own_children() {
        let mut list = json!([
            {
                "id": "folder-a",
                "type": "folder",
                "folder_mode": 1,
                "children": [
                    { "id": "local-1", "type": "local", "on": true },
                    { "id": "local-2", "type": "local", "on": false }
                ]
            },
            { "id": "local-3", "type": "local", "on": true }
        ])
        .as_array()
        .cloned()
        .unwrap();

        set_on_state_of_item(&mut list, "local-2", true, 2, false);
        assert!(on_state(&list, "local-2"));
        assert!(!on_state(&list, "local-1"), "sibling in the folder is off");
        assert!(on_state(&list, "local-3"), "top-level entry is untouched");
    }

    #[test]
    fn folder_mode_zero_falls_back_to_the_global_choice_mode() {
        let mut list = json!([
            {
                "id": "folder-a",
                "type": "folder",
                "folder_mode": 0,
                "children": [
                    { "id": "local-1", "type": "local", "on": true },
                    { "id": "local-2", "type": "local", "on": false }
                ]
            }
        ])
        .as_array()
        .cloned()
        .unwrap();

        set_on_state_of_item(&mut list, "local-2", true, 1, false);
        assert!(!on_state(&list, "local-1"), "global single choice applies");
    }

    #[test]
    fn switch_all_cascades_a_folder_to_its_descendants() {
        let mut list = tree();
        set_on_state_of_item(&mut list, "folder-a", true, 2, true);
        assert!(on_state(&list, "folder-a"));
        assert!(on_state(&list, "local-2"));
        assert!(on_state(&list, "folder-b"));
        assert!(on_state(&list, "local-3"));
    }

    #[test]
    fn switch_all_turns_a_parent_off_when_a_child_goes_off() {
        let mut list = tree();
        set_on_state_of_item(&mut list, "folder-a", true, 2, true);
        set_on_state_of_item(&mut list, "local-3", false, 2, true);
        assert!(!on_state(&list, "local-3"));
        assert!(!on_state(&list, "folder-b"));
        assert!(!on_state(&list, "folder-a"), "grandparent follows too");
    }

    #[test]
    fn switch_all_turns_a_parent_on_once_every_child_is_on() {
        let mut list = tree();
        set_on_state_of_item(&mut list, "local-2", true, 2, true);
        assert!(!on_state(&list, "folder-a"), "folder-b is still off");
        set_on_state_of_item(&mut list, "folder-b", true, 2, true);
        assert!(on_state(&list, "folder-a"));
    }

    #[test]
    fn single_choice_folders_are_not_cascaded_into() {
        let mut list = json!([
            {
                "id": "folder-a",
                "type": "folder",
                "folder_mode": 1,
                "on": false,
                "children": [
                    { "id": "local-1", "type": "local", "on": false },
                    { "id": "local-2", "type": "local", "on": false }
                ]
            }
        ])
        .as_array()
        .cloned()
        .unwrap();

        set_on_state_of_item(&mut list, "folder-a", true, 2, true);
        assert!(on_state(&list, "folder-a"));
        assert!(!on_state(&list, "local-1"));
        assert!(!on_state(&list, "local-2"));
    }

    #[test]
    fn unknown_id_is_a_no_op() {
        let mut list = tree();
        let before = list.clone();
        set_on_state_of_item(&mut list, "nope", true, 1, true);
        assert_eq!(list, before);
    }
}
