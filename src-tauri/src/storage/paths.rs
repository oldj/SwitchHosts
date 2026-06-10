//! v5 filesystem layout.
//!
//! v5 root is fixed at `~/.SwitchHosts`. Everything v5 reads or writes
//! lives under it. Phase 1B step 1 only creates `internal/` — the main
//! storage layout (manifest.json, entries/, trashcan.json) lands in
//! subsequent steps.

use std::path::{Path, PathBuf};

use super::data_dir_pointer::PointerState;
use super::error::StorageError;

/// Fixed sub-directory name created inside a user-chosen folder. Picking
/// "Desktop" stores data in "Desktop/SwitchHosts.data"; picking a folder
/// already named "SwitchHosts.data" uses it directly.
pub const DATA_DIR_NAME: &str = "SwitchHosts.data";

/// Absolute paths for the v5 data layout. Safe to clone — this is just
/// a bundle of `PathBuf`s, no filesystem handles.
#[derive(Debug, Clone)]
pub struct V5Paths {
    pub root: PathBuf,
    pub manifest_file: PathBuf,
    pub trashcan_file: PathBuf,
    pub entries_dir: PathBuf,
    pub internal: PathBuf,
    pub config_file: PathBuf,
    /// Placeholder for a later sub-step (`internal/state.json`).
    #[allow(dead_code)]
    pub state_file: PathBuf,
    pub histories_dir: PathBuf,
}

impl V5Paths {
    /// Build a `V5Paths` rooted at `root`. Used by tests to point the layout
    /// at a temporary directory.
    pub fn under(root: PathBuf) -> Self {
        let manifest_file = root.join("manifest.json");
        let trashcan_file = root.join("trashcan.json");
        let entries_dir = root.join("entries");
        let internal = root.join("internal");
        let config_file = internal.join("config.json");
        let state_file = internal.join("state.json");
        let histories_dir = internal.join("histories");
        Self {
            root,
            manifest_file,
            trashcan_file,
            entries_dir,
            internal,
            config_file,
            state_file,
            histories_dir,
        }
    }

    /// Ensure every directory v5 owns exists. Does not touch files.
    pub fn ensure_dirs(&self) -> Result<(), StorageError> {
        create_dir_all(&self.root)?;
        create_dir_all(&self.entries_dir)?;
        create_dir_all(&self.internal)?;
        create_dir_all(&self.histories_dir)?;
        Ok(())
    }

    /// Like `ensure_dirs`, but also verifies every v5 directory is actually
    /// writable (root, entries, internal, histories). `ensure_dirs` is a
    /// no-op on already-existing dirs, so it can't tell a read-only sub-dir
    /// from a usable one; this probes each with a temp file. Use before
    /// committing to a data root (apply pre-check and startup), so an
    /// unwritable target can't be saved and later crash data writes.
    pub fn ensure_usable(&self) -> Result<(), StorageError> {
        self.ensure_dirs()?;
        for dir in [
            &self.root,
            &self.entries_dir,
            &self.internal,
            &self.histories_dir,
        ] {
            if !super::fs_copy::is_writable_dir(dir) {
                return Err(StorageError::io(
                    dir.display().to_string(),
                    std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "directory is not writable",
                    ),
                ));
            }
        }
        Ok(())
    }

    /// Remove leftover `.tmp` files from `atomic_write` that survived
    /// a crash or force-kill. Each v5 directory is scanned for files
    /// ending in `.tmp`; matches are deleted silently. This is safe
    /// because `atomic_write` writes to `<target>.tmp` then renames
    /// to `<target>` — a leftover `.tmp` is always a partial write
    /// that never became the real file.
    pub fn cleanup_tmp_files(&self) {
        let dirs = [
            &self.root,
            &self.entries_dir,
            &self.internal,
            &self.histories_dir,
        ];
        for dir in dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "tmp").unwrap_or(false) && path.is_file() {
                        log::info!("removing leftover tmp file: {}", path.display());
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }
}

fn create_dir_all(path: &Path) -> Result<(), StorageError> {
    std::fs::create_dir_all(path).map_err(|e| StorageError::io(path.display().to_string(), e))
}

/// The default data root, `~/.SwitchHosts`. Independent of any custom
/// pointer — used as the startup fallback and as the "reset" destination.
pub fn default_root() -> Result<PathBuf, StorageError> {
    let home = dirs::home_dir().ok_or(StorageError::HomeDirNotFound)?;
    Ok(home.join(".SwitchHosts"))
}

/// Where a user-picked folder resolves to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TargetKind {
    /// Resolves to the default `~/.SwitchHosts` — treat as a reset.
    Default,
    /// A custom data directory (the final `SwitchHosts.data` path).
    Custom(PathBuf),
}

/// Map a user-picked folder to the actual data directory:
/// - the default root → `Default` (reset, never nested under itself);
/// - a folder already named `SwitchHosts.data` → used as-is;
/// - otherwise → `<picked>/SwitchHosts.data`.
pub fn resolve_target_dir(picked: &Path, default_root: &Path) -> TargetKind {
    if super::fs_copy::lexical_canonicalize(picked)
        == super::fs_copy::lexical_canonicalize(default_root)
    {
        return TargetKind::Default;
    }
    if picked.file_name() == Some(std::ffi::OsStr::new(DATA_DIR_NAME)) {
        TargetKind::Custom(picked.to_path_buf())
    } else {
        TargetKind::Custom(picked.join(DATA_DIR_NAME))
    }
}

/// A pointer target is usable only if it currently exists as a directory
/// (i.e. it wasn't moved or deleted). Whether it can actually host the v5
/// layout and is writable is verified separately by `ensure_usable` at
/// startup, which falls back to the default root on failure.
fn usable(root: &Path) -> bool {
    root.exists() && root.is_dir()
}

/// Why the app fell back to the default root at startup and must run the
/// recovery flow (prompt the user, block data writes, skip migration)
/// instead of using the data normally.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataDirRecovery {
    /// A recorded custom directory could not be used: it no longer exists
    /// (moved/deleted) or can't host the layout. Carries the path so the UI
    /// can show it.
    Missing(PathBuf),
    /// The pointer file exists but is unreadable/corrupt/empty/relative, so
    /// the custom location is unknown (no path to show).
    Invalid,
}

/// Pure startup decision: pick the active root from the pointer state and
/// report why a recorded custom directory is unavailable (so the UI can
/// prompt the user). Kept free of globals for testing.
///
/// Note the asymmetry: `Absent` is the normal default-location case and
/// reports no recovery, but `Invalid` (pointer present yet unusable) must
/// NOT be treated like `Absent` — that would silently strand a user who had
/// a custom directory on the default root and migrate stale data there.
pub fn choose_root(
    pointer: PointerState,
    default_root: PathBuf,
) -> (PathBuf, Option<DataDirRecovery>) {
    match pointer {
        PointerState::Recorded(p) if usable(&p) => (p, None),
        PointerState::Recorded(p) => (default_root, Some(DataDirRecovery::Missing(p))),
        PointerState::Invalid => (default_root, Some(DataDirRecovery::Invalid)),
        PointerState::Absent => (default_root, None),
    }
}

/// Resolve the active root at startup, honouring the data-dir pointer.
/// Returns `(paths, recovery)`; `recovery` is `Some` when a recorded custom
/// directory is unavailable — either gone (`Missing`) or its pointer is
/// unreadable/corrupt (`Invalid`) — so the UI prompts the user.
pub fn resolve_root() -> Result<(V5Paths, Option<DataDirRecovery>), StorageError> {
    let (root, recovery) = choose_root(super::data_dir_pointer::load(), default_root()?);
    Ok((V5Paths::under(root), recovery))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_existing_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "swh-paths-test-{}-{}-{name}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn resolve_target_plain_folder_gets_subdir() {
        let default = temp_existing_dir("def");
        let picked = temp_existing_dir("desktop");
        assert_eq!(
            resolve_target_dir(&picked, &default),
            TargetKind::Custom(picked.join(DATA_DIR_NAME))
        );
        let _ = std::fs::remove_dir_all(&default);
        let _ = std::fs::remove_dir_all(&picked);
    }

    #[test]
    fn resolve_target_already_named_used_as_is() {
        let default = temp_existing_dir("def2");
        let parent = temp_existing_dir("parent");
        let picked = parent.join(DATA_DIR_NAME);
        std::fs::create_dir_all(&picked).unwrap();
        assert_eq!(
            resolve_target_dir(&picked, &default),
            TargetKind::Custom(picked.clone())
        );
        let _ = std::fs::remove_dir_all(&default);
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn resolve_target_default_is_reset_never_nested() {
        // Selecting the default folder (or resetting to it) must resolve to
        // a reset — NOT to `<default>/SwitchHosts.data`. The default root
        // keeps its own layout and is never nested under itself.
        let default = temp_existing_dir("def3");
        let result = resolve_target_dir(&default, &default);
        assert_eq!(result, TargetKind::Default);
        assert_ne!(result, TargetKind::Custom(default.join(DATA_DIR_NAME)));
        let _ = std::fs::remove_dir_all(&default);
    }

    #[test]
    fn resolve_target_default_dotfile_name_is_reset() {
        // Mirror the real default name `.SwitchHosts` (a dotfile, unlike the
        // custom `SwitchHosts.data`): picking it still maps to a reset, so no
        // `.SwitchHosts/SwitchHosts.data` is ever produced.
        let base = temp_existing_dir("home");
        let default = base.join(".SwitchHosts");
        std::fs::create_dir_all(&default).unwrap();
        assert_eq!(resolve_target_dir(&default, &default), TargetKind::Default);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn choose_root_uses_usable_pointer() {
        let existing = temp_existing_dir("usable");
        let default = PathBuf::from("/tmp/swh-default-xyz");
        assert_eq!(
            choose_root(PointerState::Recorded(existing.clone()), default),
            (existing.clone(), None)
        );
        let _ = std::fs::remove_dir_all(&existing);
    }

    #[test]
    fn choose_root_falls_back_when_missing() {
        let missing = std::env::temp_dir().join("swh-missing-pointer-abc-999");
        let default = PathBuf::from("/tmp/swh-default-abc");
        assert_eq!(
            choose_root(PointerState::Recorded(missing.clone()), default.clone()),
            (default, Some(DataDirRecovery::Missing(missing)))
        );
    }

    #[test]
    fn choose_root_none_uses_default() {
        let default = PathBuf::from("/tmp/swh-default-none");
        assert_eq!(
            choose_root(PointerState::Absent, default.clone()),
            (default, None)
        );
    }

    #[test]
    fn choose_root_invalid_pointer_enters_recovery() {
        // A pointer that exists but is unreadable/corrupt must fall back to
        // default AND report recovery — never be treated like Absent (which
        // would silently use the default and hide the user's real data).
        let default = PathBuf::from("/tmp/swh-default-invalid");
        assert_eq!(
            choose_root(PointerState::Invalid, default.clone()),
            (default, Some(DataDirRecovery::Invalid))
        );
    }

    #[test]
    fn choose_root_falls_back_when_pointer_is_a_file() {
        // A pointer that resolves to an existing *file* (not a directory)
        // is unusable → fall back to default and report it missing.
        let base = temp_existing_dir("pointer-file");
        let file = base.join("not-a-dir");
        std::fs::write(&file, b"x").unwrap();
        let default = PathBuf::from("/tmp/swh-default-pf");
        assert_eq!(
            choose_root(PointerState::Recorded(file.clone()), default.clone()),
            (default, Some(DataDirRecovery::Missing(file)))
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn ensure_usable_ok_on_fresh_writable_dir() {
        let root = temp_existing_dir("usable-ok");
        V5Paths::under(root.clone()).ensure_usable().unwrap();
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn ensure_usable_fails_when_a_required_dir_is_blocked_by_a_file() {
        // A plain file named `entries` blocks the required entries/ dir, so
        // ensure_usable must fail — apply's pre-check and bootstrap's
        // fallback rely on this to avoid a startup panic / failed writes on
        // such a target.
        let root = temp_existing_dir("layout-conflict");
        std::fs::write(root.join("entries"), b"not a dir").unwrap();
        assert!(V5Paths::under(root.clone()).ensure_usable().is_err());
        let _ = std::fs::remove_dir_all(&root);
    }
}
