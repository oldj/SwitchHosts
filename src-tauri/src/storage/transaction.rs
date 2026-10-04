//! Recoverable multi-file mutations. Callers hold AppState::lock_store for
//! the complete read/modify/write cycle, including recovery.
//!
//! Before changing files, persist an undo journal. Removing that journal is
//! the commit point. Errors roll back; a process interrupted before commit is
//! rolled back at startup (or before the next storage operation). Recovery is
//! idempotent and never removes the journal until every file is restored.
//! This protects against process interruption, not arbitrary disk corruption
//! or multiple independent processes writing the same data directory.

use std::collections::BTreeSet;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::{atomic::atomic_write, entries, StorageError, V5Paths};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Target {
    Manifest,
    Trashcan,
    State,
    Config,
    ApplyHistory,
    Entry(String),
}

impl Target {
    fn path(&self, paths: &V5Paths) -> Result<PathBuf, StorageError> {
        Ok(match self {
            Self::Manifest => paths.manifest_file.clone(),
            Self::Trashcan => paths.trashcan_file.clone(),
            Self::State => paths.state_file.clone(),
            Self::Config => paths.config_file.clone(),
            Self::ApplyHistory => paths.histories_dir.join("system-hosts.json"),
            Self::Entry(id) => entries::entry_path(&paths.entries_dir, id)?,
        })
    }
}

#[derive(Serialize, Deserialize)]
enum Contents {
    Absent,
    Present(Vec<u8>),
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Backup {
    target: Target,
    // An explicit enum makes this field mandatory during deserialization;
    // a missing Option field would silently mean "delete the destination".
    contents: Contents,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    version: u32,
    files: Vec<Backup>,
}

fn journal_path(paths: &V5Paths) -> PathBuf {
    paths.internal.join("storage-transaction.json")
}

fn read_optional(path: &std::path::Path) -> Result<Option<Vec<u8>>, StorageError> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(StorageError::io(path.display().to_string(), error)),
    }
}

fn remove_file(path: &std::path::Path) -> Result<(), StorageError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(StorageError::io(path.display().to_string(), error)),
    }
}

/// Restore an interrupted transaction. Never infer a missing journal from
/// an I/O error: unreadable/corrupt journals must block subsequent writes.
pub fn recover(paths: &V5Paths) -> Result<(), StorageError> {
    let path = journal_path(paths);
    let Some(bytes) = read_optional(&path)? else {
        return Ok(());
    };
    let journal: Journal = serde_json::from_slice(&bytes)
        .map_err(|error| StorageError::parse(path.display().to_string(), error))?;
    if journal.version != 1 || journal.files.is_empty() {
        return Err(StorageError::InvalidConfigValue {
            key: "storage_transaction".into(),
            reason: "unsupported or empty storage transaction journal; original files retained"
                .into(),
        });
    }
    // Resolve and validate the entire journal before touching any files.
    // Typed targets deliberately cannot name arbitrary filesystem paths.
    let mut seen = BTreeSet::new();
    let mut files = Vec::new();
    for backup in journal.files {
        let dest = backup.target.path(paths)?;
        if !seen.insert(dest.clone()) {
            return Err(StorageError::InvalidConfigValue {
                key: "storage_transaction".into(),
                reason: "duplicate target in storage transaction journal".into(),
            });
        }
        let contents = match backup.contents {
            Contents::Absent => None,
            Contents::Present(bytes) => Some(bytes),
        };
        files.push((dest, contents));
    }
    for (dest, contents) in files {
        // In particular, do not rewrite an unchanged, read-only file that
        // caused the original operation to fail. Restore changed files only.
        if read_optional(&dest)? == contents {
            continue;
        }
        match contents {
            Some(bytes) => atomic_write(&dest, &bytes)?,
            None => remove_file(&dest)?,
        }
    }
    remove_file(&path)
}

pub fn run<T>(
    paths: &V5Paths,
    targets: Vec<Target>,
    action: impl FnOnce() -> Result<T, StorageError>,
) -> Result<T, StorageError> {
    recover(paths)?;
    let mut seen = BTreeSet::new();
    let mut files = Vec::new();
    for target in targets {
        let path = target.path(paths)?;
        if seen.insert(path.clone()) {
            files.push(Backup {
                target,
                contents: match read_optional(&path)? {
                    Some(bytes) => Contents::Present(bytes),
                    None => Contents::Absent,
                },
            });
        }
    }
    if files.is_empty() {
        return action();
    }
    let path = journal_path(paths);
    let journal = serde_json::to_vec(&Journal { version: 1, files })
        .map_err(|error| StorageError::serialize(path.display().to_string(), error))?;
    atomic_write(&path, &journal)?;
    // Ensure the complete undo record is flushed before modifying data.
    std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .and_then(|file| file.sync_all())
        .map_err(|error| StorageError::io(path.display().to_string(), error))?;

    let result = action().and_then(|value| {
        remove_file(&path)?;
        Ok(value)
    });
    match result {
        Ok(value) => Ok(value),
        Err(error) => match recover(paths) {
            Ok(()) => Err(error),
            Err(recovery) => Err(StorageError::Io {
                path: path.display().to_string(),
                reason: format!("{error}; rollback incomplete: {recovery}. Undo journal retained; restore filesystem access and retry."),
            }),
        },
    }
}

#[cfg(test)]
mod tests;
