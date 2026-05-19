//! `~/.SwitchHosts/trashcan.json` reader and writer.
//!
//! Trashcan items match the renderer's `ITrashcanObject` shape. Each
//! item is a raw `serde_json::Value` with at least `{ data: node,
//! add_time_ms: number, parent_id: string | null }`, mirroring the
//! Electron version until a later sub-step renames fields to the
//! storage-plan shape.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::atomic::atomic_write;
use super::error::StorageError;

pub const TRASHCAN_FORMAT: &str = "switchhosts-trashcan";
pub const TRASHCAN_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trashcan {
    #[serde(default = "default_format")]
    #[allow(dead_code)]
    pub format: String,
    #[serde(default = "default_schema_version", rename = "schemaVersion")]
    #[allow(dead_code)]
    pub schema_version: u32,
    #[serde(default)]
    pub items: Vec<Value>,
}

fn default_format() -> String {
    TRASHCAN_FORMAT.to_string()
}

fn default_schema_version() -> u32 {
    TRASHCAN_SCHEMA_VERSION
}

impl Default for Trashcan {
    fn default() -> Self {
        Self {
            format: default_format(),
            schema_version: default_schema_version(),
            items: Vec::new(),
        }
    }
}

impl Trashcan {
    pub fn load(path: &Path) -> Result<Self, StorageError> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes =
            std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
        serde_json::from_slice::<Trashcan>(&bytes)
            .map_err(|e| StorageError::parse(path.display().to_string(), e))
    }

    pub fn save(&self, path: &Path) -> Result<(), StorageError> {
        let value = json!({
            "format": TRASHCAN_FORMAT,
            "schemaVersion": TRASHCAN_SCHEMA_VERSION,
            "items": self.items.clone(),
        });
        let json = serde_json::to_vec_pretty(&value)
            .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
        atomic_write(path, &json)
    }

    /// Match the renderer's `ITrashcanObject` shape: the owning id is
    /// nested at `item.data.id`, not at the top level.
    pub fn find_item_index(&self, id: &str) -> Option<usize> {
        self.items
            .iter()
            .position(|item| item_inner_id(item) == Some(id))
    }

    pub fn remove_item(&mut self, id: &str) -> Option<Value> {
        let idx = self.find_item_index(id)?;
        Some(self.items.remove(idx))
    }

    pub fn add_item(&mut self, node: Value, parent_id: Option<String>) {
        let add_time_ms = now_ms();
        self.items.push(json!({
            "data": node,
            "add_time_ms": add_time_ms,
            "parent_id": parent_id,
        }));
    }
}

fn item_inner_id(item: &Value) -> Option<&str> {
    item.get("data")
        .and_then(|data| data.get("id"))
        .and_then(Value::as_str)
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
