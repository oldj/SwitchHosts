//! Read legacy Electron PotDb data directly from disk.
//!
//! PotDb is a small file-based JSON store used by the Electron version of
//! SwitchHosts. Every collection / dict / list is plain JSON, so we read
//! them in Rust without linking any Node dependency or spawning a sidecar
//! — that's a hard constraint from the v5 migration plan.
//!
//! Layout at `<root>`:
//!
//! ```text
//! <root>/
//!   data/                          # swhdb
//!     list/
//!       tree.json                  # Vec<IHostsListObject>
//!       trashcan.json              # Vec<ITrashcanObject>
//!     collection/
//!       hosts/
//!         ids.json                 # Vec<String>     (internal _id order)
//!         meta.json                # { index: u32 }
//!         data/<_id>.json          # { id, content, _id }
//!       history/
//!         ids.json
//!         meta.json
//!         data/<_id>.json          # { id, content, add_time_ms, label? }
//!   config/                        # cfgdb
//!     dict/
//!       cfg.json                   # all 23 config keys as flat object
//! ```

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::storage::StorageError;

/// Filesystem layout of a legacy PotDb store.
#[derive(Debug, Clone)]
pub struct PotDbLayout {
    /// Root directory of the legacy install. Kept for context /
    /// future reconciliation tooling even though the reader itself
    /// only touches `swhdb` and `cfgdb`.
    #[allow(dead_code)]
    pub root: PathBuf,
    pub swhdb: PathBuf,
    pub cfgdb: PathBuf,
}

impl PotDbLayout {
    pub fn at(root: PathBuf) -> Self {
        let swhdb = root.join("data");
        let cfgdb = root.join("config");
        Self { root, swhdb, cfgdb }
    }

    /// Does the root contain any legacy PotDb data we can migrate?
    pub fn has_legacy_data(&self) -> bool {
        self.swhdb.join("list").join("tree.json").exists()
            || self.swhdb.join("list").join("trashcan.json").exists()
            || self.cfgdb.join("dict").join("cfg.json").exists()
    }
}

/// Snapshot of everything migration needs to emit into v5.
#[derive(Debug)]
pub struct PotDbSnapshot {
    pub tree: Vec<Value>,
    pub trashcan: Vec<Value>,
    pub config: Value,
    /// (node_id, content) pairs from `collection/hosts`. System node
    /// (`id == "0"`) is included and filtered out by the orchestrator.
    pub hosts_content: Vec<(String, String)>,
    /// Raw items from `collection/history`, in PotDb insertion order.
    pub history: Vec<Value>,
}

pub fn read_potdb(layout: &PotDbLayout) -> Result<PotDbSnapshot, StorageError> {
    let tree = read_json_array(&layout.swhdb.join("list").join("tree.json"))?;
    let trashcan = read_json_array(&layout.swhdb.join("list").join("trashcan.json"))?;
    let config = read_json_value(&layout.cfgdb.join("dict").join("cfg.json"))?
        .unwrap_or_else(|| Value::Object(Default::default()));
    let hosts_content = read_collection_hosts(&layout.swhdb.join("collection").join("hosts"))?;
    let history = read_collection_raw(&layout.swhdb.join("collection").join("history"))?;

    Ok(PotDbSnapshot {
        tree,
        trashcan,
        config,
        hosts_content,
        history,
    })
}

fn read_json_value(path: &Path) -> Result<Option<Value>, StorageError> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    let v: Value = serde_json::from_slice(&bytes)
        .map_err(|e| StorageError::parse(path.display().to_string(), e))?;
    Ok(Some(v))
}

fn read_json_array(path: &Path) -> Result<Vec<Value>, StorageError> {
    match read_json_value(path)? {
        Some(Value::Array(arr)) => Ok(arr),
        _ => Ok(Vec::new()),
    }
}

/// Read a PotDb collection that stores `{id, content, ...}` objects,
/// returning (id, content) pairs in PotDb insertion order.
fn read_collection_hosts(dir: &Path) -> Result<Vec<(String, String)>, StorageError> {
    let ids = read_collection_ids(dir)?;
    let mut out = Vec::with_capacity(ids.len());
    for internal_id in ids {
        let entry_path = dir.join("data").join(format!("{internal_id}.json"));
        let Some(value) = read_json_value(&entry_path)? else {
            continue;
        };
        let id = value.get("id").and_then(Value::as_str);
        let content = value.get("content").and_then(Value::as_str);
        if let (Some(id), Some(content)) = (id, content) {
            out.push((id.to_string(), content.to_string()));
        }
    }
    Ok(out)
}

/// Read a PotDb collection as raw JSON values (no shape constraints).
fn read_collection_raw(dir: &Path) -> Result<Vec<Value>, StorageError> {
    let ids = read_collection_ids(dir)?;
    let mut out = Vec::with_capacity(ids.len());
    for internal_id in ids {
        let entry_path = dir.join("data").join(format!("{internal_id}.json"));
        if let Some(value) = read_json_value(&entry_path)? {
            out.push(value);
        }
    }
    Ok(out)
}

fn read_collection_ids(dir: &Path) -> Result<Vec<String>, StorageError> {
    let ids_file = dir.join("ids.json");
    if !ids_file.exists() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(&ids_file)
        .map_err(|e| StorageError::io(ids_file.display().to_string(), e))?;
    serde_json::from_slice::<Vec<String>>(&bytes)
        .map_err(|e| StorageError::parse(ids_file.display().to_string(), e))
}
