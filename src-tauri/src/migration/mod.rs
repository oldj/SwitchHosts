//! First-startup PotDb → v5 migration.
//!
//! Runs exactly once per install, orchestrated from
//! [`crate::storage::AppState::bootstrap`]. The high-level contract is:
//!
//! 1. If `~/.SwitchHosts/manifest.json` already exists, we assume v5 is
//!    already live and do nothing.
//! 2. Otherwise, look for legacy PotDb data at `~/.SwitchHosts/{data,
//!    config}`, respecting Electron’s separate data directory setting.
//!    Settings alone do not commit the migration.
//! 3. Otherwise, read the legacy store, write every v5 file in
//!    dependency order, and only then archive the legacy directories
//!    into `~/.SwitchHosts/v4/migration-<timestamp>/`.
//!
//! Write order matters: `manifest.json` is written **before** the
//! archive step, so a crash between "manifest written" and "legacy
//! moved" leaves the user with both v5 and legacy on disk. Next
//! startup will see `manifest.json`, skip migration, and the orphaned
//! legacy directories can be cleaned up manually (or by a future
//! reconciliation pass). We'd rather leave duplicate data than risk a
//! window where neither v5 nor legacy is readable.

pub mod archiver;
pub mod potdb;

use serde_json::Value;
use std::path::Path;

use crate::storage::{
    atomic::atomic_write, config::AppConfig, entries, manifest::Manifest, paths::V5Paths,
    trashcan::Trashcan, StorageError,
};

/// What happened on this startup's migration check. Returned up to
/// `AppState::bootstrap` so it can be logged. The `Applied` fields are
/// only observed via `Debug`, so dead_code is silenced.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum MigrationOutcome {
    /// `manifest.json` already exists. v5 is already live.
    AlreadyMigrated,
    /// No legacy PotDb data on disk. Fresh v5 install.
    FreshInstall,
    /// The v4 data source is unavailable. Leave it eligible for a later startup.
    Deferred,
    /// Migration ran successfully.
    Applied {
        entries_written: usize,
        history_items: usize,
        archive_dir_name: String,
    },
}

/// Run migration if needed. Errors out if anything fails mid-flight —
/// the caller (bootstrap) converts this into a top-level app error.
pub fn run_if_needed(paths: &V5Paths) -> Result<MigrationOutcome, StorageError> {
    // An explicitly selected v5 root has its own store. Only follow Electron's
    // per-user preference when upgrading into the default v5 root.
    let config_dir = if paths.root == crate::storage::paths::default_root()? {
        dirs::config_dir()
    } else {
        None
    };
    migrate(paths, config_dir.as_deref())
}

fn migrate(paths: &V5Paths, config_dir: Option<&Path>) -> Result<MigrationOutcome, StorageError> {
    if paths.manifest_file.exists() {
        log::info!(
            "manifest.json already exists at {} — skipping PotDb migration",
            paths.manifest_file.display()
        );
        return Ok(MigrationOutcome::AlreadyMigrated);
    }

    let mut layout = potdb::PotDbLayout::at(&paths.root);
    if let Some(dir) = config_dir {
        match potdb::electron_data_root(&dir.join("SwitchHosts/swh_local/dict/local.json")) {
            Ok(Some(root)) => layout.swhdb = root.join("data"),
            Ok(None) => {}
            Err(e) => {
                log::warn!("cannot determine the v4 data location: {e}; deferring migration");
                return defer(paths, &layout);
            }
        }
    }

    let external_store = layout.swhdb != paths.root.join("data");
    let snapshot = match potdb::read_potdb(&layout) {
        Err(e) if external_store => {
            log::warn!("cannot read external v4 store: {e}; deferring migration");
            return defer(paths, &layout);
        }
        result => result?,
    };
    let Some(snapshot) = snapshot else {
        let has_preferences = layout.cfgdb.join("dict/cfg.json").is_file();
        if !has_preferences && !external_store && !layout.swhdb.exists() {
            return Ok(MigrationOutcome::FreshInstall);
        }
        log::warn!(
            "v4 store missing or incomplete at {}; leaving migration pending",
            layout.swhdb.display()
        );
        return defer(paths, &layout);
    };

    log::info!("migrating legacy PotDb at {}", layout.swhdb.display());
    let config = migrate_config(paths, &layout)?;

    // ---- entries/<id>.hosts ----
    let mut entries_written = 0usize;
    for (id, content) in &snapshot.hosts_content {
        // The system node owns id "0" but never had a stored content
        // file — its content is read live from /etc/hosts.
        if id == "0" {
            continue;
        }
        entries::write_entry(&paths.entries_dir, id, content)?;
        entries_written += 1;
    }

    // ---- trashcan.json ----
    let trashcan = Trashcan {
        items: snapshot.trashcan.clone(),
        ..Default::default()
    };
    trashcan.save(&paths.trashcan_file)?;

    // ---- internal/histories/system-hosts.json ----
    let mut history = snapshot.history;
    crate::hosts_apply::history::trim(&mut history, config.history_limit);
    let history_file = paths.histories_dir.join("system-hosts.json");
    // A deferred migration may resume after v5 has recorded history of its own.
    let history_items = if history.is_empty()
        || history_file
            .try_exists()
            .map_err(|e| StorageError::io(history_file.display().to_string(), e))?
    {
        0
    } else {
        let payload = serde_json::to_vec_pretty(&history)
            .map_err(|e| StorageError::serialize(history_file.display().to_string(), e))?;
        atomic_write(&history_file, &payload)?;
        history.len()
    };

    // ---- manifest.json (commit marker) ----
    let manifest = Manifest {
        root: coerce_root(&snapshot.tree),
        ..Default::default()
    };
    manifest.save(paths)?;

    // ---- archive legacy directories ----
    let mut plan = archiver::new_plan(&paths.root);
    let mode = if external_store {
        // A v4 data path may traverse symlinks inside config/. Back up just
        // the known preferences file without moving any part of that path.
        archiver::add_if_exists(
            &mut plan,
            layout.cfgdb.join("dict/cfg.json"),
            "config/dict/cfg.json",
        );
        archiver::ArchiveMode::CopyFiles
    } else {
        archiver::add_if_exists(&mut plan, layout.swhdb, "data");
        archiver::add_if_exists(&mut plan, layout.cfgdb, "config");
        archiver::ArchiveMode::Move
    };
    let archive_dir_name = archiver::execute(&plan, mode)?;

    log::info!(
        "done. wrote {entries_written} entries file(s), archived legacy to v4/{archive_dir_name}/"
    );

    Ok(MigrationOutcome::Applied {
        entries_written,
        history_items,
        archive_dir_name,
    })
}

fn defer(paths: &V5Paths, layout: &potdb::PotDbLayout) -> Result<MigrationOutcome, StorageError> {
    if layout.cfgdb.join("dict/cfg.json").is_file() && !paths.config_file.exists() {
        migrate_config(paths, layout)?;
    }
    Ok(MigrationOutcome::Deferred)
}

/// Settings and hosts may arrive on different startups. Once the user has
/// v5 settings, a retry must keep their edits (including the history limit).
fn migrate_config(paths: &V5Paths, layout: &potdb::PotDbLayout) -> Result<AppConfig, StorageError> {
    if paths
        .config_file
        .try_exists()
        .map_err(|e| StorageError::io(paths.config_file.display().to_string(), e))?
    {
        return AppConfig::load_checked(&paths.config_file);
    }
    let config = match layout.read_config()? {
        Some(value) => serde_json::from_value(value).unwrap_or_else(|e| {
            log::warn!("legacy config had unexpected shape ({e}); using defaults");
            AppConfig::default()
        }),
        None => AppConfig::default(),
    };
    config.save(&paths.config_file)?;
    Ok(config)
}

/// Shallow sanity pass: strip values that aren't JSON objects (defensive
/// — tree.json is normally well-formed but a hand-edited legacy file
/// could smuggle in e.g. a stray `null`). Everything else is passed
/// through verbatim, matching Phase 1B step 2's decision to store the
/// renderer-facing shape directly in manifest.json.
fn coerce_root(raw: &[Value]) -> Vec<Value> {
    raw.iter().filter(|v| v.is_object()).cloned().collect()
}

#[cfg(test)]
mod tests;
