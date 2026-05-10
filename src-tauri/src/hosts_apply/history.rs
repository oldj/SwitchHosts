//! Apply history persistence: `internal/histories/system-hosts.json`.
//!
//! On-disk format mirrors what the PotDb migration step
//! ([migration::mod::run] step 4) already writes — a bare JSON array
//! of `IHostsHistoryObject`-shaped records, snake_case fields:
//!
//! ```json
//! [
//!   { "id": "uuid", "content": "...", "add_time_ms": 1700000000000 },
//!   ...
//! ]
//! ```
//!
//! No format/schemaVersion envelope, intentionally — the file is
//! append-only journal data and the renderer expects the bare array
//! shape from `getHistoryList`.
//!
//! Trimmed to `history_limit` config items on every insert: oldest
//! entries (front of the list) are dropped first.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::storage::{atomic::atomic_write, error::StorageError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyHistoryItem {
    pub id: String,
    pub content: String,
    pub add_time_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

pub fn load(path: &Path) -> Result<Vec<ApplyHistoryItem>, StorageError> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    // Tolerate either the bare array we write or a wrapped envelope a
    // future schema change might add. Unknown wrapping → empty list +
    // warning, the journal isn't critical.
    match serde_json::from_slice::<Vec<ApplyHistoryItem>>(&bytes) {
        Ok(v) => Ok(v),
        Err(_) => match serde_json::from_slice::<Value>(&bytes) {
            Ok(Value::Array(arr)) => Ok(arr
                .into_iter()
                .filter_map(|v| serde_json::from_value::<ApplyHistoryItem>(v).ok())
                .collect()),
            _ => {
                log::warn!("{} could not be parsed; treating as empty.", path.display());
                Ok(Vec::new())
            }
        },
    }
}

pub fn save(path: &Path, items: &[ApplyHistoryItem]) -> Result<(), StorageError> {
    let bytes = serde_json::to_vec_pretty(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &bytes)
}

/// Insert a new entry at the end of the journal and trim to
/// `history_limit`. A non-positive limit means "no cap" (matches the
/// Electron behaviour where `history_limit <= 0` skips the trim block).
pub fn insert(path: &Path, item: ApplyHistoryItem, history_limit: i32) -> Result<(), StorageError> {
    let mut items = load(path)?;
    items.push(item);
    if history_limit > 0 && items.len() as i32 > history_limit {
        let drop_count = items.len() - history_limit as usize;
        items.drain(0..drop_count);
    }
    save(path, &items)
}

/// Remove the entry with `id`. Returns true if a row was removed.
pub fn delete_by_id(path: &Path, id: &str) -> Result<bool, StorageError> {
    let mut items = load(path)?;
    let before = items.len();
    items.retain(|i| i.id != id);
    if items.len() == before {
        return Ok(false);
    }
    save(path, &items)?;
    Ok(true)
}
