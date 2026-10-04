//! Apply history persistence: `internal/histories/system-hosts.json`.
//!
//! On-disk format mirrors what the PotDb migration step
//! ([migration::mod::run] step 4) already writes — a bare JSON array
//! of `IHostsHistoryObject`-shaped records, snake_case fields:
//!
//! ```json
//! [
//!   { "id": "uuid", "content": "...", "add_time_ms": 1700000000000 },
//!   ...
//! ]
//! ```
//!
//! No format/schemaVersion envelope, intentionally — the file is
//! journal data and the renderer expects the bare array
//! shape from `getHistoryList`.
//!
//! Trimmed to `history_limit` config items on every change: oldest
//! entries (front of the list) are dropped first.

use std::path::Path;

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::storage::{
    atomic::atomic_write,
    error::StorageError,
    transaction::{self, Target},
    AppState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyHistoryItem {
    pub id: String,
    pub content: String,
    pub add_time_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

pub fn load(path: &Path) -> Result<Vec<ApplyHistoryItem>, StorageError> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(StorageError::io(path.display().to_string(), e)),
    };
    // Never silently drop malformed records or turn a corrupt file into an
    // empty journal: the next write would destroy the user's originals.
    serde_json::from_slice(&bytes).map_err(|e| StorageError::parse(path.display().to_string(), e))
}

pub fn save(path: &Path, items: &[ApplyHistoryItem]) -> Result<(), StorageError> {
    let bytes = serde_json::to_vec_pretty(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &bytes)
}

/// Keep insertion order; zero remains the legacy "unlimited" setting.
pub fn trim<T>(items: &mut Vec<T>, limit: u32) -> usize {
    let count = if limit == 0 {
        0
    } else {
        items.len().saturating_sub(limit as usize)
    };
    items.drain(..count);
    count
}

pub fn enforce_limit(path: &Path, limit: u32) -> Result<(), StorageError> {
    let mut items = load(path)?;
    if trim(&mut items, limit) > 0 {
        save(path, &items)?;
    }
    Ok(())
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// One locked read/modify/write for both snapshots. Read current settings
/// after the privileged write, so disabling history takes effect immediately.
pub fn record_change(state: &AppState, previous: &str, next: &str) -> Result<(), StorageError> {
    state.require_data_dir_usable()?;
    let _guard = state.lock_store()?;
    let cfg = state.config.lock().expect("config mutex poisoned").clone();
    if !cfg.history_enabled || previous == next {
        return Ok(());
    }
    let path = state.paths.histories_dir.join("system-hosts.json");
    let mut items = load(&path)?;
    let now = chrono::Utc::now().timestamp_millis();
    for content in [previous, next] {
        if items.last().map(|item| item.content.as_str()) == Some(content) {
            continue;
        }
        items.push(ApplyHistoryItem {
            id: format!(
                "apply_{}_{}_{}",
                now,
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ),
            content: content.into(),
            add_time_ms: now,
            label: None,
        });
    }
    trim(&mut items, cfg.history_limit);
    save(&path, &items)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitConfirmation {
    pub previous_limit: u32,
    pub delete_count: usize,
}

#[derive(Debug, Serialize)]
pub struct LimitResult {
    pub confirmation_required: bool,
    pub previous_limit: u32,
    pub limit: u32,
    pub delete_count: usize,
    pub retained_count: usize,
}

/// First call previews destructive changes without saving anything. Confirmed
/// calls recheck the count and old setting under the same locks as writers.
/// A changed preview must be confirmed again. Non-destructive changes save now.
pub fn update_limit(
    state: &AppState,
    limit: u32,
    confirmation: Option<LimitConfirmation>,
) -> Result<LimitResult, StorageError> {
    state.require_data_dir_usable()?;
    let _config_guard = state
        .config_write_lock
        .lock()
        .expect("config write lock poisoned");
    let _guard = state.lock_store()?;
    let mut next = state.config.lock().expect("config mutex poisoned").clone();
    let path = state.paths.histories_dir.join("system-hosts.json");
    let mut items = load(&path)?;
    let delete_count = trim(&mut items, limit);
    let confirmed = confirmation
        .is_some_and(|c| c.previous_limit == next.history_limit && c.delete_count == delete_count);
    let result = LimitResult {
        confirmation_required: delete_count > 0 && !confirmed,
        previous_limit: next.history_limit,
        limit,
        delete_count,
        retained_count: items.len(),
    };
    if result.confirmation_required {
        return Ok(result);
    }
    next.history_limit = limit;
    let mut targets = vec![Target::Config];
    if delete_count > 0 {
        targets.push(Target::ApplyHistory);
    }
    transaction::run(&state.paths, targets, || {
        next.save(&state.paths.config_file)?;
        if delete_count > 0 {
            save(&path, &items)?;
        }
        Ok(())
    })?;
    *state.config.lock().expect("config mutex poisoned") = next;
    Ok(result)
}

/// Remove the entry with `id`. Returns true if a row was removed.
pub fn delete_by_id(path: &Path, id: &str) -> Result<bool, StorageError> {
    let mut items = load(path)?;
    let before = items.len();
    items.retain(|i| i.id != id);
    if items.len() == before {
        return Ok(false);
    }
    save(path, &items)?;
    Ok(true)
}

#[cfg(test)]
mod tests;
