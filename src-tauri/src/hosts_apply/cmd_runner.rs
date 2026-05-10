//! Run the user-configured `cmd_after_hosts_apply` script after every
//! successful system hosts write, mirroring the Electron implementation
//! at [src/main/actions/cmd/tryToRun.ts].
//!
//! Differences from Electron:
//!
//! - Hard 30-second timeout. Electron used `child_process.exec` with no
//!   timeout — a long-running command would freeze the apply UI
//!   indefinitely. v5 kills the process at 30s and records a synthetic
//!   timeout result so the user sees what happened.
//! - Runs as the *current user*, never elevated. The privileged write
//!   already happened at this point; the post-apply command is for
//!   user-side hooks (DNS flush, proxy reload, etc.) and must not
//!   inherit root.
//!
//! On-disk journal: `internal/histories/cmd-after-apply.json`. Same
//! bare-array shape as the system-hosts apply history journal — each
//! entry is an `ICommandRunResult` (snake_case fields, matching the
//! TypeScript shape so the renderer's history list works unchanged).
//!
//! The journal is capped at 200 entries (matches Electron's
//! hardcoded limit), oldest first dropped on insert.

use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::process::Command;
use tokio::time::timeout;

use crate::storage::{atomic::atomic_write, error::StorageError};

const TIMEOUT: Duration = Duration::from_secs(30);
const MAX_RECORDS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRunResult {
    /// Opaque per-process id; renderer uses it for `cmd_delete_history_item`.
    /// The Electron `_id` field used PotDb's internal naming, which we
    /// keep as-is so the renderer's existing history component matches
    /// on the same key.
    #[serde(rename = "_id")]
    pub id: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub add_time_ms: i64,
}

/// Run `cmd` with the platform-default shell, returning the captured
/// result. Returns `None` if `cmd` is empty / whitespace-only.
pub async fn run(cmd: &str) -> Option<CommandRunResult> {
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return None;
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let id = make_id(now_ms);

    let child = match spawn_shell(trimmed) {
        Ok(c) => c,
        Err(e) => {
            return Some(CommandRunResult {
                id,
                success: false,
                stdout: String::new(),
                stderr: format!("failed to spawn shell: {e}"),
                add_time_ms: now_ms,
            });
        }
    };

    let wait = child.wait_with_output();
    match timeout(TIMEOUT, wait).await {
        Ok(Ok(output)) => Some(CommandRunResult {
            id,
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            add_time_ms: now_ms,
        }),
        Ok(Err(e)) => Some(CommandRunResult {
            id,
            success: false,
            stdout: String::new(),
            stderr: format!("wait failed: {e}"),
            add_time_ms: now_ms,
        }),
        Err(_elapsed) => {
            // Timed out — `wait_with_output` already moved the child,
            // so we can't kill it from here directly. `spawn_shell`
            // sets `kill_on_drop(true)`, which makes Tokio send
            // SIGKILL (POSIX) / TerminateProcess (Windows) when the
            // future is dropped at the end of this match arm. Without
            // that flag the process would orphan and keep running.
            Some(CommandRunResult {
                id,
                success: false,
                stdout: String::new(),
                stderr: format!("command timed out after {}s", TIMEOUT.as_secs()),
                add_time_ms: now_ms,
            })
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn spawn_shell(cmd: &str) -> std::io::Result<tokio::process::Child> {
    Command::new("/bin/sh")
        .arg("-c")
        .arg(cmd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
}

#[cfg(target_os = "windows")]
fn spawn_shell(cmd: &str) -> std::io::Result<tokio::process::Child> {
    Command::new("cmd")
        .arg("/d")
        .arg("/s")
        .arg("/c")
        .arg(cmd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
}

fn make_id(now_ms: i64) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("cmd_{now_ms}_{seq}")
}

// ---- journal: internal/histories/cmd-after-apply.json ---------------------

pub fn load(path: &Path) -> Result<Vec<CommandRunResult>, StorageError> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    match serde_json::from_slice::<Vec<CommandRunResult>>(&bytes) {
        Ok(v) => Ok(v),
        Err(_) => match serde_json::from_slice::<Value>(&bytes) {
            Ok(Value::Array(arr)) => Ok(arr
                .into_iter()
                .filter_map(|v| serde_json::from_value::<CommandRunResult>(v).ok())
                .collect()),
            _ => {
                log::warn!("{} could not be parsed; treating as empty.", path.display());
                Ok(Vec::new())
            }
        },
    }
}

pub fn save(path: &Path, items: &[CommandRunResult]) -> Result<(), StorageError> {
    let bytes = serde_json::to_vec_pretty(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &bytes)
}

pub fn insert(path: &Path, item: CommandRunResult) -> Result<(), StorageError> {
    let mut items = load(path)?;
    items.push(item);
    if items.len() > MAX_RECORDS {
        let drop_count = items.len() - MAX_RECORDS;
        items.drain(0..drop_count);
    }
    save(path, &items)
}

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

pub fn clear(path: &Path) -> Result<(), StorageError> {
    if !path.exists() {
        return Ok(());
    }
    save(path, &[])
}
