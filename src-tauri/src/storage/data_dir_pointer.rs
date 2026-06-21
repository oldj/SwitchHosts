//! Persistent pointer to a user-chosen data directory.
//!
//! v5 normally stores everything under `~/.SwitchHosts`. When the user
//! picks a custom data location, the absolute path of that directory is
//! recorded here — in a small JSON file that lives **outside** the data
//! directory itself (under the platform config dir), so the pointer is
//! readable before the data layout is known at startup.
//!
//! The pointer must never be stored inside the data directory: that file
//! would move with the data and could not be read to find the data in the
//! first place. It also must never panic on read. A *missing* pointer falls
//! back to the default location silently (a fresh install / after a reset);
//! a pointer that *exists but is unreadable, corrupt, empty, or relative* is
//! reported as `Invalid` instead, so the app can prompt the user to recover
//! rather than silently using the default — which would hide the user's real
//! data and risk migrating stale data in the default location (see
//! `paths::choose_root`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::atomic::atomic_write;
use super::error::StorageError;

/// Sub-directory under the platform config dir. Matches the Tauri bundle
/// identifier (tauri.conf.json) so the pointer sits next to where
/// `app_config_dir()` would resolve.
const POINTER_DIR_NAME: &str = "net.oldj.switchhosts";
const POINTER_FILE_NAME: &str = "data_dir.json";
const POINTER_FORMAT: &str = "switchhosts-data-dir-pointer";
const POINTER_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct PointerEnvelope {
    #[serde(default)]
    format: String,
    #[serde(default, rename = "schemaVersion")]
    schema_version: u32,
    data_dir: String,
}

/// Absolute path of the pointer file, e.g. on macOS
/// `~/Library/Application Support/net.oldj.switchhosts/data_dir.json`.
/// `None` when the platform has no config dir (e.g. a headless Linux box
/// with no `$XDG_CONFIG_HOME`/`$HOME`).
pub fn pointer_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join(POINTER_DIR_NAME).join(POINTER_FILE_NAME))
}

/// Outcome of reading the data-dir pointer. The three states are kept
/// distinct on purpose: an *absent* pointer is the normal default-location
/// case, but a pointer that exists yet can't be used must NOT be collapsed
/// into "absent" — that would silently drop a user who had a custom
/// directory back onto the default root (see module docs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PointerState {
    /// No pointer file is recorded → use the default location silently.
    Absent,
    /// A usable absolute custom data directory was recorded.
    Recorded(PathBuf),
    /// A pointer file exists but is unreadable / corrupt / empty / holds a
    /// relative path. The custom location is unknown; the caller must fall
    /// back to default *and* trigger the recovery flow.
    Invalid,
}

/// Read the recorded custom data directory. Never panics, never errors:
/// returns `Absent` when no pointer is present, `Recorded` for a valid
/// absolute path, or `Invalid` when a pointer exists but is unusable.
pub fn load() -> PointerState {
    match pointer_path() {
        Some(p) => load_from(&p),
        None => PointerState::Absent,
    }
}

/// Whether a pointer entry is currently present on disk, regardless of
/// whether its contents are valid. Lets a "reset" skip a pointless app
/// restart when there is nothing to clear (we are already on the default
/// root with no pointer). Keyed on entry presence — not on the active root —
/// so the corrupt-pointer recovery state (default root, bad pointer still on
/// disk) is correctly treated as "has something to clear".
///
/// Uses `symlink_metadata`, not `exists()`: `exists()` follows symlinks, so a
/// *dangling* symlink at the pointer path would report as missing and a
/// "reset" would no-op instead of clearing the broken link.
pub fn pointer_exists() -> bool {
    pointer_path().map(|p| entry_present(&p)).unwrap_or(false)
}

/// Record `root` as the custom data directory.
pub fn save(root: &Path) -> Result<(), StorageError> {
    let path = pointer_path().ok_or_else(|| StorageError::InvalidDataDirChoice {
        reason: "no platform config directory available to store the data-dir pointer".into(),
    })?;
    save_to(&path, root)
}

/// Remove the pointer so the app falls back to the default location.
/// A missing pointer is treated as success.
pub fn clear() -> Result<(), StorageError> {
    let Some(path) = pointer_path() else {
        return Ok(());
    };
    clear_at(&path)
}

// ---- testable internals (take an explicit path) ----------------------------

/// Whether a file-system entry exists at `path`. Does not follow symlinks (so
/// a dangling symlink counts as present), and treats a stat error that isn't
/// `NotFound` (e.g. a permission problem on the parent) as present too. This
/// MUST mirror `load_from`'s mapping — `NotFound` → `Absent`, any other state
/// → `Invalid` — so the two agree. Otherwise a pointer that `load` flags for
/// recovery could be seen as "nothing to clear" by `reset`, which would
/// short-circuit to `{ changed: false }` and leave the recovery dialog's "Use
/// Default" button spinning forever on a no-op that never restarts.
fn entry_present(path: &Path) -> bool {
    match std::fs::symlink_metadata(path) {
        Ok(_) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => true,
    }
}

fn load_from(path: &Path) -> PointerState {
    // symlink_metadata, not exists(): exists() follows symlinks, so a
    // *dangling* symlink at the pointer path reports as missing → Absent →
    // silent default, which would strand a user who had a custom directory.
    // Any present entry (file, directory, or dangling symlink) is treated as
    // a pointer to read; an unreadable one then becomes Invalid (recovery).
    match std::fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return PointerState::Absent,
        Err(e) => {
            log::warn!(
                "data-dir pointer at {} cannot be inspected: {e}; entering recovery",
                path.display()
            );
            return PointerState::Invalid;
        }
        Ok(_) => {}
    }
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            log::warn!(
                "data-dir pointer at {} unreadable: {e}; entering recovery",
                path.display()
            );
            return PointerState::Invalid;
        }
    };
    match serde_json::from_slice::<PointerEnvelope>(&bytes) {
        Ok(env) => {
            // Use trim() only to detect a blank value; build the path from
            // the raw string so legitimate leading/trailing spaces in a
            // directory name are preserved (save stores the exact path).
            if env.data_dir.trim().is_empty() {
                log::warn!(
                    "data-dir pointer at {} has an empty data_dir; entering recovery",
                    path.display()
                );
                return PointerState::Invalid;
            }
            let path_buf = PathBuf::from(&env.data_dir);
            // The pointer must hold an absolute path (we always save one).
            // Reject a relative path so a tampered/corrupt file can't make
            // us resolve the data root against the current working dir.
            if !path_buf.is_absolute() {
                log::warn!(
                    "data-dir pointer at {} is not an absolute path ({}); entering recovery",
                    path.display(),
                    env.data_dir
                );
                return PointerState::Invalid;
            }
            PointerState::Recorded(path_buf)
        }
        Err(e) => {
            log::warn!(
                "data-dir pointer at {} failed to parse: {e}; entering recovery",
                path.display()
            );
            PointerState::Invalid
        }
    }
}

fn save_to(path: &Path, root: &Path) -> Result<(), StorageError> {
    // Symmetric with `load_from`, which rejects non-absolute pointers: only
    // ever persist an absolute data directory.
    if !root.is_absolute() {
        return Err(StorageError::InvalidDataDirChoice {
            reason: format!(
                "refusing to save a non-absolute data directory: {}",
                root.display()
            ),
        });
    }
    let env = PointerEnvelope {
        format: POINTER_FORMAT.to_string(),
        schema_version: POINTER_SCHEMA_VERSION,
        data_dir: root.display().to_string(),
    };
    // If a corrupt directory sits at the pointer path, atomic_write's rename
    // can't replace it — remove it first so saving a new pointer works (so
    // the recovery dialog's "Choose New" / the "Change data directory" action
    // can get the user out of this state).
    remove_corrupt_dir_at(path)?;
    let json = serde_json::to_vec_pretty(&env)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &json)
}

fn clear_at(path: &Path) -> Result<(), StorageError> {
    // Handle the directory case first: remove_file below can't delete one.
    remove_corrupt_dir_at(path)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(StorageError::io(path.display().to_string(), e)),
    }
}

/// If a *directory* sits where the pointer file belongs (a sync tool or a
/// stray `mkdir` can create one), remove it. Such a directory makes the
/// pointer unreadable (`load` → `Invalid`) AND would otherwise wedge recovery:
/// `remove_file` can't delete a directory (so "Use Default" fails) and
/// `atomic_write`'s rename can't replace one (so "Choose New" fails), leaving
/// the user stuck in the recovery dialog with no working action. `remove_dir_all`
/// clears it whether or not it's empty (its location is SwitchHosts' own fixed
/// pointer path, never user data). No-op for a regular file, a symlink, or a
/// missing path: `symlink_metadata` is not followed, so a symlink is left for
/// `remove_file` / rename to handle.
fn remove_corrupt_dir_at(path: &Path) -> Result<(), StorageError> {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if meta.is_dir() {
            log::warn!(
                "data-dir pointer at {} is a directory (corrupt); removing it to recover",
                path.display()
            );
            std::fs::remove_dir_all(path)
                .map_err(|e| StorageError::io(path.display().to_string(), e))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_pointer(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "swh-pointer-test-{}-{}-{name}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn round_trip() {
        let path = temp_pointer("roundtrip");
        // Use a platform-native absolute path (Windows rejects `/tmp/...`).
        let root = std::env::temp_dir().join("SwitchHosts.data");
        save_to(&path, &root).unwrap();
        assert_eq!(load_from(&path), PointerState::Recorded(root));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn preserves_trailing_space_in_path() {
        // A directory name can legitimately contain a trailing space; the
        // saved path must round-trip exactly, not be trimmed.
        let path = temp_pointer("spaces");
        let root = std::env::temp_dir().join("SwitchHosts data ");
        save_to(&path, &root).unwrap();
        assert_eq!(load_from(&path), PointerState::Recorded(root));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_rejects_relative_path() {
        // Symmetric with load: a non-absolute root is refused and nothing
        // is written.
        let path = temp_pointer("save-relative");
        assert!(save_to(&path, &PathBuf::from("relative/SwitchHosts.data")).is_err());
        assert!(!path.exists());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn missing_is_absent() {
        // An absent pointer is the normal default-location case — NOT a
        // recovery trigger.
        let path = temp_pointer("missing");
        assert_eq!(load_from(&path), PointerState::Absent);
    }

    #[test]
    fn corrupt_is_invalid() {
        // A pointer that exists but can't be parsed must surface as Invalid
        // (recovery), never collapse to Absent (silent default).
        let path = temp_pointer("corrupt");
        std::fs::write(&path, b"{ this is not valid json ").unwrap();
        assert_eq!(load_from(&path), PointerState::Invalid);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn empty_data_dir_is_invalid() {
        let path = temp_pointer("empty");
        std::fs::write(&path, br#"{"data_dir":"   "}"#).unwrap();
        assert_eq!(load_from(&path), PointerState::Invalid);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn relative_data_dir_is_invalid() {
        // A tampered/corrupt pointer holding a relative path must not be
        // resolved against the current working directory — and must trigger
        // recovery rather than silently use the default.
        let path = temp_pointer("relative");
        std::fs::write(&path, br#"{"data_dir":"relative/SwitchHosts.data"}"#).unwrap();
        assert_eq!(load_from(&path), PointerState::Invalid);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn loads_pointer_without_envelope_fields() {
        // Forward/backward-compatible: only data_dir is required. Build the
        // JSON from a platform-native absolute path (Windows rejects `/tmp`).
        let path = temp_pointer("minimal");
        let root = std::env::temp_dir().join("SwitchHosts.data");
        let json = serde_json::json!({ "data_dir": root.display().to_string() }).to_string();
        std::fs::write(&path, json).unwrap();
        assert_eq!(load_from(&path), PointerState::Recorded(root));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn clear_is_idempotent() {
        let path = temp_pointer("clear");
        save_to(&path, &std::env::temp_dir().join("SwitchHosts.data")).unwrap();
        assert!(path.exists());
        clear_at(&path).unwrap();
        assert!(!path.exists());
        // Clearing a missing pointer is still Ok.
        clear_at(&path).unwrap();
    }

    #[test]
    fn directory_at_pointer_path_is_invalid() {
        // A *directory* where the pointer file belongs can't be read, so it
        // must surface as Invalid (recovery) — and clear/save below must be
        // able to get the user out of that state.
        let path = temp_pointer("dir-load");
        std::fs::create_dir_all(&path).unwrap();
        assert_eq!(load_from(&path), PointerState::Invalid);
        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn clear_removes_corrupt_directory() {
        // "Use Default" calls clear; a directory at the pointer path (even a
        // non-empty one) must be removed, not error out, or recovery is stuck.
        let path = temp_pointer("dir-clear");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("junk"), b"x").unwrap();
        clear_at(&path).unwrap();
        assert!(!path.exists(), "corrupt pointer directory must be removed");
    }

    #[test]
    fn save_replaces_corrupt_directory() {
        // "Choose New" / "Change data directory" calls save; it must replace a
        // directory sitting at the pointer path rather than fail on the rename.
        let path = temp_pointer("dir-save");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("junk"), b"x").unwrap();
        let root = std::env::temp_dir().join("SwitchHosts.data");
        save_to(&path, &root).unwrap();
        assert_eq!(load_from(&path), PointerState::Recorded(root));
        let _ = std::fs::remove_file(&path);
    }

    #[cfg(unix)]
    #[test]
    fn dangling_symlink_at_pointer_path_is_invalid() {
        use std::os::unix::fs::symlink;
        // A dangling symlink (points at a missing target) is a present-but-
        // broken pointer: it must surface as Invalid (recovery), not Absent
        // (silent default), even though exists() would follow the link and
        // report it missing.
        let path = temp_pointer("dangling-load");
        symlink("/nonexistent/switchhosts-target", &path).unwrap();
        assert_eq!(load_from(&path), PointerState::Invalid);
        let _ = std::fs::remove_file(&path);
    }

    #[cfg(unix)]
    #[test]
    fn clear_removes_dangling_symlink() {
        use std::os::unix::fs::symlink;
        // "Use Default" must clear a dangling-symlink pointer; pointer_exists
        // (symlink_metadata-based) sees the entry, so reset doesn't no-op, and
        // remove_file deletes the link itself.
        let path = temp_pointer("dangling-clear");
        symlink("/nonexistent/switchhosts-target", &path).unwrap();
        assert!(
            std::fs::symlink_metadata(&path).is_ok(),
            "the symlink entry is present even though exists() is false"
        );
        clear_at(&path).unwrap();
        assert!(
            std::fs::symlink_metadata(&path).is_err(),
            "dangling symlink must be removed"
        );
    }

    #[cfg(unix)]
    #[test]
    fn save_replaces_dangling_symlink() {
        use std::os::unix::fs::symlink;
        // "Choose New" / "Change data directory" must replace a dangling
        // symlink at the pointer path rather than fail on the rename.
        let path = temp_pointer("dangling-save");
        symlink("/nonexistent/switchhosts-target", &path).unwrap();
        let root = std::env::temp_dir().join("SwitchHosts.data");
        save_to(&path, &root).unwrap();
        assert_eq!(load_from(&path), PointerState::Recorded(root));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn entry_present_distinguishes_missing_from_file() {
        // Mirrors load_from's NotFound→Absent vs present→(read) split, which
        // pointer_exists relies on so "reset" doesn't no-op on a real pointer.
        let path = temp_pointer("entry-present");
        assert!(!entry_present(&path), "a missing entry is not present");
        std::fs::write(&path, b"{}").unwrap();
        assert!(entry_present(&path), "a regular file is present");
        let _ = std::fs::remove_file(&path);
    }

    #[cfg(unix)]
    #[test]
    fn entry_present_reports_dangling_symlink_as_present() {
        use std::os::unix::fs::symlink;
        // Must agree with load_from (a dangling symlink → Invalid): report it
        // present so reset can clear it instead of short-circuiting to no-op.
        let path = temp_pointer("entry-present-symlink");
        symlink("/nonexistent/switchhosts-target", &path).unwrap();
        assert!(entry_present(&path));
        let _ = std::fs::remove_file(&path);
    }
}
