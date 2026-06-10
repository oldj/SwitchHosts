//! v5 filesystem-backed storage layer.
//!
//! This module owns every read/write against `~/.SwitchHosts`. Tauri
//! commands in `commands.rs` access it through the `AppState` held by
//! the Tauri builder, never by reaching into the filesystem themselves.

pub mod atomic;
pub mod config;
pub mod data_dir_pointer;
pub mod entries;
pub mod error;
pub mod fs_copy;
pub mod manifest;
pub mod paths;
pub mod state;
pub mod trashcan;
pub mod tree_format;

pub use config::AppConfig;
pub use error::StorageError;
pub use paths::V5Paths;
pub use trashcan::Trashcan;

use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::Mutex;

/// Process-wide shared state held by Tauri as `State<'_, AppState>`.
///
/// `store_lock` serializes every read-modify-write cycle that touches
/// `manifest.json` or `trashcan.json`. Commands that only read may
/// skip it. Commands that mutate must hold the guard until after the
/// atomic rename lands on both files.
///
/// `is_will_quit` distinguishes "user clicked the close button"
/// (CloseRequested handler hides the window instead of letting it
/// close) from "user explicitly chose Quit" (`quit_app` command sets
/// the flag, then `app.exit(0)`).
pub struct AppState {
    pub paths: V5Paths,
    pub config: Mutex<AppConfig>,
    pub store_lock: Mutex<()>,
    /// Serializes the entire `config_set` / `config_update` commit
    /// pipeline. Tauri runs `#[tauri::command] async fn`s concurrently
    /// on tokio, so without this guard two concurrent commits can each
    /// snapshot the same `cfg`, apply disjoint patches, then race on
    /// `save()` — losing one of the writes. Held only by `commit_config_patch`;
    /// callers that just *read* config still go through `config` directly.
    pub config_write_lock: Mutex<()>,
    /// Serializes update checks so the background scheduler and manual
    /// "Check for Updates" action do not run two updater requests at once.
    pub update_check_lock: tokio::sync::Mutex<()>,
    pub is_will_quit: AtomicBool,
    /// Epoch milliseconds of the last window-geometry persist. Used by
    /// the Moved/Resized handlers in `lifecycle` to coalesce writes
    /// during a drag (which fires 60 events/sec on macOS).
    pub last_geometry_persist_ms: AtomicU64,
    /// Set at startup when a recorded custom data directory could not be
    /// used — it has gone missing (moved/deleted, or can't host the layout),
    /// or its pointer file is unreadable/corrupt. The renderer reads this via
    /// `get_data_dir_status` and prompts the user to choose how to proceed.
    /// `None` in the normal case. While `Some`, data-mutating commands are
    /// refused (see `require_data_dir_usable`) and migration is skipped.
    pub data_dir_recovery: Option<paths::DataDirRecovery>,
}

impl AppState {
    /// Initialise the shared state at app startup:
    ///
    /// 1. Resolve the active v5 root, honouring the data-dir pointer
    ///    (custom location), falling back to `~/.SwitchHosts` if the
    ///    pointer is absent, corrupt, or points at a missing directory.
    /// 2. Ensure all v5 directories exist.
    /// 3. Run the one-shot PotDb → v5 migration if `manifest.json` is
    ///    missing and legacy data is present — **but only** when we are
    ///    on the intended root. If the recorded custom directory is
    ///    unavailable (it went missing, or its pointer is corrupt) and we
    ///    were forced back to the default, skip migration so stale v4 data
    ///    in the default location is not migrated/archived behind the
    ///    user's back (they will be prompted to choose a directory).
    /// 4. Load `internal/config.json` into memory, or fall back to
    ///    defaults if the file is missing / corrupt.
    pub fn bootstrap() -> Result<Self, StorageError> {
        let (mut paths, mut data_dir_recovery) = paths::resolve_root()?;

        // If the resolved root can't host the v5 layout — a file blocking a
        // required directory (e.g. a plain file named `entries`), a read-only
        // volume, or a read-only sub-dir — handle it without crashing here
        // (bootstrap is `.expect()`ed at the app entry). `ensure_usable`
        // probes each v5 dir for writability, not just existence.
        if let Err(e) = paths.ensure_usable() {
            let default = paths::default_root()?;
            if paths.root == default {
                // The active root IS the default. Only a *normal* startup (no
                // recovery) is truly unrecoverable here. If we are ALREADY in
                // recovery (pointer invalid / custom dir gone), the default is
                // just a fallback to host the recovery dialog — an unusable
                // default must NOT abort startup, or the user can never reach
                // "Choose New Folder". The dialog and an in-memory default
                // config don't require a writable default, so prepare it
                // best-effort and carry on.
                if data_dir_recovery.is_none() {
                    return Err(e);
                }
                log::warn!(
                    "default fallback root is also unusable ({e}); starting in recovery so the user can choose a new location"
                );
                let _ = paths.ensure_dirs();
            } else {
                // A recorded custom dir can't host the layout: fall back to the
                // default and enter recovery so the dialog handles it.
                log::warn!(
                    "custom data directory {} cannot host the data layout ({e}); falling back to default",
                    paths.root.display()
                );
                data_dir_recovery = Some(paths::DataDirRecovery::Missing(paths.root.clone()));
                paths = V5Paths::under(default);
                // Best-effort: even if the default is also unusable, start in
                // recovery so the user can pick a new location (never abort).
                if let Err(e2) = paths.ensure_dirs() {
                    log::warn!(
                        "default fallback root is also unusable ({e2}); starting in recovery anyway"
                    );
                }
            }
        }
        paths.cleanup_tmp_files();

        if let Some(recovery) = &data_dir_recovery {
            log::warn!(
                "custom data directory unavailable ({recovery:?}) — using default root and skipping migration; the user will be prompted"
            );
        } else {
            let outcome = crate::migration::run_if_needed(&paths)?;
            log::info!("migration outcome: {outcome:?}");
        }

        let config = AppConfig::load(&paths.config_file);
        Ok(Self {
            paths,
            config: Mutex::new(config),
            store_lock: Mutex::new(()),
            config_write_lock: Mutex::new(()),
            update_check_lock: tokio::sync::Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
            data_dir_recovery,
        })
    }

    /// Persist the in-memory config to disk. Called after every
    /// successful `config_set` / `config_update`.
    pub fn persist_config(&self) -> Result<(), StorageError> {
        let guard = self.config.lock().expect("config mutex poisoned");
        guard.save(&self.paths.config_file)
    }

    /// Backstop guard for data-mutating commands. When the recorded data
    /// directory is unavailable (it went missing, or its pointer is corrupt)
    /// we've fallen back to the default root only to host the recovery
    /// dialog; commands that write or apply the user's
    /// data/config/system must refuse until the location is resolved (use
    /// default / choose new / quit). The UI, app menu and tray already gate
    /// their entry points — this is the unified backstop so a future window,
    /// shortcut or invoke path can't slip a data mutation through. Recovery
    /// commands (`pick`/`apply`/`reset_data_dir`) must NOT call this.
    pub fn require_data_dir_usable(&self) -> Result<(), StorageError> {
        if self.data_dir_recovery.is_some() {
            return Err(StorageError::InvalidDataDirChoice {
                reason: "the data directory is unavailable; choose a location to continue".into(),
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn state(recovery: Option<paths::DataDirRecovery>) -> AppState {
        let root = std::env::temp_dir().join(format!(
            "swh-guard-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        AppState {
            paths: V5Paths::under(root),
            config: Mutex::new(AppConfig::default()),
            store_lock: Mutex::new(()),
            config_write_lock: Mutex::new(()),
            update_check_lock: tokio::sync::Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
            data_dir_recovery: recovery,
        }
    }

    #[test]
    fn require_data_dir_usable_rejects_during_recovery() {
        // Both recovery kinds (missing dir and invalid pointer) must block
        // data-mutating commands; the normal (None) case allows them.
        assert!(
            state(Some(paths::DataDirRecovery::Missing(PathBuf::from("/tmp/gone"))))
                .require_data_dir_usable()
                .is_err()
        );
        assert!(state(Some(paths::DataDirRecovery::Invalid))
            .require_data_dir_usable()
            .is_err());
        assert!(state(None).require_data_dir_usable().is_ok());
    }
}
