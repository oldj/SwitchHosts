//! First-startup PotDb → v5 migration.
//!
//! Runs exactly once per install, orchestrated from
//! [`crate::storage::AppState::bootstrap`]. The high-level contract is:
//!
//! 1. If `~/.SwitchHosts/manifest.json` already exists, we assume v5 is
//!    already live and do nothing.
//! 2. Otherwise, look for legacy PotDb data at `~/.SwitchHosts/{data,
//!    config}`. If none is found, this is a fresh v5 install.
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
    if paths.manifest_file.exists() {
        log::info!(
            "manifest.json already exists at {} — skipping PotDb migration",
            paths.manifest_file.display()
        );
        return Ok(MigrationOutcome::AlreadyMigrated);
    }

    let layout = potdb::PotDbLayout::at(paths.root.clone());
    if !layout.has_legacy_data() {
        log::info!(
            "no legacy PotDb data found under {} — fresh v5 install",
            paths.root.display()
        );
        return Ok(MigrationOutcome::FreshInstall);
    }

    log::info!(
        "legacy PotDb detected at {} — migrating to v5 format",
        paths.root.display()
    );

    let snapshot = potdb::read_potdb(&layout)?;

    // ---- 1. entries/<id>.hosts ----
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

    // ---- 2. trashcan.json ----
    let trashcan = Trashcan {
        items: snapshot.trashcan.clone(),
        ..Default::default()
    };
    trashcan.save(&paths.trashcan_file)?;

    // ---- 3. internal/config.json ----
    // Legacy cfg.json has `env: "PROD"` which isn't in our AppConfig —
    // serde drops unknown keys by default, so that's fine. Fields we
    // care about either survive the round-trip or fall back to their
    // default via `#[serde(default)]` on AppConfig.
    let config = match serde_json::from_value::<AppConfig>(snapshot.config.clone()) {
        Ok(c) => c,
        Err(e) => {
            log::warn!(
                "legacy config had unexpected shape ({e}); falling back to defaults for any missing keys."
            );
            AppConfig::default()
        }
    };
    config.save(&paths.config_file)?;

    // ---- 4. internal/histories/system-hosts.json ----
    let history_items = snapshot.history.len();
    if history_items > 0 {
        let history_file = paths.histories_dir.join("system-hosts.json");
        let payload = serde_json::to_vec_pretty(&snapshot.history)
            .map_err(|e| StorageError::serialize(history_file.display().to_string(), e))?;
        atomic_write(&history_file, &payload)?;
    }

    // ---- 5. manifest.json (commit marker) ----
    let manifest = Manifest {
        root: coerce_root(&snapshot.tree),
        ..Default::default()
    };
    manifest.save(paths)?;

    // ---- 6. archive legacy directories ----
    let mut plan = archiver::new_plan(&paths.root);
    archiver::add_if_exists(&mut plan, layout.swhdb.clone(), "data");
    archiver::add_if_exists(&mut plan, layout.cfgdb.clone(), "config");
    let archive_dir_name = archiver::execute(&plan)?;

    log::info!(
        "done. wrote {entries_written} entries file(s), archived legacy to v4/{archive_dir_name}/"
    );

    Ok(MigrationOutcome::Applied {
        entries_written,
        history_items,
        archive_dir_name,
    })
}

/// Shallow sanity pass: strip values that aren't JSON objects (defensive
/// — tree.json is normally well-formed but a hand-edited legacy file
/// could smuggle in e.g. a stray `null`). Everything else is passed
/// through verbatim, matching Phase 1B step 2's decision to store the
/// renderer-facing shape directly in manifest.json.
fn coerce_root(raw: &[Value]) -> Vec<Value> {
    raw.iter().filter(|v| v.is_object()).cloned().collect()
}
