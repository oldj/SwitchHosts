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
        // A missing file legitimately means "empty".
        None => Ok(Vec::new()),
        Some(Value::Array(arr)) => Ok(arr),
        // Present but not an array → corruption. Surface it as a parse error so
        // migration aborts before committing manifest.json / archiving the
        // legacy data, rather than silently degrading to an empty list (which
        // for tree.json would drop every host node). Re-deserializing the
        // non-array value yields a descriptive serde error ("invalid type: …").
        Some(other) => serde_json::from_value::<Vec<Value>>(other)
            .map_err(|e| StorageError::parse(path.display().to_string(), e)),
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
    // read_json_array returns empty only for a *missing* file and errors on a
    // present-but-non-array one, so a corrupt ids.json aborts the migration
    // rather than silently committing an empty collection. PotDb marks deleted
    // slots with null instead of compacting, so a valid array can be
    // [null, null, "1895", ...]: keep the strings, skip the expected null
    // slots, and warn on anything else so genuine corruption stays visible.
    let raw = read_json_array(&ids_file)?;
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
    Ok(ids)
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

        let ids = read_collection_ids(&dir).unwrap();

        assert_eq!(ids, vec!["1895", "1896", "1897"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn all_string_ids_round_trip_in_order() {
        let dir = temp_collection_dir("all-strings");
        write_ids(&dir, br#"["a", "b", "c"]"#);

        let ids = read_collection_ids(&dir).unwrap();

        assert_eq!(ids, vec!["a", "b", "c"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_ids_file_reads_as_empty() {
        let dir = temp_collection_dir("missing");

        let ids = read_collection_ids(&dir).unwrap();

        assert!(ids.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_array_reads_as_empty() {
        let dir = temp_collection_dir("empty-array");
        write_ids(&dir, b"[]");

        let ids = read_collection_ids(&dir).unwrap();

        assert!(ids.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn non_array_root_errors_rather_than_silently_empty() {
        // A present-but-non-array ids.json is corruption, not "no entries":
        // returning empty would let migration commit an empty collection and
        // archive the legacy data with the content gone. It must error so
        // bootstrap aborts before committing — a *missing* file, by contrast,
        // legitimately reads as empty (see missing_ids_file_reads_as_empty).
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

        let ids = read_collection_ids(&dir).unwrap();

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

        let arr = read_json_array(&path).unwrap();

        assert_eq!(arr.len(), 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_json_array_missing_file_is_empty() {
        let dir = temp_collection_dir("ja-missing");

        let arr = read_json_array(&dir.join("nope.json")).unwrap();

        assert!(arr.is_empty());
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
