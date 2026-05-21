//! `~/.SwitchHosts/manifest.json` reader, writer, and tree operations.
//!
//! As of the Phase 1B "v5 format" sub-step, manifest.json is persisted
//! in the camelCase + nested shape from the storage plan: `isSys`,
//! `contentFile`, `source.{url, lastRefresh, lastRefreshMs,
//! refreshIntervalSec}`, `group.include`, `folder.mode`. The
//! in-memory `Manifest.root` keeps the renderer-facing
//! `IHostsListObject` shape so the rest of the storage layer (tree
//! ops, commands) doesn't have to learn two type hierarchies. The
//! `tree_format` module translates at the I/O boundary.
//!
//! Folder collapse state lives in `internal/state.json`, not in
//! manifest.json — load() pulls it back in as `is_collapsed: true`
//! on matching folder nodes, save() extracts it back out before
//! writing.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::atomic::atomic_write;
use super::error::StorageError;
use super::paths::V5Paths;
use super::state::StateFile;
use switchhosts_core::tree_format::{legacy_root_to_v5, v5_root_to_legacy};

pub const MANIFEST_FORMAT: &str = "switchhosts-data";
pub const MANIFEST_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default = "default_format")]
    #[allow(dead_code)]
    pub format: String,
    #[serde(default = "default_schema_version", rename = "schemaVersion")]
    #[allow(dead_code)]
    pub schema_version: u32,
    #[serde(default)]
    pub root: Vec<Value>,
}

fn default_format() -> String {
    MANIFEST_FORMAT.to_string()
}

fn default_schema_version() -> u32 {
    MANIFEST_SCHEMA_VERSION
}

impl Default for Manifest {
    fn default() -> Self {
        Self {
            format: default_format(),
            schema_version: default_schema_version(),
            root: Vec::new(),
        }
    }
}

impl Manifest {
    /// Read `manifest.json` and apply collapsed-folder state from
    /// `internal/state.json`. The returned `Manifest.root` is in the
    /// renderer-facing legacy shape so the rest of the storage layer
    /// can manipulate nodes uniformly.
    ///
    /// - Missing file → empty in-memory manifest. Phase 1B starts
    ///   every user off with an empty tree until the PotDb migration
    ///   step runs.
    /// - Unreadable file → `StorageError::Io`.
    /// - Unparsable file → `StorageError::Parse` (left on disk for the
    ///   user to inspect; the in-memory fallback is *not* persisted).
    /// - Legacy-shaped manifest (pre-v5 sub-step) is also accepted —
    ///   `tree_format::v5_root_to_legacy` is tolerant of nodes that
    ///   are already in renderer shape.
    pub fn load(paths: &V5Paths) -> Result<Self, StorageError> {
        let path = &paths.manifest_file;
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes =
            std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
        let raw: Manifest = serde_json::from_slice(&bytes)
            .map_err(|e| StorageError::parse(path.display().to_string(), e))?;

        let state = StateFile::load(&paths.state_file);
        let root = v5_root_to_legacy(&raw.root, &state.tree.collapsed_node_ids);

        Ok(Self {
            format: raw.format,
            schema_version: raw.schema_version,
            root,
        })
    }

    /// Write `manifest.json` (in v5 nested camelCase shape) and the
    /// matching `internal/state.json` slice. Both writes are atomic;
    /// the manifest is written *after* state.json so a crash between
    /// the two leaves the user with a slightly stale collapse state
    /// rather than an out-of-date tree.
    pub fn save(&self, paths: &V5Paths) -> Result<(), StorageError> {
        let (v5_root, collapsed_ids) = legacy_root_to_v5(&self.root);

        // 1. Update the collapsed-id slice of state.json. Preserve any
        //    other state-file fields a future sub-step has added.
        let mut state = StateFile::load(&paths.state_file);
        state.tree.collapsed_node_ids = collapsed_ids;
        state.save(&paths.state_file)?;

        // 2. Write the v5 manifest.json.
        let envelope = json!({
            "format": MANIFEST_FORMAT,
            "schemaVersion": MANIFEST_SCHEMA_VERSION,
            "root": v5_root,
        });
        let bytes = serde_json::to_vec_pretty(&envelope)
            .map_err(|e| StorageError::serialize(paths.manifest_file.display().to_string(), e))?;
        atomic_write(&paths.manifest_file, &bytes)
    }
}

// ---- tree operations -------------------------------------------------------
//
// All operations work against a `Vec<Value>` slice of the root forest.
// Nodes may have a `children: Vec<Value>` field when they are folders;
// these helpers walk into children recursively.

/// Find a node anywhere in the tree by id, returning a cloned copy.
pub fn find_node(nodes: &[Value], id: &str) -> Option<Value> {
    for node in nodes {
        if node_id(node) == Some(id) {
            return Some(node.clone());
        }
        if let Some(children) = node_children(node) {
            if let Some(found) = find_node(children, id) {
                return Some(found);
            }
        }
    }
    None
}

/// Remove a node by id. Returns the removed node plus the id of its
/// parent folder (`None` if it lived at the top level).
pub fn remove_node(nodes: &mut Vec<Value>, id: &str) -> Option<(Value, Option<String>)> {
    remove_node_inner(nodes, id, None)
}

fn remove_node_inner(
    nodes: &mut Vec<Value>,
    id: &str,
    parent_id: Option<&str>,
) -> Option<(Value, Option<String>)> {
    if let Some(pos) = nodes.iter().position(|n| node_id(n) == Some(id)) {
        let removed = nodes.remove(pos);
        return Some((removed, parent_id.map(String::from)));
    }
    for node in nodes.iter_mut() {
        let this_id = node_id(node).map(String::from);
        if let Some(children) = node_children_mut(node) {
            if let Some(result) = remove_node_inner(children, id, this_id.as_deref()) {
                return Some(result);
            }
        }
    }
    None
}

/// Insert `node` at the top level or inside the folder with `parent_id`.
/// If `parent_id` is supplied but no matching folder exists, the node
/// is appended to the top level.
pub fn insert_node(nodes: &mut Vec<Value>, node: Value, parent_id: Option<&str>) {
    if let Some(pid) = parent_id {
        if append_into_folder(nodes, &node, pid) {
            return;
        }
    }
    nodes.push(node);
}

fn append_into_folder(nodes: &mut Vec<Value>, node: &Value, parent_id: &str) -> bool {
    for current in nodes.iter_mut() {
        if node_id(current) == Some(parent_id) {
            if let Some(children) = node_children_mut(current) {
                children.push(node.clone());
                return true;
            }
            // Parent matched but isn't a folder — fall back to top
            // level by returning false from the enclosing call.
            return false;
        }
        if let Some(children) = node_children_mut(current) {
            if append_into_folder(children, node, parent_id) {
                return true;
            }
        }
    }
    false
}

fn node_id(node: &Value) -> Option<&str> {
    node.get("id").and_then(Value::as_str)
}

fn node_children(node: &Value) -> Option<&Vec<Value>> {
    node.get("children").and_then(Value::as_array)
}

fn node_children_mut(node: &mut Value) -> Option<&mut Vec<Value>> {
    node.get_mut("children").and_then(Value::as_array_mut)
}

/// Walk the tree and collect the ids of every `local`/`remote` node
/// reachable from the root. Used by the export command to know which
/// `entries/<id>.hosts` files to inline into the backup JSON.
pub fn collect_content_ids(nodes: &[Value], out: &mut Vec<String>) {
    for node in nodes {
        let kind = node.get("type").and_then(Value::as_str);
        if matches!(kind, Some("local") | Some("remote")) {
            if let Some(id) = node_id(node) {
                out.push(id.to_string());
            }
        }
        if let Some(children) = node_children(node) {
            collect_content_ids(children, out);
        }
    }
}
