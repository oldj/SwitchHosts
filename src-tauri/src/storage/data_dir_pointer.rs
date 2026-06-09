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
//! first place. It also must never panic on read — a corrupt or missing
//! pointer falls back to the default location (see `paths::resolve_root`).

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

/// Read the recorded custom data directory, or `None` if there is no
/// pointer / it is unreadable / it is corrupt. Never panics, never errors:
/// the caller treats `None` as "use the default location".
pub fn load() -> Option<PathBuf> {
    load_from(pointer_path()?.as_path())
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

fn load_from(path: &Path) -> Option<PathBuf> {
    if !path.exists() {
        return None;
    }
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            log::warn!(
                "data-dir pointer at {} unreadable: {e}; using default location",
                path.display()
            );
            return None;
        }
    };
    match serde_json::from_slice::<PointerEnvelope>(&bytes) {
        Ok(env) => {
            // Use trim() only to detect a blank value; build the path from
            // the raw string so legitimate leading/trailing spaces in a
            // directory name are preserved (save stores the exact path).
            if env.data_dir.trim().is_empty() {
                log::warn!(
                    "data-dir pointer at {} has an empty data_dir; using default location",
                    path.display()
                );
                return None;
            }
            let path_buf = PathBuf::from(&env.data_dir);
            // The pointer must hold an absolute path (we always save one).
            // Reject a relative path so a tampered/corrupt file can't make
            // us resolve the data root against the current working dir.
            if !path_buf.is_absolute() {
                log::warn!(
                    "data-dir pointer at {} is not an absolute path ({}); using default location",
                    path.display(),
                    env.data_dir
                );
                return None;
            }
            Some(path_buf)
        }
        Err(e) => {
            log::warn!(
                "data-dir pointer at {} failed to parse: {e}; using default location",
                path.display()
            );
            None
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
    let json = serde_json::to_vec_pretty(&env)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &json)
}

fn clear_at(path: &Path) -> Result<(), StorageError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(StorageError::io(path.display().to_string(), e)),
    }
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
        assert_eq!(load_from(&path), Some(root));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn preserves_trailing_space_in_path() {
        // A directory name can legitimately contain a trailing space; the
        // saved path must round-trip exactly, not be trimmed.
        let path = temp_pointer("spaces");
        let root = std::env::temp_dir().join("SwitchHosts data ");
        save_to(&path, &root).unwrap();
        assert_eq!(load_from(&path), Some(root));
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
    fn missing_is_none() {
        let path = temp_pointer("missing");
        assert_eq!(load_from(&path), None);
    }

    #[test]
    fn corrupt_is_none() {
        let path = temp_pointer("corrupt");
        std::fs::write(&path, b"{ this is not valid json ").unwrap();
        assert_eq!(load_from(&path), None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn empty_data_dir_is_none() {
        let path = temp_pointer("empty");
        std::fs::write(&path, br#"{"data_dir":"   "}"#).unwrap();
        assert_eq!(load_from(&path), None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn relative_data_dir_is_rejected() {
        // A tampered/corrupt pointer holding a relative path must not be
        // resolved against the current working directory.
        let path = temp_pointer("relative");
        std::fs::write(&path, br#"{"data_dir":"relative/SwitchHosts.data"}"#).unwrap();
        assert_eq!(load_from(&path), None);
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
        assert_eq!(load_from(&path), Some(root));
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
}
