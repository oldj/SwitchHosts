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
        Ok(Self::load_if_present(paths)?.unwrap_or_default())
    }

    pub(crate) fn load_if_present(paths: &V5Paths) -> Result<Option<Self>, StorageError> {
        let path = &paths.manifest_file;
        let Some(bytes) = super::read_optional(path)? else {
            return Ok(None);
        };
        let raw: Manifest = serde_json::from_slice(&bytes)
            .map_err(|e| StorageError::parse(path.display().to_string(), e))?;

        let state = StateFile::load(&paths.state_file);
        let root = v5_root_to_legacy(&raw.root, &state.tree.collapsed_node_ids);

        Ok(Some(Self {
            format: raw.format,
            schema_version: raw.schema_version,
            root,
        }))
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

// ---- selection state -------------------------------------------------------
//
// Port of `setOnStateOfItem` in `src/common/hostsFn.ts`. The renderer owns
// this logic for UI-driven toggles; the HTTP API needs the same semantics
// when no window — and therefore no renderer — is loaded, which is the
// normal state under `hide_at_launch`.
//
// Nodes are addressed by index path rather than by `&mut` handles so a
// child and its ancestors can be touched in one pass without fighting the
// borrow checker.

/// Index path from the root forest down to `id`, or `None` if absent.
fn path_of(nodes: &[Value], id: &str) -> Option<Vec<usize>> {
    for (i, node) in nodes.iter().enumerate() {
        if node_id(node) == Some(id) {
            return Some(vec![i]);
        }
        if let Some(children) = node_children(node) {
            if let Some(mut sub) = path_of(children, id) {
                let mut path = vec![i];
                path.append(&mut sub);
                return Some(path);
            }
        }
    }
    None
}

fn node_at<'a>(nodes: &'a [Value], path: &[usize]) -> Option<&'a Value> {
    let (first, rest) = path.split_first()?;
    let node = nodes.get(*first)?;
    if rest.is_empty() {
        return Some(node);
    }
    node_at(node_children(node)?, rest)
}

fn node_at_mut<'a>(nodes: &'a mut [Value], path: &[usize]) -> Option<&'a mut Value> {
    let (first, rest) = path.split_first()?;
    let node = nodes.get_mut(*first)?;
    if rest.is_empty() {
        return Some(node);
    }
    node_at_mut(node_children_mut(node)?, rest)
}

fn set_node_on(node: &mut Value, on: bool) {
    if let Some(obj) = node.as_object_mut() {
        obj.insert("on".to_string(), Value::Bool(on));
    }
}

/// A folder's own choice mode. `0`/absent means "inherit the global
/// `choice_mode`", matching the renderer's `parent.folder_mode || default`.
fn folder_mode(node: &Value) -> Option<u64> {
    node.get("folder_mode")
        .and_then(Value::as_u64)
        .filter(|mode| *mode != 0)
}

fn is_folder(node: &Value) -> bool {
    node.get("type").and_then(Value::as_str) == Some("folder")
}

/// Cascade `on` to every descendant of a folder. Single-choice folders
/// are left alone — their children are mutually exclusive by definition.
fn switch_folder_child(node: &mut Value, on: bool) {
    if !is_folder(node) || folder_mode(node) == Some(1) {
        return;
    }
    let Some(children) = node_children_mut(node) else {
        return;
    };
    for child in children.iter_mut() {
        set_node_on(child, on);
        switch_folder_child(child, on);
    }
}

/// Walk up from `path`, keeping each ancestor folder's `on` in sync:
/// turning a child off turns the parent off; turning one on marks the
/// parent on only once every sibling is on.
fn switch_item_parent_is_on(root: &mut Vec<Value>, path: &[usize], on: bool) {
    if path.len() < 2 {
        return; // top-level node: no parent to reconcile
    }
    let parent_path = &path[..path.len() - 1];
    {
        let Some(parent) = node_at_mut(root, parent_path) else {
            return;
        };
        if folder_mode(parent) == Some(1) {
            return;
        }
        if !on {
            set_node_on(parent, false);
        } else {
            let all_on = node_children(parent)
                .map(|children| {
                    children
                        .iter()
                        .all(|c| c.get("on").and_then(Value::as_bool).unwrap_or(false))
                })
                .unwrap_or(false);
            set_node_on(parent, all_on);
        }
    }
    switch_item_parent_is_on(root, parent_path, on);
}

/// Set `id`'s on-state and apply the same folder/choice-mode rules the
/// renderer applies, in place on the legacy-shaped root forest.
///
/// `default_choice_mode` is the global `choice_mode` config value (`1` =
/// single choice). `multi_chose_folder_switch_all` mirrors the config flag
/// of the same name: when set, toggling a folder cascades to its children
/// and reconciles its ancestors.
pub fn set_on_state_of_item(
    root: &mut Vec<Value>,
    id: &str,
    on: bool,
    default_choice_mode: u64,
    multi_chose_folder_switch_all: bool,
) {
    let Some(path) = path_of(root, id) else {
        return;
    };
    if let Some(node) = node_at_mut(root, &path) {
        set_node_on(node, on);
    }

    let in_top_level = path.len() == 1;
    if multi_chose_folder_switch_all {
        if let Some(node) = node_at_mut(root, &path) {
            switch_folder_child(node, on);
        }
        if !in_top_level {
            switch_item_parent_is_on(root, &path, on);
        }
    }

    // Turning something off never forces anything else on.
    if !on {
        return;
    }

    if in_top_level {
        if default_choice_mode != 1 {
            return;
        }
        let chosen = path[0];
        for (i, node) in root.iter_mut().enumerate() {
            if i == chosen {
                continue;
            }
            set_node_on(node, false);
            if multi_chose_folder_switch_all {
                switch_folder_child(node, false);
            }
        }
        return;
    }

    let parent_path = &path[..path.len() - 1];
    let mode = node_at(root, parent_path)
        .and_then(folder_mode)
        .unwrap_or(default_choice_mode);
    if mode != 1 {
        return;
    }
    let chosen = *path.last().expect("path is non-empty");
    let Some(parent) = node_at_mut(root, parent_path) else {
        return;
    };
    let Some(children) = node_children_mut(parent) else {
        return;
    };
    for (i, child) in children.iter_mut().enumerate() {
        if i == chosen {
            continue;
        }
        set_node_on(child, false);
        if multi_chose_folder_switch_all {
            switch_folder_child(child, false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leaf(id: &str, on: bool) -> Value {
        json!({ "id": id, "title": id, "type": "local", "on": on })
    }

    fn folder(id: &str, on: bool, mode: u64, children: Vec<Value>) -> Value {
        json!({
            "id": id, "title": id, "type": "folder", "on": on,
            "folder_mode": mode, "children": children,
        })
    }

    /// A folder that carries no `folder_mode` of its own.
    fn folder_no_mode(id: &str, on: bool, children: Vec<Value>) -> Value {
        json!({
            "id": id, "title": id, "type": "folder", "on": on, "children": children,
        })
    }

    fn on_of(root: &[Value], id: &str) -> bool {
        let path = path_of(root, id).expect("node must exist");
        node_at(root, &path)
            .and_then(|n| n.get("on"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    #[test]
    fn sets_the_target_node_and_leaves_siblings_alone_in_multi_choice() {
        let mut root = vec![leaf("a", false), leaf("b", true)];
        set_on_state_of_item(&mut root, "a", true, 2, false);
        assert!(on_of(&root, "a"));
        assert!(on_of(&root, "b"), "multi-choice must not turn siblings off");
    }

    #[test]
    fn single_choice_turns_other_top_level_nodes_off() {
        let mut root = vec![leaf("a", false), leaf("b", true), leaf("c", true)];
        set_on_state_of_item(&mut root, "a", true, 1, false);
        assert!(on_of(&root, "a"));
        assert!(!on_of(&root, "b"));
        assert!(!on_of(&root, "c"));
    }

    #[test]
    fn turning_off_never_switches_anything_else_on() {
        let mut root = vec![leaf("a", true), leaf("b", false)];
        set_on_state_of_item(&mut root, "a", false, 1, false);
        assert!(!on_of(&root, "a"));
        assert!(!on_of(&root, "b"));
    }

    #[test]
    fn folder_toggle_cascades_to_children_when_switch_all_is_set() {
        let mut root = vec![folder(
            "f",
            false,
            2,
            vec![leaf("c1", false), leaf("c2", false)],
        )];
        set_on_state_of_item(&mut root, "f", true, 2, true);
        assert!(on_of(&root, "f"));
        assert!(on_of(&root, "c1"));
        assert!(on_of(&root, "c2"));
    }

    #[test]
    fn single_choice_folder_does_not_cascade_to_its_children() {
        let mut root = vec![folder("f", false, 1, vec![leaf("c1", false)])];
        set_on_state_of_item(&mut root, "f", true, 2, true);
        assert!(on_of(&root, "f"));
        assert!(
            !on_of(&root, "c1"),
            "children of a single-choice folder are mutually exclusive, so a \
             folder toggle must not switch them all on"
        );
    }

    #[test]
    fn turning_one_child_off_turns_the_parent_off() {
        let mut root = vec![folder(
            "f",
            true,
            2,
            vec![leaf("c1", true), leaf("c2", true)],
        )];
        set_on_state_of_item(&mut root, "c1", false, 2, true);
        assert!(!on_of(&root, "c1"));
        assert!(on_of(&root, "c2"), "the other child stays on");
        assert!(!on_of(&root, "f"), "parent follows its children off");
    }

    #[test]
    fn parent_turns_on_only_once_every_child_is_on() {
        let mut root = vec![folder(
            "f",
            false,
            2,
            vec![leaf("c1", false), leaf("c2", false)],
        )];
        set_on_state_of_item(&mut root, "c1", true, 2, true);
        assert!(
            !on_of(&root, "f"),
            "one of two children on: parent stays off"
        );
        set_on_state_of_item(&mut root, "c2", true, 2, true);
        assert!(on_of(&root, "f"), "all children on: parent turns on");
    }

    #[test]
    fn folder_mode_overrides_the_global_choice_mode_for_its_children() {
        // Global mode is multi-choice, but this folder is single-choice.
        let mut root = vec![folder(
            "f",
            true,
            1,
            vec![leaf("c1", true), leaf("c2", false)],
        )];
        set_on_state_of_item(&mut root, "c2", true, 2, false);
        assert!(on_of(&root, "c2"));
        assert!(
            !on_of(&root, "c1"),
            "single-choice folder unsets the sibling"
        );
    }

    #[test]
    fn nested_folders_reconcile_all_the_way_up() {
        let mut root = vec![folder(
            "outer",
            true,
            2,
            vec![folder("inner", true, 2, vec![leaf("c1", true)])],
        )];
        set_on_state_of_item(&mut root, "c1", false, 2, true);
        assert!(!on_of(&root, "inner"));
        assert!(
            !on_of(&root, "outer"),
            "the reconcile walk must not stop at the first parent"
        );
    }

    #[test]
    fn unknown_id_is_a_no_op() {
        let mut root = vec![leaf("a", true)];
        set_on_state_of_item(&mut root, "nope", false, 1, true);
        assert!(on_of(&root, "a"));
    }

    #[test]
    fn folder_without_its_own_mode_inherits_the_global_choice_mode() {
        let mut root = vec![folder_no_mode(
            "f",
            true,
            vec![leaf("c1", true), leaf("c2", false)],
        )];
        set_on_state_of_item(&mut root, "c2", true, 1, false);
        assert!(on_of(&root, "c2"));
        assert!(
            !on_of(&root, "c1"),
            "a folder with no mode of its own must fall back to the global \
             choice_mode, so single choice still applies to its children"
        );
    }

    #[test]
    fn folder_mode_zero_inherits_the_global_choice_mode() {
        // `0` is the renderer's "unset" value — `parent.folder_mode ||
        // defaultChoiceMode` treats it as falsy.
        let mut root = vec![folder(
            "f",
            true,
            0,
            vec![leaf("c1", true), leaf("c2", false)],
        )];
        set_on_state_of_item(&mut root, "c2", true, 1, false);
        assert!(on_of(&root, "c2"));
        assert!(
            !on_of(&root, "c1"),
            "folder_mode 0 means inherit, not multi-choice"
        );
    }

    #[test]
    fn single_choice_takes_the_children_of_the_folders_it_switches_off() {
        let mut root = vec![
            folder("f", true, 2, vec![leaf("c1", true), leaf("c2", true)]),
            leaf("a", false),
        ];
        set_on_state_of_item(&mut root, "a", true, 1, true);
        assert!(on_of(&root, "a"));
        assert!(!on_of(&root, "f"));
        assert!(
            !on_of(&root, "c1") && !on_of(&root, "c2"),
            "switching a top-level folder off under single choice must cascade to its children"
        );
    }

    #[test]
    fn a_single_choice_folder_does_not_follow_its_children_off() {
        // Its children are mutually exclusive, so the folder's own state is
        // not derived from them — the parent reconcile walk skips it.
        let mut root = vec![folder(
            "f",
            true,
            1,
            vec![leaf("c1", true), leaf("c2", false)],
        )];
        set_on_state_of_item(&mut root, "c1", false, 2, true);
        assert!(!on_of(&root, "c1"));
        assert!(on_of(&root, "f"));
    }

    #[test]
    fn only_folders_cascade_even_if_another_node_type_carries_children() {
        let mut root = vec![json!({
            "id": "l", "title": "l", "type": "local", "on": false,
            "children": [ leaf("c1", false) ],
        })];
        set_on_state_of_item(&mut root, "l", true, 2, true);
        assert!(on_of(&root, "l"));
        assert!(!on_of(&root, "c1"));
    }
}
