//! Two-way translation between the renderer's `IHostsListObject` shape
//! and the v5 storage-plan node shape used on disk.
//!
//! ## On the wire (renderer ↔ Rust commands)
//!
//! Flat snake_case object — the same shape Electron used:
//!
//! ```text
//! { id, type, title, on, is_sys?,
//!   url?, last_refresh?, last_refresh_ms?, refresh_interval?,   // remote
//!   include?,                                                     // group
//!   folder_mode?, folder_open?, is_collapsed?, children?,         // folder
//!   ...arbitrary keys preserved verbatim }
//! ```
//!
//! ## On disk (manifest.json)
//!
//! camelCase + nested:
//!
//! ```text
//! { id, type, title, on, isSys?, contentFile?,
//!   source: { url, lastRefresh, lastRefreshMs, refreshIntervalSec },   // remote
//!   group:  { include: [...] },                                          // group
//!   folder: { mode },                                                    // folder
//!   children?, extras? }
//! ```
//!
//! Folder collapse state (`is_collapsed` / legacy `folder_open`) is
//! NOT persisted in manifest.json — it lives in
//! `internal/state.json > tree.collapsedNodeIds` per the storage plan.
//!
//! Translation is lossless for round-trips: any field we don't model
//! lands in `extras` on the way out and is hoisted back on the way in.

use std::collections::HashSet;

use serde_json::{json, Map, Value};

// ---- field name constants --------------------------------------------------

const KEY_ID: &str = "id";
const KEY_TYPE: &str = "type";
const KEY_TITLE: &str = "title";
const KEY_ON: &str = "on";
const KEY_CHILDREN: &str = "children";
const KEY_EXTRAS: &str = "extras";

// legacy
const KEY_LEGACY_IS_SYS: &str = "is_sys";
const KEY_LEGACY_URL: &str = "url";
const KEY_LEGACY_LAST_REFRESH: &str = "last_refresh";
const KEY_LEGACY_LAST_REFRESH_MS: &str = "last_refresh_ms";
const KEY_LEGACY_REFRESH_INTERVAL: &str = "refresh_interval";
const KEY_LEGACY_INCLUDE: &str = "include";
const KEY_LEGACY_FOLDER_MODE: &str = "folder_mode";
const KEY_LEGACY_FOLDER_OPEN: &str = "folder_open";
const KEY_LEGACY_IS_COLLAPSED: &str = "is_collapsed";

// v5
const KEY_V5_IS_SYS: &str = "isSys";
const KEY_V5_CONTENT_FILE: &str = "contentFile";
const KEY_V5_SOURCE: &str = "source";
const KEY_V5_SOURCE_URL: &str = "url";
const KEY_V5_SOURCE_LAST_REFRESH: &str = "lastRefresh";
const KEY_V5_SOURCE_LAST_REFRESH_MS: &str = "lastRefreshMs";
const KEY_V5_SOURCE_REFRESH_INTERVAL_SEC: &str = "refreshIntervalSec";
const KEY_V5_GROUP: &str = "group";
const KEY_V5_GROUP_INCLUDE: &str = "include";
const KEY_V5_FOLDER: &str = "folder";
const KEY_V5_FOLDER_MODE: &str = "mode";

const SYSTEM_NODE_ID: &str = "0";

// ===========================================================================
// renderer (legacy) → v5 (on save)
// ===========================================================================

/// Translate the renderer-facing root forest into the v5 on-disk shape
/// and collect ids of folders that should be persisted as collapsed.
pub fn legacy_root_to_v5(legacy: &[Value]) -> (Vec<Value>, Vec<String>) {
    let mut collapsed = Vec::new();
    let mut out = Vec::with_capacity(legacy.len());
    for node in legacy {
        out.push(legacy_node_to_v5(node, &mut collapsed));
    }
    (out, collapsed)
}

fn legacy_node_to_v5(node: &Value, collapsed: &mut Vec<String>) -> Value {
    let Some(obj) = node.as_object() else {
        // Not an object — pass through verbatim. The manifest validator
        // will eventually reject it; we don't drop data here.
        return node.clone();
    };

    let kind = obj
        .get(KEY_TYPE)
        .and_then(Value::as_str)
        .unwrap_or("local")
        .to_string();
    let id = obj.get(KEY_ID).and_then(Value::as_str).map(String::from);
    let is_sys = obj
        .get(KEY_LEGACY_IS_SYS)
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // Collect folder collapse state for state.json before we strip it.
    if kind == "folder" {
        if let Some(node_id) = id.as_deref() {
            let is_collapsed = obj.get(KEY_LEGACY_IS_COLLAPSED).and_then(Value::as_bool);
            let folder_open = obj.get(KEY_LEGACY_FOLDER_OPEN).and_then(Value::as_bool);
            let collapsed_now = match (is_collapsed, folder_open) {
                (Some(c), _) => c,
                (None, Some(open)) => !open,
                (None, None) => false,
            };
            if collapsed_now {
                collapsed.push(node_id.to_string());
            }
        }
    }

    // Build the v5 object in a stable key order.
    let mut out = Map::new();
    if let Some(id) = id.clone() {
        out.insert(KEY_ID.into(), Value::String(id));
    }
    out.insert(KEY_TYPE.into(), Value::String(kind.clone()));
    if let Some(title) = obj.get(KEY_TITLE).cloned() {
        out.insert(KEY_TITLE.into(), title);
    }
    if let Some(on) = obj.get(KEY_ON).cloned() {
        out.insert(KEY_ON.into(), on);
    }
    if is_sys {
        out.insert(KEY_V5_IS_SYS.into(), json!(true));
    }

    match kind.as_str() {
        "local" => {
            if let Some(node_id) = id.as_deref() {
                if !is_sys && node_id != SYSTEM_NODE_ID {
                    out.insert(
                        KEY_V5_CONTENT_FILE.into(),
                        json!(format!("entries/{node_id}.hosts")),
                    );
                }
            }
        }
        "remote" => {
            if let Some(node_id) = id.as_deref() {
                if !is_sys && node_id != SYSTEM_NODE_ID {
                    out.insert(
                        KEY_V5_CONTENT_FILE.into(),
                        json!(format!("entries/{node_id}.hosts")),
                    );
                }
            }
            let mut source = Map::new();
            if let Some(url) = obj.get(KEY_LEGACY_URL).cloned() {
                source.insert(KEY_V5_SOURCE_URL.into(), url);
            }
            if let Some(v) = obj.get(KEY_LEGACY_LAST_REFRESH).cloned() {
                source.insert(KEY_V5_SOURCE_LAST_REFRESH.into(), v);
            }
            if let Some(v) = obj.get(KEY_LEGACY_LAST_REFRESH_MS).cloned() {
                source.insert(KEY_V5_SOURCE_LAST_REFRESH_MS.into(), v);
            }
            if let Some(v) = obj.get(KEY_LEGACY_REFRESH_INTERVAL).cloned() {
                source.insert(KEY_V5_SOURCE_REFRESH_INTERVAL_SEC.into(), v);
            }
            if !source.is_empty() {
                out.insert(KEY_V5_SOURCE.into(), Value::Object(source));
            }
        }
        "group" => {
            let include = obj
                .get(KEY_LEGACY_INCLUDE)
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new()));
            out.insert(
                KEY_V5_GROUP.into(),
                json!({ KEY_V5_GROUP_INCLUDE: include }),
            );
        }
        "folder" => {
            let mode = obj
                .get(KEY_LEGACY_FOLDER_MODE)
                .cloned()
                .unwrap_or(Value::Number(serde_json::Number::from(0)));
            out.insert(KEY_V5_FOLDER.into(), json!({ KEY_V5_FOLDER_MODE: mode }));
            if let Some(children) = obj.get(KEY_CHILDREN).and_then(Value::as_array) {
                let mut new_children = Vec::with_capacity(children.len());
                for child in children {
                    new_children.push(legacy_node_to_v5(child, collapsed));
                }
                out.insert(KEY_CHILDREN.into(), Value::Array(new_children));
            }
        }
        _ => {
            // Unknown type — pass through any extras below.
        }
    }

    // Capture anything we didn't model into `extras` so the round-trip
    // is lossless.
    let mut extras = Map::new();
    for (k, v) in obj {
        if is_modeled_legacy_key(k) {
            continue;
        }
        extras.insert(k.clone(), v.clone());
    }
    if !extras.is_empty() {
        out.insert(KEY_EXTRAS.into(), Value::Object(extras));
    }

    Value::Object(out)
}

fn is_modeled_legacy_key(key: &str) -> bool {
    matches!(
        key,
        KEY_ID
            | KEY_TYPE
            | KEY_TITLE
            | KEY_ON
            | KEY_CHILDREN
            | KEY_LEGACY_IS_SYS
            | KEY_LEGACY_URL
            | KEY_LEGACY_LAST_REFRESH
            | KEY_LEGACY_LAST_REFRESH_MS
            | KEY_LEGACY_REFRESH_INTERVAL
            | KEY_LEGACY_INCLUDE
            | KEY_LEGACY_FOLDER_MODE
            | KEY_LEGACY_FOLDER_OPEN
            | KEY_LEGACY_IS_COLLAPSED
            | KEY_EXTRAS
    )
}

// ===========================================================================
// v5 → renderer (legacy) (on load)
// ===========================================================================

/// Translate the v5 on-disk root forest back into the renderer-facing
/// shape, applying the supplied collapsed-folder set as
/// `is_collapsed: true` on matching folder nodes.
///
/// Both legacy-shaped and v5-shaped manifests are accepted: a node
/// that already looks like the renderer shape (`is_sys` present, no
/// `source`/`group`/`folder` envelopes) is left almost untouched. This
/// makes the loader tolerant of manifest.json files written by
/// previous Phase 1B sub-steps.
pub fn v5_root_to_legacy(v5: &[Value], collapsed_ids: &[String]) -> Vec<Value> {
    let collapsed_set: HashSet<&str> = collapsed_ids.iter().map(String::as_str).collect();
    v5.iter()
        .map(|node| v5_node_to_legacy(node, &collapsed_set))
        .collect()
}

fn v5_node_to_legacy(node: &Value, collapsed_set: &HashSet<&str>) -> Value {
    let Some(obj) = node.as_object() else {
        return node.clone();
    };

    let mut out = Map::new();
    let id = obj.get(KEY_ID).and_then(Value::as_str).map(String::from);
    let kind = obj
        .get(KEY_TYPE)
        .and_then(Value::as_str)
        .unwrap_or("local")
        .to_string();

    if let Some(id) = id.clone() {
        out.insert(KEY_ID.into(), Value::String(id));
    }
    if let Some(title) = obj.get(KEY_TITLE).cloned() {
        out.insert(KEY_TITLE.into(), title);
    }
    if let Some(on) = obj.get(KEY_ON).cloned() {
        out.insert(KEY_ON.into(), on);
    }
    out.insert(KEY_TYPE.into(), Value::String(kind.clone()));

    // is_sys: prefer v5 `isSys`, fall back to legacy `is_sys`.
    let is_sys = obj
        .get(KEY_V5_IS_SYS)
        .and_then(Value::as_bool)
        .or_else(|| obj.get(KEY_LEGACY_IS_SYS).and_then(Value::as_bool))
        .unwrap_or(false);
    if is_sys {
        out.insert(KEY_LEGACY_IS_SYS.into(), json!(true));
    }

    match kind.as_str() {
        "remote" => {
            // Prefer nested `source.*`, fall back to top-level legacy fields.
            if let Some(source) = obj.get(KEY_V5_SOURCE).and_then(Value::as_object) {
                if let Some(v) = source.get(KEY_V5_SOURCE_URL) {
                    out.insert(KEY_LEGACY_URL.into(), v.clone());
                }
                if let Some(v) = source.get(KEY_V5_SOURCE_LAST_REFRESH) {
                    out.insert(KEY_LEGACY_LAST_REFRESH.into(), v.clone());
                }
                if let Some(v) = source.get(KEY_V5_SOURCE_LAST_REFRESH_MS) {
                    out.insert(KEY_LEGACY_LAST_REFRESH_MS.into(), v.clone());
                }
                if let Some(v) = source.get(KEY_V5_SOURCE_REFRESH_INTERVAL_SEC) {
                    out.insert(KEY_LEGACY_REFRESH_INTERVAL.into(), v.clone());
                }
            } else {
                // Legacy-shaped manifest — copy fields verbatim.
                copy_if_present(obj, &mut out, KEY_LEGACY_URL);
                copy_if_present(obj, &mut out, KEY_LEGACY_LAST_REFRESH);
                copy_if_present(obj, &mut out, KEY_LEGACY_LAST_REFRESH_MS);
                copy_if_present(obj, &mut out, KEY_LEGACY_REFRESH_INTERVAL);
            }
        }
        "group" => {
            if let Some(group) = obj.get(KEY_V5_GROUP).and_then(Value::as_object) {
                if let Some(include) = group.get(KEY_V5_GROUP_INCLUDE) {
                    out.insert(KEY_LEGACY_INCLUDE.into(), include.clone());
                }
            } else {
                copy_if_present(obj, &mut out, KEY_LEGACY_INCLUDE);
            }
        }
        "folder" => {
            if let Some(folder) = obj.get(KEY_V5_FOLDER).and_then(Value::as_object) {
                if let Some(mode) = folder.get(KEY_V5_FOLDER_MODE) {
                    out.insert(KEY_LEGACY_FOLDER_MODE.into(), mode.clone());
                }
            } else {
                copy_if_present(obj, &mut out, KEY_LEGACY_FOLDER_MODE);
            }
            if let Some(children) = obj.get(KEY_CHILDREN).and_then(Value::as_array) {
                let new_children: Vec<Value> = children
                    .iter()
                    .map(|c| v5_node_to_legacy(c, collapsed_set))
                    .collect();
                out.insert(KEY_CHILDREN.into(), Value::Array(new_children));
            }
            if let Some(node_id) = id.as_deref() {
                if collapsed_set.contains(node_id) {
                    out.insert(KEY_LEGACY_IS_COLLAPSED.into(), json!(true));
                }
            }
        }
        _ => {}
    }

    // Restore extras (from v5 envelope) onto the legacy object.
    if let Some(extras) = obj.get(KEY_EXTRAS).and_then(Value::as_object) {
        for (k, v) in extras {
            // Don't let extras shadow modeled keys we just set.
            if !out.contains_key(k) {
                out.insert(k.clone(), v.clone());
            }
        }
    }

    Value::Object(out)
}

fn copy_if_present(src: &Map<String, Value>, dst: &mut Map<String, Value>, key: &str) {
    if let Some(v) = src.get(key) {
        dst.insert(key.into(), v.clone());
    }
}
