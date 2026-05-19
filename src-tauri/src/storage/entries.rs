//! `~/.SwitchHosts/entries/<id>.hosts` reader and writer.
//!
//! Every local/remote node owns one file under `entries/`. Filenames
//! are `<node-id>.hosts`; moves and renames of the node never rename
//! the file.
//!
//! Content is **always normalized to LF on read and write**. CRLF / lone
//! CR coming from imported backups, remote-hosts refresh, or v4
//! migration is collapsed at this boundary so downstream consumers
//! (Find offsets, the renderer's CodeMirror view, aggregation for
//! apply) all see the same byte stream. The platform-native newline
//! conversion happens only in
//! [`crate::hosts_apply::apply_to_system_hosts`] right before writing
//! the system hosts file.

use std::path::{Path, PathBuf};

use super::atomic::atomic_write;
use super::error::StorageError;

/// Collapse CRLF / lone CR to LF. Order matters: handle CRLF first so
/// the `\r` half doesn't trip the lone-CR pass. Exposed at crate scope
/// so callers (e.g. `refresh::refresh_one`) can compare normalized
/// content against the on-disk LF view without duplicating the logic.
pub(crate) fn normalize_to_lf(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}

/// Resolve the path for a node's content file. `id` is expected to be
/// a UUID or similar opaque identifier — we validate it is a "simple"
/// name to defend against path traversal before concatenating.
pub fn entry_path(entries_dir: &Path, id: &str) -> Result<PathBuf, StorageError> {
    validate_id(id)?;
    Ok(entries_dir.join(format!("{id}.hosts")))
}

fn validate_id(id: &str) -> Result<(), StorageError> {
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains('\0')
        || id.contains("..")
    {
        return Err(StorageError::InvalidConfigValue {
            key: "entry_id".into(),
            reason: format!("illegal entry id: {id:?}"),
        });
    }
    Ok(())
}

/// Read a node's content. Missing file → empty string (matches Electron
/// `swhdb.collection.hosts.find(...)?.content ?? ""`). The returned
/// string is guaranteed to use LF line endings even if the on-disk
/// file still has CRLF / CR from a v4 migration or a hand-edited file.
pub fn read_entry(entries_dir: &Path, id: &str) -> Result<String, StorageError> {
    let path = entry_path(entries_dir, id)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| StorageError::io(path.display().to_string(), e))?;
    Ok(normalize_to_lf(&raw))
}

/// Write a node's content. The input may use any line endings (e.g.
/// CRLF from a Windows-authored remote hosts file); it is normalized
/// to LF before hitting disk so the on-disk invariant holds.
pub fn write_entry(entries_dir: &Path, id: &str, content: &str) -> Result<(), StorageError> {
    let path = entry_path(entries_dir, id)?;
    let normalized = normalize_to_lf(content);
    atomic_write(&path, normalized.as_bytes())
}

/// Delete a node's content file. No-op if the file is already gone.
/// Used by trashcan "delete permanently" and "clear trashcan" commands.
pub fn delete_entry(entries_dir: &Path, id: &str) -> Result<(), StorageError> {
    let path = entry_path(entries_dir, id)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(StorageError::io(path.display().to_string(), e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_entries_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "switchhosts-entries-test-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_collapses_crlf_to_lf() {
        // Write raw CRLF bytes directly (bypassing write_entry) so this
        // test exercises the read normalization, not the write side.
        let dir = temp_entries_dir("read-crlf");
        let path = entry_path(&dir, "node-1").unwrap();
        std::fs::write(&path, b"line1\r\nline2\r\nline3").unwrap();

        let content = read_entry(&dir, "node-1").unwrap();

        assert_eq!(content, "line1\nline2\nline3");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_collapses_lone_cr_to_lf() {
        let dir = temp_entries_dir("read-cr");
        let path = entry_path(&dir, "node-1").unwrap();
        std::fs::write(&path, b"old-mac\rstyle\rline").unwrap();

        let content = read_entry(&dir, "node-1").unwrap();

        assert_eq!(content, "old-mac\nstyle\nline");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_persists_crlf_input_as_lf_bytes() {
        let dir = temp_entries_dir("write-crlf");
        write_entry(&dir, "node-1", "line1\r\nline2\r\nline3").unwrap();

        let on_disk = std::fs::read(entry_path(&dir, "node-1").unwrap()).unwrap();

        assert_eq!(on_disk, b"line1\nline2\nline3");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn lf_content_round_trips_unchanged() {
        let dir = temp_entries_dir("round-trip-lf");
        let original = "line1\nline2\nline3\n";
        write_entry(&dir, "node-1", original).unwrap();

        let read_back = read_entry(&dir, "node-1").unwrap();
        let on_disk = std::fs::read(entry_path(&dir, "node-1").unwrap()).unwrap();

        assert_eq!(read_back, original);
        assert_eq!(on_disk, original.as_bytes());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_entry_reads_as_empty_string() {
        let dir = temp_entries_dir("missing");

        let content = read_entry(&dir, "does-not-exist").unwrap();

        assert_eq!(content, "");
        std::fs::remove_dir_all(&dir).ok();
    }
}
