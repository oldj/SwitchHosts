//! Interactive import: parse into memory, preview, then commit the exact draft.
//! Callers hold the store lock before accessing Sessions or committing a draft.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::storage::{
    entries,
    manifest::{self, Manifest},
    transaction::{self, Target},
    tree_format, StorageError, Trashcan, V5Paths,
};

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "snake_case")]
pub enum ImportError {
    #[error("{0}")]
    Invalid(String),
    #[error("The local configuration changed. Preview it again before importing.")]
    Changed,
    #[error("This import preview is no longer available. Select the source again.")]
    Expired,
    #[error(transparent)]
    Storage(#[from] StorageError),
}

fn invalid(code: &str) -> ImportError {
    ImportError::Invalid(code.into())
}

#[derive(Clone, Debug)]
pub struct Draft {
    pub root: Vec<Value>,
    pub contents: BTreeMap<String, String>,
}

#[derive(Clone, Copy, PartialEq)]
enum BackupVersion {
    V3,
    V4,
    V5,
}

const MAX_IMPORT_DEPTH: usize = 60;

fn children(node: &Value) -> &[Value] {
    node.get("children")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
fn id(node: &Value) -> &str {
    node["id"].as_str().unwrap()
}
fn kind(node: &Value) -> &str {
    node["type"].as_str().unwrap_or("local")
}
fn flatten<'a>(nodes: &'a [Value], out: &mut Vec<&'a Value>) {
    for node in nodes {
        out.push(node);
        flatten(children(node), out);
    }
}

/// Parse all supported backup versions without touching the data directory.
pub fn parse(bytes: &[u8]) -> Result<Draft, ImportError> {
    let data: Value = serde_json::from_slice(bytes).map_err(|_| invalid("parse_error"))?;
    let mut contents = BTreeMap::new();
    let (root, version) = if data["format"] == "switchhosts-backup" {
        if data.get("schemaVersion").is_some_and(|v| v != 1)
            || data["manifest"]
                .get("schemaVersion")
                .is_some_and(|v| v != 1)
        {
            return Err(invalid("new_version"));
        }
        let root = data["manifest"]["root"]
            .as_array()
            .ok_or_else(|| invalid("invalid_data"))?;
        validate_v5_shape(root)?;
        let map = data["entries"]
            .as_object()
            .ok_or_else(|| invalid("invalid_data"))?;
        for (key, value) in map {
            contents.insert(
                key.clone(),
                value
                    .as_str()
                    .ok_or_else(|| invalid("invalid_data"))?
                    .into(),
            );
        }
        (import_v5_root(root), BackupVersion::V5)
    } else {
        match data["version"][0].as_u64() {
            Some(3) => (
                data["list"]
                    .as_array()
                    .ok_or_else(|| invalid("invalid_v3_data"))?
                    .clone(),
                BackupVersion::V3,
            ),
            Some(4) => {
                let inner = data["data"]
                    .as_object()
                    .ok_or_else(|| invalid("invalid_data_key"))?;
                let tree = inner
                    .get("list")
                    .and_then(|v| v.get("tree"))
                    .and_then(Value::as_array)
                    .ok_or_else(|| invalid("invalid_data"))?
                    .clone();
                let collection = inner
                    .get("collection")
                    .map(|v| v.as_object().ok_or_else(|| invalid("invalid_data")))
                    .transpose()?;
                let hosts = collection
                    .and_then(|v| v.get("hosts"))
                    .map(|v| v.as_object().ok_or_else(|| invalid("invalid_data")))
                    .transpose()?;
                let rows = hosts
                    .and_then(|v| v.get("data"))
                    .map(|v| v.as_array().ok_or_else(|| invalid("invalid_data")))
                    .transpose()?;
                if rows.is_none() {
                    // Sparse records represent untouched empty configurations;
                    // a missing collection cannot establish that their content
                    // was exported at all. Do not turn a truncated backup into
                    // empty files, especially for replacement imports.
                    let mut nodes = Vec::new();
                    flatten(&tree, &mut nodes);
                    if nodes.iter().any(|node| {
                        ["local", "remote"].contains(&kind(node))
                            && node["id"] != "0"
                            && node["id"] != 0
                            && node["is_sys"] != true
                            && node["isSys"] != true
                    }) {
                        return Err(invalid("missing_content"));
                    }
                }
                if let Some(rows) = rows {
                    for entry in rows {
                        let key = string_id(&entry["id"])?;
                        let content = entry["content"]
                            .as_str()
                            .ok_or_else(|| invalid("invalid_data"))?;
                        if contents.insert(key, content.into()).is_some() {
                            return Err(invalid("duplicate_id"));
                        }
                    }
                }
                (tree, BackupVersion::V4)
            }
            Some(n) if n > 4 => return Err(invalid("new_version")),
            _ => return Err(invalid("invalid_data")),
        }
    };
    let mut seen = HashSet::new();
    let root = normalize(&root, version, &mut contents, &mut seen, 0)?;
    if root.is_empty() {
        return Err(invalid("empty_import"));
    }
    // Orphan content and the backup's trash/history never enter the import.
    let mut content_ids = Vec::new();
    manifest::collect_content_ids(&root, &mut content_ids);
    let content_ids: HashSet<_> = content_ids.into_iter().collect();
    contents.retain(|key, _| content_ids.contains(key));
    let draft = Draft { root, contents };
    validate_references(&draft)?;
    Ok(draft)
}

// Check fields that the tolerant storage translator would otherwise discard.
// A damaged folder must not silently become an empty folder on import.
fn validate_v5_shape(nodes: &[Value]) -> Result<(), ImportError> {
    for node in nodes {
        if !node.is_object() || node.get("type").is_some_and(|v| !v.is_string()) {
            return Err(invalid("invalid_data"));
        }
        if let Some(nested) = node.get("children") {
            let nested = nested.as_array().ok_or_else(|| invalid("invalid_data"))?;
            if kind(node) != "folder" && !nested.is_empty() {
                return Err(invalid("invalid_data"));
            }
            validate_v5_shape(nested)?;
        }
        for key in ["group", "folder", "extras"] {
            if node.get(key).is_some_and(|v| !v.is_object()) {
                return Err(invalid("invalid_data"));
            }
        }
        if node
            .get("source")
            .is_some_and(|v| !v.is_object() && !v.is_string())
        {
            return Err(invalid("invalid_data"));
        }
    }
    Ok(())
}

// Backups exported by this app contain renderer-shaped nodes; on-disk v5
// nodes are accepted too. Translate their modeled fields without discarding
// top-level extension fields or the exported folder collapse state.
fn import_v5_root(nodes: &[Value]) -> Vec<Value> {
    nodes
        .iter()
        .map(|raw| {
            let fields: serde_json::Map<String, Value> = raw
                .as_object()
                .unwrap()
                .iter()
                .filter(|(key, _)| key.as_str() != "children")
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect();
            let mut node = tree_format::v5_root_to_legacy(&[json!(fields)], &[]).remove(0);
            let out = node.as_object_mut().unwrap();
            for (key, value) in fields {
                if ![
                    "source",
                    "group",
                    "folder",
                    "extras",
                    "isSys",
                    "contentFile",
                ]
                .contains(&key.as_str())
                {
                    out.entry(key).or_insert(value);
                }
            }
            if let Some(nested) = raw.get("children").and_then(Value::as_array) {
                out.insert("children".into(), json!(import_v5_root(nested)));
            }
            node
        })
        .collect()
}

fn string_id(value: &Value) -> Result<String, ImportError> {
    match value {
        Value::String(s) if !s.is_empty() => Ok(s.clone()),
        Value::Number(n) => Ok(n.to_string()),
        _ => Err(invalid("invalid_data")),
    }
}

fn normalize(
    nodes: &[Value],
    version: BackupVersion,
    contents: &mut BTreeMap<String, String>,
    seen: &mut HashSet<String>,
    depth: usize,
) -> Result<Vec<Value>, ImportError> {
    if depth > MAX_IMPORT_DEPTH {
        return Err(invalid("invalid_data"));
    }
    let mut result = Vec::new();
    for raw in nodes {
        let mut node = raw
            .as_object()
            .ok_or_else(|| invalid("invalid_data"))?
            .clone();
        let key = string_id(&raw["id"])?;
        if key == "0" || raw["is_sys"] == true || raw["isSys"] == true {
            continue;
        }
        if !seen.insert(key.clone()) {
            return Err(invalid("duplicate_id"));
        }
        if seen.len() > 10_000 {
            return Err(invalid("invalid_data"));
        }
        let type_field = if version == BackupVersion::V3 {
            raw.get("where").or(raw.get("type"))
        } else {
            raw.get("type")
        };
        if type_field.is_some_and(|v| !v.is_string()) {
            return Err(invalid("invalid_data"));
        }
        let node_kind = type_field.and_then(Value::as_str).unwrap_or("local");
        if !["local", "remote", "group", "folder"].contains(&node_kind) {
            return Err(invalid("invalid_data"));
        }
        node.insert("id".into(), json!(key));
        node.insert("type".into(), json!(node_kind));
        node.insert("on".into(), json!(false));
        for field in ["where", "content", "is_sys", "isSys", "contentFile"] {
            node.remove(field);
        }
        if raw.get("title").is_some_and(|v| !v.is_string()) {
            return Err(invalid("invalid_data"));
        }
        for key in [
            "url",
            "source",
            "last_refresh",
            "last_attempt",
            "domain_refresh_status",
        ] {
            if raw.get(key).is_some_and(|v| !v.is_string()) {
                return Err(invalid("invalid_data"));
            }
        }
        for key in [
            "refresh_interval",
            "last_refresh_ms",
            "last_attempt_ms",
            "folder_mode",
        ] {
            if raw.get(key).is_some_and(|v| v.as_u64().is_none()) {
                return Err(invalid("invalid_data"));
            }
        }
        if raw.get("domains").is_some_and(|v| {
            v.as_array()
                .is_none_or(|a| a.iter().any(|v| !v.is_string()))
        }) {
            return Err(invalid("invalid_data"));
        }
        if let Some(results) = raw.get("domain_results") {
            if serde_json::from_value::<Vec<crate::dns::DomainResult>>(results.clone()).is_err() {
                return Err(invalid("invalid_data"));
            }
        }
        if version == BackupVersion::V3 {
            if let Some(hours) = raw.get("refresh_interval") {
                let seconds = hours
                    .as_u64()
                    .and_then(|n| n.checked_mul(3600))
                    .ok_or_else(|| invalid("invalid_data"))?;
                node.insert("refresh_interval".into(), json!(seconds));
            }
        }
        if node_kind == "folder" {
            let source = match raw.get("children") {
                None => &[][..],
                Some(Value::Array(a)) => a,
                _ => return Err(invalid("invalid_data")),
            };
            node.insert(
                "children".into(),
                json!(normalize(source, version, contents, seen, depth + 1)?),
            );
        } else if raw
            .get("children")
            .is_some_and(|v| v.as_array().is_none_or(|a| !a.is_empty()))
        {
            return Err(invalid("invalid_data"));
        } else {
            node.remove("children");
        }
        if node_kind == "group" {
            let refs = match raw.get("include") {
                None => vec![],
                Some(Value::Array(a)) => a.iter().map(string_id).collect::<Result<Vec<_>, _>>()?,
                _ => return Err(invalid("invalid_reference")),
            };
            node.insert("include".into(), json!(refs));
        } else {
            node.remove("include");
        }
        if ["local", "remote"].contains(&node_kind) {
            if version == BackupVersion::V3 {
                contents.insert(
                    key.clone(),
                    raw.get("content")
                        .map(|v| v.as_str().ok_or_else(|| invalid("invalid_data")))
                        .transpose()?
                        .unwrap_or("")
                        .into(),
                );
            }
            // PotDb creates content records lazily, so untouched v4 nodes
            // legitimately have no record. V5 exports always include every
            // content-owning node; a missing v5 entry remains an error.
            if version == BackupVersion::V4 {
                contents.entry(key.clone()).or_default();
            }
            let content = contents
                .get_mut(&key)
                .ok_or_else(|| invalid("missing_content"))?;
            *content = entries::normalize_to_lf(content);
        }
        result.push(Value::Object(node));
    }
    Ok(result)
}

fn validate_references(draft: &Draft) -> Result<(), ImportError> {
    let mut nodes = Vec::new();
    flatten(&draft.root, &mut nodes);
    let by_id: HashMap<_, _> = nodes.iter().map(|n| (id(n), *n)).collect();
    fn visit<'a>(
        key: &'a str,
        nodes: &HashMap<&'a str, &'a Value>,
        visiting: &mut HashSet<&'a str>,
        heights: &mut HashMap<&'a str, usize>,
        depth: usize,
    ) -> Result<usize, ImportError> {
        if depth > MAX_IMPORT_DEPTH {
            return Err(invalid("invalid_data"));
        }
        if let Some(&height) = heights.get(key) {
            // Reusing a validated subgraph must account for its full depth,
            // not just the single edge to it. Otherwise node ordering lets
            // arbitrarily deep chains bypass the limit and overflow the UI.
            return if depth + height <= MAX_IMPORT_DEPTH {
                Ok(height)
            } else {
                Err(invalid("invalid_data"))
            };
        }
        if !visiting.insert(key) {
            return Err(invalid("cyclic_reference"));
        }
        let node = nodes.get(key).ok_or_else(|| invalid("invalid_reference"))?;
        let mut height = 0;
        for child in children(node) {
            height = height.max(1 + visit(id(child), nodes, visiting, heights, depth + 1)?);
        }
        if kind(node) == "group" {
            for reference in node["include"].as_array().unwrap() {
                height = height.max(
                    1 + visit(
                        reference.as_str().unwrap(),
                        nodes,
                        visiting,
                        heights,
                        depth + 1,
                    )?,
                );
            }
        }
        visiting.remove(key);
        heights.insert(key, height);
        Ok(height)
    }
    let mut heights = HashMap::new();
    for node in nodes {
        visit(id(node), &by_id, &mut HashSet::new(), &mut heights, 0)?;
    }
    Ok(())
}

#[derive(PartialEq)]
struct Snapshot {
    root: Vec<Value>,
    contents: BTreeMap<String, String>,
}
impl Snapshot {
    fn read(paths: &V5Paths) -> Result<Self, StorageError> {
        let root = Manifest::load(paths)?.root;
        let mut ids = Vec::new();
        manifest::collect_content_ids(&root, &mut ids);
        let contents = ids
            .into_iter()
            .filter(|id| id != "0")
            .map(|id| entries::read_entry(&paths.entries_dir, &id).map(|content| (id, content)))
            .collect::<Result<_, _>>()?;
        Ok(Self { root, contents })
    }
}

#[derive(Serialize)]
pub struct Preview {
    id: String,
    name: String,
    pub list: Vec<Value>,
    contents: BTreeMap<String, String>,
    existing_list: Vec<Value>,
    same_title: Vec<String>,
    same_content: Vec<String>,
}
struct Pending {
    id: String,
    name: String,
    draft: Draft,
    before: Snapshot,
}
impl Pending {
    fn preview(&self) -> Preview {
        let mut current = Vec::new();
        flatten(&self.before.root, &mut current);
        let mut imported = Vec::new();
        flatten(&self.draft.root, &mut imported);
        let titles: HashSet<_> = current.iter().filter_map(|n| n["title"].as_str()).collect();
        let contents: HashSet<_> = self.before.contents.values().map(String::as_str).collect();
        Preview {
            id: self.id.clone(),
            name: self.name.clone(),
            list: self.draft.root.clone(),
            contents: self.draft.contents.clone(),
            existing_list: self.before.root.clone(),
            same_title: imported
                .iter()
                .filter(|n| n["title"].as_str().is_some_and(|s| titles.contains(s)))
                .map(|n| id(n).into())
                .collect(),
            same_content: self
                .draft
                .contents
                .iter()
                .filter(|(_, v)| contents.contains(v.as_str()))
                .map(|(id, _)| id.clone())
                .collect(),
        }
    }
}

#[derive(Default)]
pub struct Sessions(Mutex<Option<Pending>>);

fn fresh_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "import-{:x}-{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

impl Sessions {
    pub fn prepare(
        &self,
        draft: Draft,
        name: String,
        paths: &V5Paths,
    ) -> Result<Preview, ImportError> {
        // Titles are display names, never filesystem paths. Bound URL-derived
        // suggestions as well as local filenames so the default can be used.
        let mut name = name.trim().to_string();
        while name.len() > 240 {
            name.pop();
        }
        if name.is_empty() {
            name = "import".into();
        }
        let pending = Pending {
            id: fresh_id(),
            name,
            draft,
            before: Snapshot::read(paths)?,
        };
        let preview = pending.preview();
        *self.0.lock().unwrap() = Some(pending);
        Ok(preview)
    }
    pub fn discard(&self, token: &str) {
        let mut session = self.0.lock().unwrap();
        if session.as_ref().is_some_and(|s| s.id == token) {
            *session = None;
        }
    }
    pub fn rebase(&self, token: &str, paths: &V5Paths) -> Result<Preview, ImportError> {
        let mut session = self.0.lock().unwrap();
        let pending = session
            .as_mut()
            .filter(|s| s.id == token)
            .ok_or(ImportError::Expired)?;
        pending.before = Snapshot::read(paths)?;
        Ok(pending.preview())
    }
    pub fn commit(&self, request: Request, paths: &V5Paths) -> Result<Value, ImportError> {
        let mut session = self.0.lock().unwrap();
        let pending = session
            .as_ref()
            .filter(|s| s.id == request.id)
            .ok_or(ImportError::Expired)?;
        if Snapshot::read(paths)? != pending.before {
            return Err(ImportError::Changed);
        }
        if request.mode == Mode::Replace && !request.confirmed {
            return Err(invalid("confirmation_required"));
        }
        let mut all = Vec::new();
        flatten(&pending.draft.root, &mut all);
        let by_id: HashMap<_, _> = all.iter().map(|n| (id(n), *n)).collect();
        let selected: HashSet<&str> = if request.mode == Mode::Replace {
            by_id.keys().copied().collect()
        } else {
            request.selected.iter().map(String::as_str).collect()
        };
        if selected.is_empty() {
            return Err(invalid("empty_import"));
        }
        if selected.iter().any(|id| !by_id.contains_key(id)) {
            return Err(invalid("invalid_data"));
        }
        // A folder ID means its complete subtree. The UI submits fully selected
        // folders only; partially selected ancestors are rebuilt by prune().
        let mut included = selected.clone();
        for key in &selected {
            let mut nested = Vec::new();
            flatten(children(by_id[key]), &mut nested);
            included.extend(nested.into_iter().map(id));
        }
        for key in &included {
            let node = by_id[key];
            if kind(node) == "group"
                && node["include"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|r| !included.contains(r.as_str().unwrap()))
            {
                return Err(invalid("missing_dependency"));
            }
        }
        fn prune(nodes: &[Value], included: &HashSet<&str>) -> Vec<Value> {
            nodes
                .iter()
                .filter_map(|node| {
                    let mut copy = node.clone();
                    let nested = prune(children(node), included);
                    if !included.contains(id(node)) && nested.is_empty() {
                        return None;
                    }
                    if kind(node) == "folder" {
                        copy["children"] = json!(nested);
                    }
                    Some(copy)
                })
                .collect()
        }
        let mut imported = prune(&pending.draft.root, &included);
        let mut nodes = Vec::new();
        flatten(&imported, &mut nodes);
        let mut mapping = HashMap::new();
        for node in nodes {
            let mut next = fresh_id();
            while entries::entry_path(&paths.entries_dir, &next)?.exists() {
                next = fresh_id();
            }
            mapping.insert(id(node).to_string(), next);
        }
        fn remap(nodes: &mut [Value], ids: &HashMap<String, String>) {
            for node in nodes {
                let old = id(node).to_string();
                node["id"] = json!(ids[&old]);
                node["on"] = json!(false);
                if let Some(include) = node.get_mut("include").and_then(Value::as_array_mut) {
                    for reference in include {
                        *reference = json!(ids[reference.as_str().unwrap()]);
                    }
                }
                if let Some(nested) = node.get_mut("children").and_then(Value::as_array_mut) {
                    remap(nested, ids);
                }
            }
        }
        remap(&mut imported, &mapping);
        let imported_count = included
            .iter()
            .filter(|key| kind(by_id[*key]) != "folder")
            .count();
        let mut root = if request.mode == Mode::Append {
            pending.before.root.clone()
        } else {
            Vec::new()
        };
        if request.mode == Mode::Append {
            let mut titles: BTreeSet<String> = root
                .iter()
                .filter_map(|n| n["title"].as_str().map(String::from))
                .collect();
            fn unique(title: &str, titles: &mut BTreeSet<String>) -> String {
                let mut name = title.to_string();
                let mut n = 2;
                while titles.contains(&name) {
                    name = format!("{title} ({n})");
                    n += 1;
                }
                titles.insert(name.clone());
                name
            }
            if let Some(folder) = request.folder_name.as_deref() {
                if folder.trim().is_empty() || folder.len() > 255 {
                    return Err(invalid("invalid_data"));
                }
                imported = vec![
                    json!({"id":fresh_id(),"type":"folder","title":unique(folder.trim(), &mut titles),"on":false,"folder_mode":0,"children":imported}),
                ];
            } else {
                for node in &mut imported {
                    let title = node["title"].as_str().unwrap_or("").to_string();
                    node["title"] = json!(unique(&title, &mut titles));
                }
            }
        }
        root.extend(imported);
        let writes: Vec<_> = pending
            .draft
            .contents
            .iter()
            .filter_map(|(old, content)| mapping.get(old).map(|new| (new.clone(), content)))
            .collect();
        // Removing replaced entries is safe only if the local trashcan does not
        // still own them. All deletions and new files participate in rollback.
        let mut protected = Vec::new();
        for item in Trashcan::load(&paths.trashcan_file)?.items {
            manifest::collect_content_ids(&[item["data"].clone()], &mut protected);
        }
        let deletions: Vec<_> = if request.mode == Mode::Replace {
            pending
                .before
                .contents
                .keys()
                .filter(|id| !protected.contains(id))
                .cloned()
                .collect()
        } else {
            vec![]
        };
        let mut targets = vec![Target::Manifest, Target::State];
        targets.extend(writes.iter().map(|(id, _)| Target::Entry(id.clone())));
        targets.extend(deletions.iter().cloned().map(Target::Entry));
        transaction::run(paths, targets, || {
            for (id, content) in &writes {
                entries::write_entry(&paths.entries_dir, id, content)?;
            }
            Manifest {
                root,
                ..Default::default()
            }
            .save(paths)?;
            for id in &deletions {
                entries::delete_entry(&paths.entries_dir, id)?;
            }
            Ok(())
        })?;
        *session = None;
        Ok(json!({"imported":imported_count}))
    }
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Append,
    Replace,
}
#[derive(Deserialize)]
pub struct Request {
    pub id: String,
    pub mode: Mode,
    #[serde(default)]
    pub selected: Vec<String>,
    #[serde(default)]
    pub folder_name: Option<String>,
    #[serde(default)]
    pub confirmed: bool,
}

#[cfg(test)]
mod tests;

// Fixtures in history and refresh tests go through the same parse/preview/commit
// path as the shipped command, including fresh IDs and replacement validation.
#[cfg(test)]
pub(crate) fn replace_for_test(data: &Value, paths: &V5Paths) -> Vec<Value> {
    let sessions = Sessions::default();
    let draft = parse(&serde_json::to_vec(data).unwrap()).unwrap();
    let preview = sessions.prepare(draft, "test".into(), paths).unwrap();
    sessions
        .commit(
            Request {
                id: preview.id,
                mode: Mode::Replace,
                selected: vec![],
                folder_name: None,
                confirmed: true,
            },
            paths,
        )
        .unwrap();
    Manifest::load(paths).unwrap().root
}
