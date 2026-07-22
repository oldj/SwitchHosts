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
use super::tree_format::{legacy_root_to_v5, v5_root_to_legacy};

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

fn node_is_folder(node: &Value) -> bool {
    node.get("type").and_then(Value::as_str) == Some("folder")
}

/// Read a node's `folder_mode` (0 = default / inherit, 1 = single,
/// 2 = multiple). Missing / non-numeric → 0, mirroring the renderer's
/// `parent.folder_mode || defaultChoiceMode` falsy-coalescing.
fn node_folder_mode(node: &Value) -> u8 {
    node.get("folder_mode").and_then(Value::as_u64).unwrap_or(0) as u8
}

fn set_node_on(node: &mut Value, on: bool) {
    if let Some(obj) = node.as_object_mut() {
        obj.insert("on".to_string(), Value::Bool(on));
    }
}

/// Mutable twin of `find_node`.
fn find_node_mut<'a>(nodes: &'a mut [Value], id: &str) -> Option<&'a mut Value> {
    for node in nodes.iter_mut() {
        if node_id(node) == Some(id) {
            return Some(node);
        }
        if let Some(children) = node_children_mut(node) {
            if let Some(found) = find_node_mut(children, id) {
                return Some(found);
            }
        }
    }
    None
}

/// Whether `id` is a direct child of the root forest.
fn is_in_top_level(nodes: &[Value], id: &str) -> bool {
    nodes.iter().any(|n| node_id(n) == Some(id))
}

/// Id of the folder that directly contains `id`, or `None` when `id`
/// lives at the top level (mirrors renderer `getParentOfItem`).
fn parent_id_of(nodes: &[Value], id: &str) -> Option<String> {
    if is_in_top_level(nodes, id) {
        return None;
    }
    fn rec(nodes: &[Value], id: &str) -> Option<String> {
        for node in nodes {
            if let Some(children) = node_children(node) {
                if children.iter().any(|c| node_id(c) == Some(id)) {
                    return node_id(node).map(String::from);
                }
                if let Some(found) = rec(children, id) {
                    return Some(found);
                }
            }
        }
        None
    }
    rec(nodes, id)
}

/// Port of renderer `switchFolderChild`: cascade `on` to every
/// descendant of a folder, unless the folder is in single-select mode
/// (`folder_mode === 1`), which owns its own exclusivity.
fn switch_folder_child(item: &mut Value, on: bool) {
    if !node_is_folder(item) || node_folder_mode(item) == 1 {
        return;
    }
    if let Some(children) = node_children_mut(item) {
        for child in children.iter_mut() {
            set_node_on(child, on);
            if node_is_folder(child) {
                switch_folder_child(child, on);
            }
        }
    }
}

/// Port of renderer `switchItemParentIsON`: walk from `id` up through
/// its folder ancestors, keeping each parent's `on` in sync with its
/// children. Stops at the first single-select ancestor (`folder_mode
/// === 1`), which manages its own state.
fn switch_item_parent_is_on(nodes: &mut Vec<Value>, id: &str, on: bool) {
    let mut current = id.to_string();
    while let Some(pid) = parent_id_of(nodes, &current) {
        if find_node(nodes, &pid).map(|p| node_folder_mode(&p)) == Some(1) {
            return;
        }
        if !on {
            if let Some(parent) = find_node_mut(nodes, &pid) {
                set_node_on(parent, false);
            }
        } else if let Some(all_on) = find_node(nodes, &pid).and_then(|p| {
            p.get("children").and_then(Value::as_array).map(|ch| {
                ch.iter()
                    .all(|c| c.get("on").and_then(Value::as_bool).unwrap_or(false))
            })
        }) {
            if let Some(parent) = find_node_mut(nodes, &pid) {
                set_node_on(parent, all_on);
            }
        }
        if is_in_top_level(nodes, &pid) {
            break;
        }
        current = pid;
    }
}

/// In-place Rust port of renderer `setOnStateOfItem`
/// (`src/common/hostsFn.ts`). Sets the on-state of `id`, applying
/// choice-mode / folder-mode single-selection exclusion and the
/// optional folder cascade so that tray, HTTP-API, and renderer
/// toggles all produce byte-for-byte identical trees.
///
/// `default_choice_mode` is the global `choice_mode` config value
/// (0 = default, 1 = single, 2 = multiple); it only excludes siblings
/// when equal to 1. Folders may override it via their own
/// `folder_mode`.
pub fn set_on_state_of_item(
    nodes: &mut Vec<Value>,
    id: &str,
    on: bool,
    default_choice_mode: u8,
    multi_chose_folder_switch_all: bool,
) {
    let item_is_top = is_in_top_level(nodes, id);

    {
        let Some(item) = find_node_mut(nodes, id) else {
            return;
        };
        set_node_on(item, on);
        if multi_chose_folder_switch_all {
            switch_folder_child(item, on);
        }
    }

    if multi_chose_folder_switch_all && !item_is_top {
        switch_item_parent_is_on(nodes, id, on);
    }

    if !on {
        return;
    }

    if item_is_top {
        if default_choice_mode == 1 {
            for node in nodes.iter_mut() {
                if node_id(node) != Some(id) {
                    set_node_on(node, false);
                    if multi_chose_folder_switch_all {
                        switch_folder_child(node, false);
                    }
                }
            }
        }
        return;
    }

    if let Some(pid) = parent_id_of(nodes, id) {
        let folder_mode = find_node(nodes, &pid).map(|p| node_folder_mode(&p)).unwrap_or(0);
        let effective = if folder_mode != 0 { folder_mode } else { default_choice_mode };
        if effective == 1 {
            if let Some(parent) = find_node_mut(nodes, &pid) {
                if let Some(children) = node_children_mut(parent) {
                    for child in children.iter_mut() {
                        if node_id(child) != Some(id) {
                            set_node_on(child, false);
                            if multi_chose_folder_switch_all {
                                switch_folder_child(child, false);
                            }
                        }
                    }
                }
            }
        }
    }
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

#[cfg(test)]
mod set_on_tests {
    use super::*;

    // root
    // ├── a (local, on)
    // ├── b (local, off)
    // └── f (folder, off)
    //     ├── c (local, off)
    //     └── d (local, on)
    fn fixture() -> Vec<Value> {
        json!([
            { "id": "a", "type": "local", "on": true },
            { "id": "b", "type": "local", "on": false },
            {
                "id": "f",
                "type": "folder",
                "on": false,
                "children": [
                    { "id": "c", "type": "local", "on": false },
                    { "id": "d", "type": "local", "on": true },
                ]
            },
        ])
        .as_array()
        .cloned()
        .unwrap()
    }

    fn on_of(nodes: &[Value], id: &str) -> bool {
        find_node(nodes, id)
            .and_then(|n| n.get("on").and_then(Value::as_bool))
            .unwrap()
    }

    #[test]
    fn multiple_mode_does_not_exclude_siblings() {
        let mut nodes = fixture();
        // choice_mode = 2 (multiple): turning b on leaves a on.
        set_on_state_of_item(&mut nodes, "b", true, 2, false);
        assert!(on_of(&nodes, "a"));
        assert!(on_of(&nodes, "b"));
    }

    #[test]
    fn single_mode_top_level_excludes_other_top_level_items() {
        let mut nodes = fixture();
        // choice_mode = 1 (single): turning b on turns a (and folder f) off.
        set_on_state_of_item(&mut nodes, "b", true, 1, false);
        assert!(on_of(&nodes, "b"));
        assert!(!on_of(&nodes, "a"));
        assert!(!on_of(&nodes, "f"));
    }

    #[test]
    fn turning_off_never_excludes_siblings() {
        let mut nodes = fixture();
        set_on_state_of_item(&mut nodes, "a", false, 1, false);
        assert!(!on_of(&nodes, "a"));
        // b was already off; d inside folder stays on.
        assert!(on_of(&nodes, "d"));
    }

    #[test]
    fn folder_single_mode_excludes_only_within_folder() {
        let mut nodes = fixture();
        // Give folder f its own single-select mode.
        find_node_mut(&mut nodes, "f")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("folder_mode".into(), json!(1));
        // Turn c on: d (its sibling in f) goes off, top-level a stays on.
        set_on_state_of_item(&mut nodes, "c", true, 2, false);
        assert!(on_of(&nodes, "c"));
        assert!(!on_of(&nodes, "d"));
        assert!(on_of(&nodes, "a"));
    }

    #[test]
    fn folder_inherits_global_single_mode_when_folder_mode_is_default() {
        let mut nodes = fixture();
        // folder_mode absent (0/default) → inherit global choice_mode = 1.
        set_on_state_of_item(&mut nodes, "c", true, 1, false);
        assert!(on_of(&nodes, "c"));
        assert!(!on_of(&nodes, "d"));
    }

    #[test]
    fn multi_switch_all_cascades_folder_children_and_updates_parent() {
        let mut nodes = fixture();
        // Turn the folder on with cascade → both children on, folder on.
        set_on_state_of_item(&mut nodes, "f", true, 2, true);
        assert!(on_of(&nodes, "f"));
        assert!(on_of(&nodes, "c"));
        assert!(on_of(&nodes, "d"));
    }

    #[test]
    fn multi_switch_all_syncs_parent_off_when_a_child_turns_off() {
        let mut nodes = fixture();
        // d is on, c is off → folder currently off. Turn c on with
        // cascade: all children on ⇒ parent folder flips on.
        set_on_state_of_item(&mut nodes, "c", true, 2, true);
        assert!(on_of(&nodes, "f"));
        // Now turn d off with cascade: parent must flip off.
        set_on_state_of_item(&mut nodes, "d", false, 2, true);
        assert!(!on_of(&nodes, "f"));
    }

    #[test]
    fn missing_id_is_a_noop() {
        let mut nodes = fixture();
        set_on_state_of_item(&mut nodes, "nope", true, 1, false);
        // Nothing changed.
        assert!(on_of(&nodes, "a"));
        assert!(!on_of(&nodes, "b"));
    }
}
