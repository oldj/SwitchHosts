//! `~/.SwitchHosts/internal/state.json` reader and writer.
//!
//! Per-machine UI state that doesn't belong in the user-visible main
//! storage: folder collapse state, and (eventually) window position,
//! pane widths, last-selected node, etc.
//!
//! Phase 1B sub-step (manifest v5 format) only needs the
//! `tree.collapsedNodeIds` slice. Other sub-fields are reserved for
//! later steps and survive round-trips via `serde_json::Value` so we
//! don't accidentally drop user state when reading a state.json
//! written by a future version.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::atomic::atomic_write;
use super::error::StorageError;

pub const STATE_FORMAT: &str = "switchhosts-state";
pub const STATE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StateFile {
    #[serde(default)]
    pub tree: TreeState,

    #[serde(default)]
    pub window: WindowState,

    /// Catch-all for sub-fields a later sub-step adds (last-selected,
    /// recent commands, ...). Anything not covered by the strongly-typed
    /// fields above lands here on read and is written back verbatim
    /// on save.
    #[serde(default, flatten)]
    pub extras: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TreeState {
    /// Ids of folder nodes that should render collapsed in the UI.
    #[serde(default, rename = "collapsedNodeIds")]
    pub collapsed_node_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WindowState {
    #[serde(default)]
    pub main: Option<WindowGeometry>,
}

/// Persisted window geometry in the coordinate space accepted by
/// Tauri's logical window APIs. The position is the outer frame's
/// top-left corner; the size is the inner content size, matching
/// Tauri's builder and set_size APIs. On macOS, native AppKit restore
/// must convert through lifecycle's Tauri-coordinate helper instead
/// of treating `y` as an `NSScreen::frame` point.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

impl StateFile {
    /// Load `internal/state.json`. Missing file → in-memory default.
    /// Parse failures fall back to default and leave the bad file in
    /// place for the user to inspect, matching `AppConfig::load`.
    pub fn load(path: &Path) -> Self {
        if !path.exists() {
            return Self::default();
        }
        match std::fs::read(path) {
            Ok(bytes) => match serde_json::from_slice::<StateFile>(&bytes) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!(
                        "state.json at {} failed to parse: {e}. Falling back to defaults in memory; the file is left untouched.",
                        path.display()
                    );
                    Self::default()
                }
            },
            Err(e) => {
                log::warn!(
                    "state.json at {} unreadable: {e}. Falling back to defaults in memory.",
                    path.display()
                );
                Self::default()
            }
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), StorageError> {
        let mut value = serde_json::to_value(self).map_err(|e| {
            StorageError::serialize(path.display().to_string(), e)
        })?;
        if let Some(obj) = value.as_object_mut() {
            obj.insert("format".into(), json!(STATE_FORMAT));
            obj.insert("schemaVersion".into(), json!(STATE_SCHEMA_VERSION));
        }
        let bytes = serde_json::to_vec_pretty(&value).map_err(|e| {
            StorageError::serialize(path.display().to_string(), e)
        })?;
        atomic_write(path, &bytes)
    }
}
