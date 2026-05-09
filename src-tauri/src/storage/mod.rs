//! v5 filesystem-backed storage layer.
//!
//! This module owns every read/write against `~/.SwitchHosts`. Tauri
//! commands in `commands.rs` access it through the `AppState` held by
//! the Tauri builder, never by reaching into the filesystem themselves.

pub mod atomic;
pub mod config;
pub mod entries;
pub mod error;
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
    pub is_will_quit: AtomicBool,
    /// Epoch milliseconds of the last window-geometry persist. Used by
    /// the Moved/Resized handlers in `lifecycle` to coalesce writes
    /// during a drag (which fires 60 events/sec on macOS).
    pub last_geometry_persist_ms: AtomicU64,
}

impl AppState {
    /// Initialise the shared state at app startup:
    ///
    /// 1. Resolve the default v5 paths (`~/.SwitchHosts`).
    /// 2. Ensure all v5 directories exist.
    /// 3. Run the one-shot PotDb → v5 migration if `manifest.json` is
    ///    missing and legacy data is present.
    /// 4. Load `internal/config.json` into memory, or fall back to
    ///    defaults if the file is missing / corrupt.
    pub fn bootstrap() -> Result<Self, StorageError> {
        let paths = V5Paths::resolve_default()?;
        paths.ensure_dirs()?;
        paths.cleanup_tmp_files();

        let outcome = crate::migration::run_if_needed(&paths)?;
        log::info!("migration outcome: {outcome:?}");

        let config = AppConfig::load(&paths.config_file);
        Ok(Self {
            paths,
            config: Mutex::new(config),
            store_lock: Mutex::new(()),
            config_write_lock: Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
        })
    }

    /// Persist the in-memory config to disk. Called after every
    /// successful `config_set` / `config_update`.
    pub fn persist_config(&self) -> Result<(), StorageError> {
        let guard = self.config.lock().expect("config mutex poisoned");
        guard.save(&self.paths.config_file)
    }
}
