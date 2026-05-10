//! Move legacy PotDb directories into `v4/migration-<timestamp>/`.
//!
//! Uses `std::fs::rename` on the happy path (same filesystem) and falls
//! back to recursive copy + remove when rename fails (cross-filesystem,
//! typically `EXDEV`). An `archive-metadata.json` descriptor is written
//! alongside the archived directories so the user can trace where
//! everything came from.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

use crate::storage::{atomic::atomic_write, StorageError};

/// A set of moves scheduled for a single migration.
#[derive(Debug)]
pub struct ArchivePlan {
    pub archive_dir: PathBuf,
    pub entries: Vec<ArchiveEntry>,
}

#[derive(Debug, Clone)]
pub struct ArchiveEntry {
    pub source: PathBuf,
    pub dest: PathBuf,
    pub label: String,
}

pub fn new_plan(root: &Path) -> ArchivePlan {
    let stamp = timestamp_label();
    let archive_dir = root.join("v4").join(format!("migration-{stamp}"));
    ArchivePlan {
        archive_dir,
        entries: Vec::new(),
    }
}

/// Add a directory to the archive plan if it still exists on disk.
/// `label` is the name used inside the archive dir and recorded in the
/// metadata file.
pub fn add_if_exists(plan: &mut ArchivePlan, source: PathBuf, label: &str) {
    if source.exists() {
        let dest = plan.archive_dir.join(label);
        plan.entries.push(ArchiveEntry {
            source,
            dest,
            label: label.to_string(),
        });
    }
}

/// Execute the plan: move everything into the archive dir, then drop
/// an `archive-metadata.json` recording the operation. Returns the
/// archive dir name (e.g. `migration-1775872800`) for the caller to
/// log or return to the renderer.
pub fn execute(plan: &ArchivePlan) -> Result<String, StorageError> {
    std::fs::create_dir_all(&plan.archive_dir)
        .map_err(|e| StorageError::io(plan.archive_dir.display().to_string(), e))?;

    let mut metadata_sources = Vec::with_capacity(plan.entries.len());
    for entry in &plan.entries {
        move_or_copy(&entry.source, &entry.dest)?;
        metadata_sources.push(json!({
            "label": entry.label,
            "source_path": entry.source.display().to_string(),
        }));
    }

    let metadata = json!({
        "format": "switchhosts-archive-metadata",
        "schemaVersion": 1,
        "archived_at_ms": now_ms(),
        "mode": "rename_or_copy",
        "sources": metadata_sources,
    });
    let bytes = serde_json::to_vec_pretty(&metadata)
        .map_err(|e| StorageError::serialize(plan.archive_dir.display().to_string(), e))?;
    atomic_write(&plan.archive_dir.join("archive-metadata.json"), &bytes)?;

    Ok(plan
        .archive_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("migration-unknown")
        .to_string())
}

fn move_or_copy(src: &Path, dst: &Path) -> Result<(), StorageError> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| StorageError::io(parent.display().to_string(), e))?;
    }
    if std::fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    // Cross-filesystem or other rename failure — fall back to recursive
    // copy followed by a best-effort remove of the source. We only
    // delete the source after every file has been copied successfully.
    copy_recursive(src, dst)?;
    remove_recursive(src)?;
    Ok(())
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), StorageError> {
    let metadata =
        std::fs::metadata(src).map_err(|e| StorageError::io(src.display().to_string(), e))?;
    if metadata.is_dir() {
        std::fs::create_dir_all(dst).map_err(|e| StorageError::io(dst.display().to_string(), e))?;
        let read_dir =
            std::fs::read_dir(src).map_err(|e| StorageError::io(src.display().to_string(), e))?;
        for entry in read_dir {
            let entry = entry.map_err(|e| StorageError::io(src.display().to_string(), e))?;
            let name = entry.file_name();
            copy_recursive(&entry.path(), &dst.join(&name))?;
        }
    } else {
        std::fs::copy(src, dst)
            .map_err(|e| StorageError::io(format!("{} -> {}", src.display(), dst.display()), e))?;
    }
    Ok(())
}

fn remove_recursive(path: &Path) -> Result<(), StorageError> {
    let metadata =
        std::fs::metadata(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(path)
            .map_err(|e| StorageError::io(path.display().to_string(), e))?;
    } else {
        std::fs::remove_file(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    }
    Ok(())
}

fn timestamp_label() -> String {
    // Epoch seconds are unambiguous, sort lexically, and require zero
    // dependencies. Good enough for a directory suffix.
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
