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
    pub swhdb: PathBuf,
    pub cfgdb: PathBuf,
}

impl PotDbLayout {
    pub fn at(root: &Path) -> Self {
        let swhdb = root.join("data");
        let cfgdb = root.join("config");
        Self { swhdb, cfgdb }
    }

    pub fn read_config(&self) -> Result<Option<Value>, StorageError> {
        read_optional_json(&self.cfgdb.join("dict/cfg.json"))
    }
}

/// Electron v4 kept this PotDb dictionary under app.getPath("userData"),
/// independent of both the hosts store and the preferences directory.
pub fn electron_data_root(path: &Path) -> Result<Option<PathBuf>, StorageError> {
    #[derive(serde::Deserialize)]
    struct LocalSettings {
        data_dir: Option<String>,
    }

    // A broken symlink is a recorded location we cannot read, not permission
    // to fall back to a potentially stale store in the default directory.
    match std::fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(StorageError::io(path.display().to_string(), e)),
        Ok(_) => {}
    }
    let bytes = std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    let settings: LocalSettings = serde_json::from_slice(&bytes)
        .map_err(|e| StorageError::parse(path.display().to_string(), e))?;
    let root = settings
        .data_dir
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from);
    if root.as_ref().is_some_and(|dir| !dir.is_absolute()) {
        return Err(StorageError::InvalidDataDirChoice {
            reason: format!("relative v4 data_dir in {}", path.display()),
        });
    }
    Ok(root)
}

/// Snapshot of everything migration needs to emit into v5.
#[derive(Debug)]
pub struct PotDbSnapshot {
    pub tree: Vec<Value>,
    pub trashcan: Vec<Value>,
    /// (node_id, content) pairs from `collection/hosts`. System node
    /// (`id == "0"`) is included and filtered out by the orchestrator.
    pub hosts_content: Vec<(String, String)>,
    /// Raw items from `collection/history`, in PotDb insertion order.
    pub history: Vec<Value>,
}

/// A missing or partially available store must be retried before writing a manifest.
pub fn read_potdb(layout: &PotDbLayout) -> Result<Option<PotDbSnapshot>, StorageError> {
    let tree = read_json_array(&layout.swhdb.join("list/tree.json"))?;
    let trashcan = read_json_array(&layout.swhdb.join("list/trashcan.json"))?;
    let Some(history) = read_collection_raw(&layout.swhdb.join("collection/history"))? else {
        return Ok(None);
    };
    if tree.is_none() && trashcan.is_none() && history.is_empty() {
        return Ok(None);
    }
    let Some(hosts) = read_collection_raw(&layout.swhdb.join("collection/hosts"))? else {
        return Ok(None);
    };
    let mut hosts_content = Vec::with_capacity(hosts.len());
    for record in hosts {
        let invalid = || StorageError::InvalidConfigValue {
            key: "PotDb hosts record".into(),
            reason: format!("invalid id or content in {}", layout.swhdb.display()),
        };
        let id = record
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        crate::storage::entries::validate_id(id)?;
        // The v3 importer also inserted whole folder/group nodes into PotDb.
        // Those nodes don't own content and can legitimately omit the field.
        let content = match record.get("content") {
            Some(Value::String(content)) => content.as_str(),
            None if matches!(record["type"].as_str(), Some("folder" | "group")) || id == "0" => "",
            _ => return Err(invalid()),
        };
        hosts_content.push((id.to_owned(), content.to_owned()));
    }
    let trashcan = trashcan.unwrap_or_default();
    if tree.is_none() && !hosts_content.is_empty() {
        // v4 allowed an omitted type and could store records for folders.
        // Match ownership by node ID, including nested trash items.
        let mut trashed_ids = std::collections::HashSet::new();
        let mut pending: Vec<_> = trashcan
            .iter()
            .filter_map(|item| item.get("data"))
            .collect();
        while let Some(node) = pending.pop() {
            if let Some(id) = node["id"].as_str() {
                trashed_ids.insert(id);
            }
            if let Some(children) = node["children"].as_array() {
                pending.extend(children);
            }
        }
        if hosts_content
            .iter()
            .any(|(id, _)| id != "0" && !trashed_ids.contains(id.as_str()))
        {
            return Ok(None);
        }
    }
    // The volume may have disappeared after we read the list but before
    // reading its optional collections. Do not commit that partial snapshot.
    if !layout.swhdb.is_dir() {
        return Ok(None);
    }
    Ok(Some(PotDbSnapshot {
        tree: tree.unwrap_or_default(),
        trashcan,
        hosts_content,
        history,
    }))
}

fn read_optional_json<T: serde::de::DeserializeOwned>(
    path: &Path,
) -> Result<Option<T>, StorageError> {
    let Some(bytes) = crate::storage::read_optional(path)? else {
        return Ok(None);
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| StorageError::parse(path.display().to_string(), e))
}

fn read_json_array(path: &Path) -> Result<Option<Vec<Value>>, StorageError> {
    read_optional_json(path)
}

/// Absent collections are valid. A missing indexed record (or records
/// awaiting their index) indicates that the source is incomplete.
fn read_collection_raw(dir: &Path) -> Result<Option<Vec<Value>>, StorageError> {
    let Some(ids) = read_collection_ids(dir)? else {
        let data = dir.join("data");
        match std::fs::read_dir(&data) {
            Ok(files) => {
                for file in files {
                    let file = file.map_err(|e| StorageError::io(data.display().to_string(), e))?;
                    if file.path().extension().is_some_and(|ext| ext == "json") {
                        return Ok(None);
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(StorageError::io(data.display().to_string(), e)),
        }
        return Ok(Some(Vec::new()));
    };
    let mut out = Vec::with_capacity(ids.len());
    for internal_id in ids {
        // An index from a shared folder must only address records in this collection.
        let name = format!("{internal_id}.json");
        if Path::new(&name).file_name() != Some(std::ffi::OsStr::new(&name)) {
            return Err(StorageError::InvalidConfigValue {
                key: "PotDb collection id".into(),
                reason: format!("invalid record filename in {}", dir.display()),
            });
        }
        let entry_path = dir.join("data").join(name);
        let Some(value) = read_optional_json(&entry_path)? else {
            log::warn!("missing indexed PotDb record {}", entry_path.display());
            return Ok(None);
        };
        out.push(value);
    }
    Ok(Some(out))
}

fn read_collection_ids(dir: &Path) -> Result<Option<Vec<String>>, StorageError> {
    let ids_file = dir.join("ids.json");
    // read_json_array returns None only for a *missing* file and errors on a
    // present-but-non-array one, so a corrupt ids.json aborts the migration
    // rather than silently committing an empty collection. PotDb marks deleted
    // slots with null instead of compacting, so a valid array can be
    // [null, null, "1895", ...]: keep the strings, skip the expected null
    // slots, and warn on anything else so genuine corruption stays visible.
    let Some(raw) = read_json_array(&ids_file)? else {
        return Ok(None);
    };
    let mut ids = Vec::with_capacity(raw.len());
    for v in raw {
        match v {
            Value::String(s) => ids.push(s),
            Value::Null => {}
            other => log::warn!(
                "skipping unexpected non-string id in {}: {other}",
                ids_file.display()
            ),
        }
    }
    Ok(Some(ids))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique temp dir to host a fake PotDb collection's `ids.json`.
    fn temp_collection_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "switchhosts-potdb-test-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_ids(dir: &Path, bytes: &[u8]) {
        std::fs::write(dir.join("ids.json"), bytes).unwrap();
    }

    #[test]
    fn skips_null_slots_and_preserves_order() {
        // The PotDb deletion quirk this fix targets: deleted slots become
        // null instead of being compacted out of the array.
        let dir = temp_collection_dir("null-slots");
        write_ids(&dir, br#"[null, null, "1895", "1896", null, "1897"]"#);

        let ids = read_collection_ids(&dir).unwrap().unwrap();

        assert_eq!(ids, vec!["1895", "1896", "1897"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn all_string_ids_round_trip_in_order() {
        let dir = temp_collection_dir("all-strings");
        write_ids(&dir, br#"["a", "b", "c"]"#);

        let ids = read_collection_ids(&dir).unwrap().unwrap();

        assert_eq!(ids, vec!["a", "b", "c"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_ids_file_is_distinct_from_an_empty_index() {
        let dir = temp_collection_dir("missing");
        assert!(read_collection_ids(&dir).unwrap().is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_array_reads_as_empty() {
        let dir = temp_collection_dir("empty-array");
        write_ids(&dir, b"[]");

        let ids = read_collection_ids(&dir).unwrap().unwrap();

        assert!(ids.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn non_array_root_errors_rather_than_silently_empty() {
        // A present-but-non-array ids.json is corruption, not "no entries":
        // returning empty would let migration commit an empty collection and
        // archive the legacy data with the content gone. It must error so
        // bootstrap aborts before committing — a *missing* file, by contrast,
        // legitimately reads as empty (see missing_ids_file_is_distinct_from_an_empty_index).
        for body in [b"null".as_slice(), b"{}".as_slice(), b"42".as_slice()] {
            let dir = temp_collection_dir("non-array");
            write_ids(&dir, body);

            assert!(
                read_collection_ids(&dir).is_err(),
                "non-array root {body:?} must error, not yield empty"
            );
            std::fs::remove_dir_all(&dir).ok();
        }
    }

    #[test]
    fn skips_unexpected_non_string_entries_but_keeps_strings() {
        // Numbers / objects shouldn't appear in a real ids.json, but if they
        // do we drop the junk (with a warning) rather than failing the whole
        // migration — while still recovering the valid string ids.
        let dir = temp_collection_dir("mixed-junk");
        write_ids(&dir, br#"["1895", 42, {"x": 1}, true, "1896"]"#);

        let ids = read_collection_ids(&dir).unwrap().unwrap();

        assert_eq!(ids, vec!["1895", "1896"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unparseable_json_still_errors() {
        // Genuinely corrupt (non-JSON) content is unrecoverable and should
        // surface as an error rather than be silently swallowed.
        let dir = temp_collection_dir("garbage");
        write_ids(&dir, b"not json at all {{{");

        assert!(read_collection_ids(&dir).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    // read_json_array also backs tree.json / trashcan.json, so its tolerance
    // boundary matters for the whole migration, not just ids.json.

    #[test]
    fn read_json_array_reads_array_elements() {
        let dir = temp_collection_dir("ja-array");
        let path = dir.join("list.json");
        std::fs::write(&path, br#"["x", 1, null]"#).unwrap();

        let arr = read_json_array(&path).unwrap().unwrap();

        assert_eq!(arr.len(), 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_json_array_missing_file_is_absent() {
        let dir = temp_collection_dir("ja-missing");

        let arr = read_json_array(&dir.join("nope.json")).unwrap();

        assert!(arr.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_json_array_errors_on_present_non_array() {
        // tree.json / trashcan.json corruption must abort the migration rather
        // than degrade to an empty list (which for tree.json would drop every
        // host node yet still write manifest.json and archive the legacy data).
        for body in [
            b"{}".as_slice(),
            b"null".as_slice(),
            b"42".as_slice(),
            br#""a string""#.as_slice(),
        ] {
            let dir = temp_collection_dir("ja-nonarray");
            let path = dir.join("list.json");
            std::fs::write(&path, body).unwrap();

            assert!(
                read_json_array(&path).is_err(),
                "non-array {body:?} must error"
            );
            std::fs::remove_dir_all(&dir).ok();
        }
    }
}
