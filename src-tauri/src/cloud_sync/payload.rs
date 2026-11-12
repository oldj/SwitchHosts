//! Backup payload for cloud sync: build / hash / snapshot / apply.
//!
//! The wire format is the same `switchhosts-backup` JSON the manual export
//! produces (`src-tauri/src/import_export.rs::export_to_file`), extended
//! with an optional `trashcanEntries` map: the base export inlines only
//! hosts reachable from `manifest.root`, so recovered trashcan items
//! would land content-less. Missing `trashcanEntries` is tolerated when
//! applying (older payloads), same lossy behaviour manual export has today.
//!
//! Applying stays **id-preserving**: the incoming tree replaces the local
//! one verbatim, entry files are written under their own ids, and files
//! owned by nodes that disappeared are deleted. The interactive import
//! path (`preview::commit`) is deliberately not used — it remaps every id
//! and is one-shot; sync must survive many round trips.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::storage::atomic::atomic_write;
use crate::storage::entries;
use crate::storage::manifest::{self, Manifest};
use crate::storage::transaction::{self, Target};
use crate::storage::Trashcan;
use crate::storage::{StorageError, V5Paths};

pub const CLOUD_FILE_NAME: &str = "switchhosts-backup.json";
pub const BACKUP_FORMAT: &str = "switchhosts-backup";
pub const SNAPSHOT_DIR_NAME: &str = "snapshots";
pub const SNAPSHOT_KEEP: usize = 10;

/// Build the sync payload from the current on-disk state. Reads manifest,
/// trashcan and all referenced entry files. Returned `Value` matches the
/// manual-export shape plus `trashcanEntries`.
pub fn build_backup_value(paths: &V5Paths) -> Result<Value, StorageError> {
    let manifest = Manifest::load(paths)?;
    let trashcan = Trashcan::load(&paths.trashcan_file)?;

    let mut ids = Vec::new();
    manifest::collect_content_ids(&manifest.root, &mut ids);
    let entries_map = collect_entries_map(paths, &ids)?;

    // Trashcan items embed the removed node under `data`; the node's own
    // id still owns an entry file while it sits in the trash.
    let mut trash_ids = Vec::new();
    for item in &trashcan.items {
        manifest::collect_content_ids(&[item["data"].clone()], &mut trash_ids);
    }
    let trashcan_entries_map = collect_entries_map(paths, &trash_ids)?;

    Ok(json!({
        "format": BACKUP_FORMAT,
        "schemaVersion": 1,
        "version": [5, 0, 0, 0],
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "manifest": {
            "format": "switchhosts-data",
            "schemaVersion": 1,
            "root": manifest.root,
        },
        "entries": entries_map,
        "trashcan": {
            "format": "switchhosts-trashcan",
            "schemaVersion": 1,
            "items": trashcan.items,
        },
        "trashcanEntries": trashcan_entries_map,
    }))
}

fn collect_entries_map(
    paths: &V5Paths,
    ids: &[String],
) -> Result<serde_json::Map<String, Value>, StorageError> {
    let mut map = serde_json::Map::new();
    for id in ids {
        if id == "0" {
            continue;
        }
        let content = entries::read_entry(&paths.entries_dir, id)?;
        map.insert(id.clone(), Value::String(content));
    }
    Ok(map)
}

/// Stable content hash for a payload, used for all change detection. SHA-256 over
/// the pretty-serialized bytes with the volatile `exportedAt` timestamp removed.
/// `serde_json`'s default map is a `BTreeMap`, so key order is deterministic across
/// processes and machines without the `preserve_order` feature. The timestamp is
/// stripped so a freshly rebuilt local payload hashes equal to the remote copy
/// when the hosts data is identical; otherwise every poll would pull-overwrite.
pub fn stable_hash(value: &Value) -> Result<String, StorageError> {
    let mut obj = value
        .as_object()
        .ok_or_else(|| StorageError::InvalidConfigValue {
            key: "cloud_sync_payload".into(),
            reason: "payload is not a json object".into(),
        })?
        .clone();
    obj.remove("exportedAt");
    let bytes = serde_json::to_vec_pretty(&Value::Object(obj))
        .map_err(|e| StorageError::serialize("<cloud payload>", e))?;
    Ok(hex_digest(&bytes))
}

/// Stable hash of remote file bytes: parse then hash with `exportedAt` removed,
/// matching the hash `build_local_payload_locked` computes for local data. Both
/// sides use the same normalization so an unchanged remote no longer triggers a
/// pull-overwrite on every poll.
pub fn stable_hash_bytes(bytes: &[u8]) -> Result<String, StorageError> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|e| StorageError::parse("<cloud payload>".to_string(), e))?;
    stable_hash(&value)
}


fn hex_digest(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(2 * bytes.len());
    for byte in Sha256::digest(bytes) {
        use std::fmt::Write as _;
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// Persist a copy of `value` under `internal/snapshots/` before a pull
/// overwrites local data. Keeps the newest `SNAPSHOT_KEEP` snapshots.
pub fn save_snapshot(paths: &V5Paths, value: &Value) -> Result<PathBuf, StorageError> {
    let dir = snapshots_dir(paths);
    std::fs::create_dir_all(&dir).map_err(|e| StorageError::io(dir.display().to_string(), e))?;
    // Nanosecond precision plus a process-local counter keeps names unique
    // even when several snapshots are written within the same millisecond;
    // the counter only breaks nanosecond ties, so names still sort
    // chronologically for prune_snapshots.
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S%.9f");
    let name = format!("snapshot-{stamp}-{seq}.json");
    let path = dir.join(&name);
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(&path, &bytes)?;
    prune_snapshots(&dir)?;
    Ok(path)
}

fn snapshots_dir(paths: &V5Paths) -> PathBuf {
    paths.internal.join(SNAPSHOT_DIR_NAME)
}

fn prune_snapshots(dir: &Path) -> Result<(), StorageError> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| StorageError::io(dir.display().to_string(), e))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                Some(path)
            } else {
                None
            }
        })
        .collect();
    if files.len() <= SNAPSHOT_KEEP {
        return Ok(());
    }
    // Timestamped names sort chronologically.
    files.sort();
    let excess = files.len() - SNAPSHOT_KEEP;
    for path in files.into_iter().take(excess) {
        if let Err(e) = std::fs::remove_file(&path) {
            log::warn!("failed to prune old snapshot {}: {e}", path.display());
        }
    }
    Ok(())
}

/// Summary counts reported by [`apply_backup`] so the UI can state what
/// actually changed in one round trip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySummary {
    pub hosts_count: usize,
    pub folder_count: usize,
    pub trashcan_count: usize,
    pub entries_written: usize,
    pub entries_deleted: usize,
}

#[derive(Debug)]
pub struct ParsedBackup {
    pub root: Vec<Value>,
    pub entries_map: BTreeMap<String, String>,
    pub trashcan_items: Vec<Value>,
    pub trashcan_entries_map: BTreeMap<String, String>,
}

/// Parse + basic-validate a pulled payload. Rejects anything that is not a
/// `switchhosts-backup` schemaVersion 1 document, or whose tree/content map
/// is malformed, before a caller touches local data.
pub fn parse_backup(bytes: &[u8]) -> Result<ParsedBackup, StorageError> {
    let data: Value = serde_json::from_slice(bytes).map_err(|_| invalid("parse_error"))?;
    if data["format"] != BACKUP_FORMAT {
        return Err(invalid("invalid_format"));
    }
    if data.get("schemaVersion").is_some_and(|v| v != 1)
        || data["manifest"]
            .get("schemaVersion")
            .is_some_and(|v| v != 1)
    {
        return Err(invalid("new_version"));
    }
    let root = data["manifest"]["root"]
        .as_array()
        .ok_or_else(|| invalid("invalid_data"))?
        .clone();
    if root.is_empty() {
        return Err(invalid("invalid_data"));
    }
    let entries = data["entries"]
        .as_object()
        .ok_or_else(|| invalid("invalid_data"))?;
    let mut entries_map = BTreeMap::new();
    for (key, value) in entries {
        let content = value
            .as_str()
            .ok_or_else(|| invalid("invalid_data"))?
            .to_string();
        entries_map.insert(key.clone(), entries::normalize_to_lf(&content));
    }
    let trashcan_items = data["trashcan"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut trashcan_entries_map = BTreeMap::new();
    if let Some(map) = data["trashcanEntries"].as_object() {
        for (key, value) in map {
            if let Some(content) = value.as_str() {
                trashcan_entries_map.insert(key.clone(), entries::normalize_to_lf(content));
            }
        }
    }
    validate_root_shape(&root)?;
    Ok(ParsedBackup {
        root,
        entries_map,
        trashcan_items,
        trashcan_entries_map,
    })
}

fn invalid(code: &str) -> StorageError {
    StorageError::InvalidConfigValue {
        key: "cloud_sync_payload".into(),
        reason: code.into(),
    }
}

/// Walk the tree checking node shape. Lighter than the interactive import
/// validator (sync payloads are produced by this app family), but enough
/// to refuse structurally broken trees before overwriting local data.
fn validate_root_shape(nodes: &[Value]) -> Result<(), StorageError> {
    for node in nodes {
        if !node.is_object() {
            return Err(invalid("invalid_data"));
        }
        if let Some(kind) = node.get("type").and_then(Value::as_str) {
            if !matches!(kind, "local" | "remote" | "group" | "folder") {
                return Err(invalid("invalid_data"));
            }
        }
        if let Some(children) = node.get("children") {
            let children = children
                .as_array()
                .ok_or_else(|| invalid("invalid_data"))?;
            validate_root_shape(children)?;
        }
    }
    Ok(())
}

/// Overwrite the local data directory with a validated backup payload.
/// Ids are preserved. All writes/deletions participate in a single
/// transaction so an interrupted apply rolls back to the previous state.
///
/// `parsed` is the validated tree/content map produced by [`parse_backup`].
/// Callers must hold `state.lock_store()` while this runs.
pub fn apply_backup(paths: &V5Paths, parsed: ParsedBackup) -> Result<ApplySummary, StorageError> {
    // Ids referenced by the incoming tree and trashcan. Entry content maps
    // are merged so trashcan items can still be restored with content even
    // when the tree no longer owns that id.
    let mut incoming_ids: Vec<String> = Vec::new();
    manifest::collect_content_ids(&parsed.root, &mut incoming_ids);
    for item in &parsed.trashcan_items {
        manifest::collect_content_ids(&[item["data"].clone()], &mut incoming_ids);
    }
    let incoming_set: BTreeSet<String> = incoming_ids.iter().cloned().collect();

    let mut merged = BTreeMap::new();
    for (id, content) in parsed.trashcan_entries_map {
        merged.insert(id, content);
    }
    for (id, content) in parsed.entries_map {
        // Tree content wins on collision with a trashed node sharing the id.
        merged.insert(id, content);
    }

    // Ids currently owned on disk (tree + trashcan). Files no longer owned
    // after the apply are deleted so the data dir does not accumulate orphan
    // entry files across sync round trips.
    let old_manifest = Manifest::load(paths)?;
    let old_trashcan = Trashcan::load(&paths.trashcan_file)?;
    let mut current_ids = Vec::new();
    manifest::collect_content_ids(&old_manifest.root, &mut current_ids);
    for item in &old_trashcan.items {
        manifest::collect_content_ids(&[item["data"].clone()], &mut current_ids);
    }
    let current_set: BTreeSet<String> = current_ids.iter().cloned().collect();

    let to_write: Vec<String> = incoming_set
        .iter()
        .filter(|id| id.as_str() != "0")
        .cloned()
        .collect();
    let to_delete: Vec<String> = current_set
        .difference(&incoming_set)
        .cloned()
        .collect();

    let entries_written = to_write.len();
    let entries_deleted = to_delete.len();

    // Every file this apply touches enters the undo journal: manifest,
    // trashcan, every written entry and every deleted entry. An interrupted
    // apply therefore restores the exact prior state at next startup.
    let mut targets: Vec<Target> = vec![Target::Manifest, Target::Trashcan];
    for id in to_write.iter().chain(to_delete.iter()) {
        targets.push(Target::Entry(id.clone()));
    }

    let new_manifest = Manifest {
        root: parsed.root.clone(),
        ..Default::default()
    };
    let new_trashcan = Trashcan {
        items: parsed.trashcan_items.clone(),
        ..Default::default()
    };
    let write_ids = to_write.clone();
    let delete_ids = to_delete.clone();
    let entries_dir = paths.entries_dir.clone();

    transaction::run(paths, targets, move || {
        new_manifest.save(paths)?;
        new_trashcan.save(&paths.trashcan_file)?;
        for id in &write_ids {
            let content = merged.get(id).cloned().unwrap_or_default();
            entries::write_entry(&entries_dir, id, &content)?;
        }
        for id in &delete_ids {
            entries::delete_entry(&entries_dir, id)?;
        }
        Ok(())
    })?;

    let mut hosts_count = 0;
    let mut folder_count = 0;
    count_nodes(&parsed.root, &mut hosts_count, &mut folder_count);
    Ok(ApplySummary {
        hosts_count,
        folder_count,
        trashcan_count: parsed.trashcan_items.len(),
        entries_written,
        entries_deleted,
    })
}

fn count_nodes(nodes: &[Value], hosts: &mut usize, folders: &mut usize) {
    for node in nodes {
        let kind = node.get("type").and_then(Value::as_str);
        match kind {
            Some("folder") => *folders += 1,
            Some("local" | "remote") => *hosts += 1,
            _ => {}
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            count_nodes(children, hosts, folders);
        }
    }
}
