//! Manual import / export of v3, v4, and v5 backup JSON files.
//!
//! Two independent code paths per the v5 migration plan:
//!
//! - **First-startup auto-migration** reads a live PotDb layout. Lives
//!   in `crate::migration` and is not touched from here.
//! - **Manual import** (this module) reads a user-supplied backup JSON,
//!   regardless of whether the original data directory still exists.
//!   Accepts v3 (`version[0] === 3`), v4 (`version[0] === 4`) and v5
//!   (`format === "switchhosts-backup"`).
//!
//! The renderer contract for importData / importDataFromUrl / exportData
//! is preserved exactly: commands return `Value::Bool(true)` on success,
//! `Value::Null` on user cancel, and `Value::String(error_code)` on soft
//! failures. Hard failures (filesystem errors) bubble up as Err so the
//! invoke promise rejects.

use std::path::Path;

use serde_json::{json, Value};

use crate::storage::{
    atomic::atomic_write,
    entries,
    manifest::{self, Manifest},
    trashcan::Trashcan,
    StorageError, V5Paths,
};

// ---- error codes (string values returned to the renderer) ------------------

pub const ERR_PARSE: &str = "parse_error";
pub const ERR_INVALID_DATA: &str = "invalid_data";
pub const ERR_NEW_VERSION: &str = "new_version";
pub const ERR_INVALID_DATA_KEY: &str = "invalid_data_key";
pub const ERR_INVALID_V3_DATA: &str = "invalid_v3_data";

/// Outcome of a backup import. `Ok(Value)` mirrors the renderer-facing
/// return shape of `actions.importData()` / `actions.importDataFromUrl()`:
///
/// - `Value::Bool(true)` — success
/// - `Value::String(error_code)` — soft error the renderer displays
/// - (cancellation is handled in the command shell, not here)
pub fn import_backup_bytes(bytes: &[u8], paths: &V5Paths) -> Result<Value, StorageError> {
    let data: Value = match serde_json::from_slice(bytes) {
        Ok(v) => v,
        Err(_) => return Ok(json!(ERR_PARSE)),
    };

    if !data.is_object() {
        return Ok(json!(ERR_INVALID_DATA));
    }

    // v5 backup is distinguished by the `format` discriminator, not by
    // a `version` array, so check it first.
    if data.get("format").and_then(Value::as_str) == Some("switchhosts-backup") {
        return import_v5(&data, paths);
    }

    let version = data.get("version").and_then(Value::as_array);
    let Some(version) = version else {
        return Ok(json!(ERR_INVALID_DATA));
    };
    let major = version.first().and_then(Value::as_u64).unwrap_or(0);

    match major {
        3 => import_v3(&data, paths),
        4 => import_v4(&data, paths),
        n if n > 4 => Ok(json!(ERR_NEW_VERSION)),
        _ => Ok(json!(ERR_INVALID_DATA)),
    }
}

// ---- v3 import -------------------------------------------------------------
//
// v3 shape:
//   {
//     "version": [3, ...],
//     "list": [
//       { id, title, where: "local"|"remote"|"group"|"folder",
//         content?, on?, url?, refresh_interval?, include?, children?, ... }
//     ]
//   }
//
// We walk the tree recursively: at each local/remote node we extract
// `content` into `entries/<id>.hosts`, rename `where` → `type`, and
// convert `refresh_interval` from hours to seconds. Folder nodes
// recurse into `children`. System node id "0" keeps no content file.

fn import_v3(data: &Value, paths: &V5Paths) -> Result<Value, StorageError> {
    let Some(list) = data.get("list").and_then(Value::as_array) else {
        return Ok(json!(ERR_INVALID_V3_DATA));
    };

    let mut converted = Vec::with_capacity(list.len());
    for node in list {
        converted.push(convert_v3_node(node, paths)?);
    }

    let manifest = Manifest {
        root: converted,
        ..Default::default()
    };

    // v3 backups had no trashcan — reset to empty so the user isn't
    // looking at stale entries from a previous import.
    Trashcan::default().save(&paths.trashcan_file)?;
    manifest.save(paths)?;

    Ok(json!(true))
}

fn convert_v3_node(node: &Value, paths: &V5Paths) -> Result<Value, StorageError> {
    let Some(obj) = node.as_object() else {
        return Ok(node.clone());
    };
    let mut out = serde_json::Map::with_capacity(obj.len());

    for (key, value) in obj {
        match key.as_str() {
            "where" => {
                // Skip here, re-insert under `type` below.
                continue;
            }
            "content" => {
                // Don't carry inline content into v5 tree — extract it
                // to entries/<id>.hosts instead.
                continue;
            }
            "refresh_interval" => {
                let hours = value.as_u64().unwrap_or(0);
                out.insert("refresh_interval".into(), json!(hours * 3600));
            }
            "children" => {
                if let Some(children) = value.as_array() {
                    let mut new_children = Vec::with_capacity(children.len());
                    for child in children {
                        new_children.push(convert_v3_node(child, paths)?);
                    }
                    out.insert("children".into(), Value::Array(new_children));
                } else {
                    out.insert("children".into(), value.clone());
                }
            }
            _ => {
                out.insert(key.clone(), value.clone());
            }
        }
    }

    // Promote `where` → `type` once, using the original object.
    if let Some(where_val) = obj.get("where") {
        out.insert("type".into(), where_val.clone());
    }

    // If the original node had inline content, write it to entries.
    if let Some(id) = obj.get("id").and_then(Value::as_str) {
        if id != "0" {
            if let Some(content) = obj.get("content").and_then(Value::as_str) {
                entries::write_entry(&paths.entries_dir, id, content)?;
            }
        }
    }

    Ok(Value::Object(out))
}

// ---- v4 import -------------------------------------------------------------
//
// v4 shape produced by the Electron export flow is PotDb's toJSON():
//   {
//     "version": [4, ...],
//     "data": {
//       "dict": { "meta": {...} },
//       "list": { "tree": [...], "trashcan": [...] },
//       "set": {},
//       "collection": {
//         "hosts":   { "data": [{id, content, _id}, ...], "meta": {...} },
//         "history": { "data": [...], "meta": {...} }
//       }
//     }
//   }

fn import_v4(data: &Value, paths: &V5Paths) -> Result<Value, StorageError> {
    let Some(inner) = data.get("data").filter(|v| v.is_object()) else {
        return Ok(json!(ERR_INVALID_DATA_KEY));
    };

    let tree = inner
        .get("list")
        .and_then(|l| l.get("tree"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let trashcan_items = inner
        .get("list")
        .and_then(|l| l.get("trashcan"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let hosts_data = inner
        .get("collection")
        .and_then(|c| c.get("hosts"))
        .and_then(|h| h.get("data"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let history_data = inner
        .get("collection")
        .and_then(|c| c.get("history"))
        .and_then(|h| h.get("data"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    // Write entries first — if this fails, manifest hasn't been
    // overwritten yet, so the user still sees their pre-import state.
    for entry in &hosts_data {
        let id = entry.get("id").and_then(Value::as_str);
        let content = entry.get("content").and_then(Value::as_str);
        if let (Some(id), Some(content)) = (id, content) {
            if id == "0" {
                continue;
            }
            entries::write_entry(&paths.entries_dir, id, content)?;
        }
    }

    // Then trashcan, then manifest (commit marker).
    Trashcan {
        items: trashcan_items,
        ..Default::default()
    }
    .save(&paths.trashcan_file)?;

    Manifest {
        root: tree,
        ..Default::default()
    }
    .save(paths)?;

    if !history_data.is_empty() {
        write_history(&paths.histories_dir.join("system-hosts.json"), &history_data)?;
    }

    Ok(json!(true))
}

// ---- v5 import -------------------------------------------------------------
//
// v5 backup shape produced by `export_to_file`:
//   {
//     "format": "switchhosts-backup",
//     "schemaVersion": 1,
//     "version": [5, 0, 0, 0],
//     "exportedAt": "2026-04-11T...",
//     "manifest": { "format": "switchhosts-data", "schemaVersion": 1, "root": [...] },
//     "entries": { "<node-id>": "<content>", ... },
//     "trashcan": { "format": "switchhosts-trashcan", "schemaVersion": 1, "items": [...] }
//   }

fn import_v5(data: &Value, paths: &V5Paths) -> Result<Value, StorageError> {
    let manifest_value = data.get("manifest");
    let entries_value = data.get("entries");
    let trashcan_value = data.get("trashcan");

    let Some(manifest_obj) = manifest_value.filter(|v| v.is_object()) else {
        return Ok(json!(ERR_INVALID_DATA));
    };

    let root = manifest_obj
        .get("root")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    // Entries written first (same ordering rationale as v4 / PotDb
    // migration: manifest.json is the commit marker).
    if let Some(entries_obj) = entries_value.and_then(Value::as_object) {
        for (id, content_val) in entries_obj {
            if id == "0" {
                continue;
            }
            let content = content_val.as_str().unwrap_or("");
            entries::write_entry(&paths.entries_dir, id, content)?;
        }
    }

    let trashcan_items = trashcan_value
        .and_then(|t| t.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Trashcan {
        items: trashcan_items,
        ..Default::default()
    }
    .save(&paths.trashcan_file)?;

    Manifest {
        root,
        ..Default::default()
    }
    .save(paths)?;

    Ok(json!(true))
}

// ---- export ----------------------------------------------------------------

/// Serialize the current v5 state into a backup JSON and write it to
/// `dest`. Returns `Ok(())` on success. Hard I/O errors bubble up.
pub fn export_to_file(dest: &Path, paths: &V5Paths) -> Result<(), StorageError> {
    let manifest = Manifest::load(paths).unwrap_or_default();
    let trashcan = Trashcan::load(&paths.trashcan_file).unwrap_or_default();

    // Walk the tree and collect every local/remote node id that owns a
    // content file. We read each file and embed it inline in the backup
    // JSON under `entries`, keyed by node id.
    let mut ids = Vec::new();
    manifest::collect_content_ids(&manifest.root, &mut ids);

    let mut entries_map = serde_json::Map::with_capacity(ids.len());
    for id in ids {
        if id == "0" {
            continue;
        }
        let content = entries::read_entry(&paths.entries_dir, &id)?;
        entries_map.insert(id, Value::String(content));
    }

    let backup = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 1,
        // Legacy Electron import reads `version[0]` — flagging this as
        // v5 lets old clients fail with "new_version" rather than a
        // "parse_error" / "invalid_data" mystery.
        "version": [5, 0, 0, 0],
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "manifest": {
            "format": "switchhosts-data",
            "schemaVersion": 1,
            "root": manifest.root,
        },
        "entries": Value::Object(entries_map),
        "trashcan": {
            "format": "switchhosts-trashcan",
            "schemaVersion": 1,
            "items": trashcan.items,
        },
    });

    let bytes = serde_json::to_vec_pretty(&backup).map_err(|e| {
        StorageError::serialize(dest.display().to_string(), e)
    })?;
    atomic_write(dest, &bytes)
}

// ---- helpers ---------------------------------------------------------------

fn write_history(path: &Path, items: &[Value]) -> Result<(), StorageError> {
    let payload = serde_json::to_vec_pretty(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_paths(name: &str) -> V5Paths {
        let root = std::env::temp_dir().join(format!(
            "switchhosts-import-test-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let paths = V5Paths::under(root);
        paths.ensure_dirs().unwrap();
        paths
    }

    fn cleanup(paths: &V5Paths) {
        std::fs::remove_dir_all(&paths.root).ok();
    }

    fn read_entry_file(paths: &V5Paths, id: &str) -> String {
        entries::read_entry(&paths.entries_dir, id).unwrap()
    }

    fn manifest_root(paths: &V5Paths) -> Vec<Value> {
        Manifest::load(paths).unwrap().root
    }

    fn entry_path_exists(paths: &V5Paths, id: &str) -> bool {
        let p: PathBuf = entries::entry_path(&paths.entries_dir, id).unwrap();
        p.exists()
    }

    // ---- dispatcher: import_backup_bytes -----------------------------------

    #[test]
    fn dispatcher_returns_parse_error_for_invalid_json() {
        let paths = temp_paths("dispatch-parse");
        let result = import_backup_bytes(b"this is not json", &paths).unwrap();
        assert_eq!(result, json!(ERR_PARSE));
        cleanup(&paths);
    }

    #[test]
    fn dispatcher_returns_invalid_data_for_top_level_array() {
        let paths = temp_paths("dispatch-array");
        let bytes = serde_json::to_vec(&json!([1, 2, 3])).unwrap();
        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(ERR_INVALID_DATA));
        cleanup(&paths);
    }

    #[test]
    fn dispatcher_returns_invalid_data_when_version_array_missing() {
        let paths = temp_paths("dispatch-no-version");
        let bytes = serde_json::to_vec(&json!({ "data": {} })).unwrap();
        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(ERR_INVALID_DATA));
        cleanup(&paths);
    }

    #[test]
    fn dispatcher_returns_new_version_for_future_major() {
        let paths = temp_paths("dispatch-future");
        let bytes = serde_json::to_vec(&json!({ "version": [99, 0, 0] })).unwrap();
        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(ERR_NEW_VERSION));
        cleanup(&paths);
    }

    // ---- v3 import ---------------------------------------------------------

    #[test]
    fn import_v3_promotes_where_to_type_and_converts_interval_hours_to_seconds() {
        let paths = temp_paths("v3-basic");
        let backup = json!({
            "version": [3, 0],
            "list": [
                { "id": "0", "where": "system", "title": "System Hosts" },
                {
                    "id": "abc",
                    "where": "local",
                    "title": "Local",
                    "content": "127.0.0.1 example.test\n",
                    "on": true,
                },
                {
                    "id": "rem",
                    "where": "remote",
                    "title": "Remote",
                    "url": "https://example.com/hosts",
                    "refresh_interval": 2,
                },
            ],
        });
        let bytes = serde_json::to_vec(&backup).unwrap();

        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(true));

        let root = manifest_root(&paths);
        assert_eq!(root.len(), 3);

        let local = root.iter().find(|n| n["id"] == "abc").unwrap();
        assert_eq!(local.get("type").and_then(Value::as_str), Some("local"));
        // `where` and `content` must not survive into the v5 tree.
        assert!(local.get("where").is_none());
        assert!(local.get("content").is_none());
        assert_eq!(read_entry_file(&paths, "abc"), "127.0.0.1 example.test\n");

        let remote = root.iter().find(|n| n["id"] == "rem").unwrap();
        // 2 hours → 7200 seconds.
        assert_eq!(
            remote.get("refresh_interval").and_then(Value::as_u64),
            Some(7200)
        );

        // System node ("id": "0") must not write an entries file even
        // if it (legacy v3 shape) had one.
        assert!(!entry_path_exists(&paths, "0"));

        cleanup(&paths);
    }

    #[test]
    fn import_v3_recurses_into_folder_children() {
        let paths = temp_paths("v3-folder");
        let backup = json!({
            "version": [3, 0],
            "list": [
                {
                    "id": "f",
                    "where": "folder",
                    "title": "Folder",
                    "children": [
                        {
                            "id": "child",
                            "where": "local",
                            "content": "child-content",
                        }
                    ]
                }
            ]
        });
        let bytes = serde_json::to_vec(&backup).unwrap();

        import_backup_bytes(&bytes, &paths).unwrap();

        let root = manifest_root(&paths);
        let folder = &root[0];
        assert_eq!(folder.get("type").and_then(Value::as_str), Some("folder"));
        let child = folder["children"][0].clone();
        assert_eq!(child.get("type").and_then(Value::as_str), Some("local"));
        assert!(child.get("content").is_none());
        assert_eq!(read_entry_file(&paths, "child"), "child-content");
        cleanup(&paths);
    }

    #[test]
    fn import_v3_returns_invalid_v3_data_when_list_missing() {
        let paths = temp_paths("v3-missing-list");
        let bytes = serde_json::to_vec(&json!({ "version": [3, 0] })).unwrap();
        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(ERR_INVALID_V3_DATA));
        cleanup(&paths);
    }

    // ---- v4 import ---------------------------------------------------------

    #[test]
    fn import_v4_extracts_inline_content_into_entries_and_writes_tree() {
        let paths = temp_paths("v4-basic");
        let backup = json!({
            "version": [4, 0, 0],
            "data": {
                "list": {
                    "tree": [
                        { "id": "abc", "type": "local", "title": "Local", "on": true },
                    ],
                    "trashcan": [
                        { "id": "trashed", "data": { "id": "trashed", "type": "local" }, "add_time_ms": 0 }
                    ],
                },
                "collection": {
                    "hosts": {
                        "data": [
                            { "id": "0", "content": "system-content-skipped" },
                            { "id": "abc", "content": "abc-content" },
                        ]
                    },
                    "history": {
                        "data": [
                            { "id": "h1", "content": "old", "add_time_ms": 0 }
                        ]
                    }
                }
            }
        });
        let bytes = serde_json::to_vec(&backup).unwrap();

        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(true));

        let root = manifest_root(&paths);
        assert_eq!(root[0]["id"], "abc");
        assert_eq!(read_entry_file(&paths, "abc"), "abc-content");
        // System "0" content must never be written as an entries file.
        assert!(!entry_path_exists(&paths, "0"));

        let trashcan = Trashcan::load(&paths.trashcan_file).unwrap();
        assert_eq!(trashcan.items.len(), 1);
        assert_eq!(trashcan.items[0]["id"], "trashed");

        let history_path = paths.histories_dir.join("system-hosts.json");
        assert!(history_path.exists());

        cleanup(&paths);
    }

    #[test]
    fn import_v4_returns_invalid_data_key_when_data_field_missing() {
        let paths = temp_paths("v4-missing-data");
        let bytes = serde_json::to_vec(&json!({ "version": [4, 0] })).unwrap();
        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(ERR_INVALID_DATA_KEY));
        cleanup(&paths);
    }

    // ---- v5 import ---------------------------------------------------------

    #[test]
    fn import_v5_round_trips_through_export_to_file() {
        // Stage a v5 layout: manifest with one local, one entry file,
        // one trashcan item. Export it, blow away the dir, import the
        // bytes back, and assert byte-for-byte equality on the visible
        // fields. This is the most useful single test in this file —
        // it exercises both export_to_file and import_v5 end-to-end.
        let paths = temp_paths("v5-roundtrip");
        let manifest = Manifest {
            root: vec![json!({
                "id": "abc",
                "type": "local",
                "title": "Local",
                "on": true,
            })],
            ..Default::default()
        };
        manifest.save(&paths).unwrap();
        entries::write_entry(&paths.entries_dir, "abc", "127.0.0.1 example.test\n").unwrap();
        Trashcan {
            items: vec![json!({
                "id": "trashed",
                "data": { "id": "trashed", "type": "local" },
                "add_time_ms": 1234567,
            })],
            ..Default::default()
        }
        .save(&paths.trashcan_file)
        .unwrap();

        let backup_path = paths.root.join("backup.json");
        export_to_file(&backup_path, &paths).unwrap();
        let bytes = std::fs::read(&backup_path).unwrap();

        // Wipe state; only the entries dir / dirs survive.
        std::fs::remove_file(&paths.manifest_file).ok();
        std::fs::remove_file(&paths.trashcan_file).ok();
        let _ = std::fs::remove_file(entries::entry_path(&paths.entries_dir, "abc").unwrap());

        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(true));

        let root = manifest_root(&paths);
        assert_eq!(root[0]["id"], "abc");
        assert_eq!(read_entry_file(&paths, "abc"), "127.0.0.1 example.test\n");
        let trashcan = Trashcan::load(&paths.trashcan_file).unwrap();
        assert_eq!(trashcan.items.len(), 1);
        assert_eq!(trashcan.items[0]["id"], "trashed");

        cleanup(&paths);
    }

    #[test]
    fn import_v5_skips_system_id_zero_in_entries() {
        let paths = temp_paths("v5-skip-system");
        let backup = json!({
            "format": "switchhosts-backup",
            "schemaVersion": 1,
            "version": [5, 0, 0, 0],
            "manifest": {
                "format": "switchhosts-data",
                "schemaVersion": 1,
                "root": [
                    { "id": "abc", "type": "local" }
                ]
            },
            "entries": {
                "0": "system-content-must-not-be-written",
                "abc": "abc-content",
            },
            "trashcan": { "items": [] },
        });
        let bytes = serde_json::to_vec(&backup).unwrap();

        import_backup_bytes(&bytes, &paths).unwrap();

        assert!(!entry_path_exists(&paths, "0"));
        assert_eq!(read_entry_file(&paths, "abc"), "abc-content");
        cleanup(&paths);
    }

    #[test]
    fn import_v5_returns_invalid_data_when_manifest_missing() {
        let paths = temp_paths("v5-no-manifest");
        let bytes = serde_json::to_vec(&json!({
            "format": "switchhosts-backup",
            "schemaVersion": 1,
            "version": [5, 0, 0, 0],
        })).unwrap();
        let result = import_backup_bytes(&bytes, &paths).unwrap();
        assert_eq!(result, json!(ERR_INVALID_DATA));
        cleanup(&paths);
    }
}
