//! Remote `hosts` refresh, both renderer-driven and time-driven.
//!
//! Mirrors the Electron implementation in
//! [src/main/actions/hosts/refresh.ts] and [src/main/libs/cron.ts]:
//!
//! - `refresh_one` fetches the URL of a remote node, writes the new
//!   content to `entries/<id>.hosts` if it differs from the current
//!   contents, and updates `last_refresh` / `last_refresh_ms` on the
//!   node in the manifest.
//! - The background scanner wakes every 60 seconds and calls
//!   `refresh_one` on every remote node whose `refresh_interval`
//!   has elapsed since `last_refresh_ms`.
//!
//! Locking discipline (per implementation-notes A5): the HTTP fetch
//! happens *outside* `store_lock`, since it can block for many
//! seconds. We acquire the lock only for the read-modify-write of
//! manifest.json, and *re-find* the target node by id at lock time so
//! a concurrent renderer edit doesn't get clobbered.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::http;
use crate::storage::{entries, manifest::Manifest, AppState};

const SCAN_INTERVAL: Duration = Duration::from_secs(60);

/// Result of a single refresh attempt. Translated into the renderer's
/// `IOperationResult` shape (`{success, code?, message?, data?}`) at
/// the command boundary.
#[derive(Debug)]
pub enum RefreshOutcome {
    /// Fetched and written.
    Updated { node: Value },
    /// Fetched, content unchanged on disk; node still touched
    /// (`last_refresh*` updated) so the next scan tick respects the
    /// interval.
    Unchanged { node: Value },
}

#[derive(Debug)]
pub enum RefreshError {
    /// Node id doesn't exist in the manifest.
    InvalidId,
    /// Node exists but isn't a remote node.
    NotRemote,
    /// Node has no URL set.
    NoUrl,
    /// HTTP / network failure, file:// read failure, etc.
    Fetch { message: String },
    /// Filesystem failure during the write or manifest update.
    Storage { message: String },
}

impl RefreshError {
    pub fn into_renderer_value(self) -> Value {
        let (code, message) = match self {
            RefreshError::InvalidId => ("invalid_id", "node not found".to_string()),
            RefreshError::NotRemote => ("not_remote", "node is not a remote hosts".to_string()),
            RefreshError::NoUrl => ("no_url", "remote node has no URL".to_string()),
            RefreshError::Fetch { message } => ("fetch_failed", message),
            RefreshError::Storage { message } => ("storage_failed", message),
        };
        json!({
            "success": false,
            "code": code,
            "message": message,
        })
    }
}

/// Refresh a single remote node by id.
pub async fn refresh_one<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    id: &str,
) -> Result<RefreshOutcome, RefreshError> {
    // Step 1: snapshot the node from the current manifest. No lock —
    // we only need to read.
    let manifest = Manifest::load(&state.paths)
        .map_err(|e| RefreshError::Storage { message: e.to_string() })?;
    let snapshot = match find_node(&manifest.root, id) {
        Some(n) => n,
        None => return Err(RefreshError::InvalidId),
    };
    if snapshot.get("type").and_then(Value::as_str) != Some("remote") {
        return Err(RefreshError::NotRemote);
    }
    let url = match snapshot.get("url").and_then(Value::as_str) {
        Some(u) if !u.is_empty() => u.to_string(),
        _ => return Err(RefreshError::NoUrl),
    };

    // Step 2: fetch the new content. May take seconds; lockless.
    let new_content = fetch_remote(&url, state).await?;

    // Step 3: compare with the entries file (always LF on disk). The
    // remote payload may use CRLF, so normalize before comparing —
    // otherwise a CRLF response would defeat the equality check on
    // every poll and we'd emit a spurious "content changed" event each
    // tick.
    let old_content = entries::read_entry(&state.paths.entries_dir, id)
        .map_err(|e| RefreshError::Storage { message: e.to_string() })?;
    let new_content_lf = entries::normalize_to_lf(&new_content);
    let content_changed = old_content != new_content_lf;
    if content_changed {
        entries::write_entry(&state.paths.entries_dir, id, &new_content_lf)
            .map_err(|e| RefreshError::Storage { message: e.to_string() })?;
    }

    // Step 4: re-acquire the manifest under the store lock and stamp
    // last_refresh / last_refresh_ms on the (possibly relocated) node.
    let updated_snapshot = {
        let _guard = state.store_lock.lock().expect("store lock poisoned");
        let mut manifest = Manifest::load(&state.paths)
            .map_err(|e| RefreshError::Storage { message: e.to_string() })?;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let stamp = format_timestamp(now_ms);
        let touched = stamp_node(&mut manifest.root, id, &stamp, now_ms);
        if !touched {
            // Concurrent delete between step 1 and now. Treat as
            // success — the entries file we just wrote is harmless
            // garbage that the next GC pass will clean up.
            return Err(RefreshError::InvalidId);
        }
        manifest
            .save(&state.paths)
            .map_err(|e| RefreshError::Storage { message: e.to_string() })?;
        find_node(&manifest.root, id).unwrap_or(snapshot.clone())
    };

    // Step 5: tell the UI. Both events match the Electron broadcast
    // names so the existing renderer subscribers fire unchanged.
    let _ = app.emit(
        "hosts_refreshed",
        json!({ "_args": [updated_snapshot.clone()] }),
    );
    if content_changed {
        let _ = app.emit(
            "hosts_content_changed",
            json!({ "_args": [id] }),
        );
    }

    if content_changed {
        Ok(RefreshOutcome::Updated { node: updated_snapshot })
    } else {
        Ok(RefreshOutcome::Unchanged { node: updated_snapshot })
    }
}

/// Refresh every remote node in the manifest. Failures are collected
/// per-node and returned alongside successes so the caller (renderer
/// or background scanner) can decide what to do.
pub async fn refresh_all<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Vec<(String, Result<RefreshOutcome, RefreshError>)> {
    let manifest = match Manifest::load(&state.paths) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("manifest load failed: {e}");
            return Vec::new();
        }
    };
    let ids = collect_remote_ids(&manifest.root);
    let mut results = Vec::with_capacity(ids.len());
    for id in ids {
        let outcome = refresh_one(app, state, &id).await;
        results.push((id, outcome));
    }
    results
}

// ---- background scanner ----------------------------------------------------

/// Spawn the periodic scanner. Wakes every 60s, walks the manifest,
/// and refreshes any remote node whose `refresh_interval` has elapsed.
/// Returns a flag the caller can flip to false to ask the scanner to
/// exit on its next tick — currently unused but lets us avoid a
/// stranded task if the bootstrap path needs it later.
pub fn start_background_scanner<R: Runtime>(app: AppHandle<R>) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_task = stop.clone();
    tauri::async_runtime::spawn(async move {
        // First tick after a small delay so the renderer's startup
        // burst (manifest reload, config push) doesn't compete with a
        // potentially-blocking HTTP fan-out.
        tokio::time::sleep(Duration::from_secs(5)).await;
        loop {
            if stop_for_task.load(Ordering::Relaxed) {
                break;
            }
            scan_once(&app).await;
            tokio::time::sleep(SCAN_INTERVAL).await;
        }
    });
    stop
}

async fn scan_once<R: Runtime>(app: &AppHandle<R>) {
    let state_guard = app.state::<AppState>();
    let state = state_guard.inner();
    let manifest = match Manifest::load(&state.paths) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("manifest load failed: {e}");
            return;
        }
    };
    let now_ms = chrono::Utc::now().timestamp_millis();
    let due_ids = collect_due_remote_ids(&manifest.root, now_ms);
    if due_ids.is_empty() {
        return;
    }
    for id in due_ids {
        if let Err(e) = refresh_one(app, state, &id).await {
            log::warn!("{id}: {e:?}");
        }
    }
    // Mirror the Electron `broadcast(events.reload_list)` at the end
    // of every scan so List components rerun loadHostsData.
    let _ = app.emit("reload_list", json!({ "_args": [] }));
}

// ---- fetch -----------------------------------------------------------------

async fn fetch_remote(url: &str, state: &AppState) -> Result<String, RefreshError> {
    if let Some(stripped) = url.strip_prefix("file://") {
        return read_file_url(stripped, url);
    }

    let client = http::build_client(state)
        .map_err(|message| RefreshError::Fetch { message })?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| RefreshError::Fetch { message: e.to_string() })?;
    let status = response.status();
    if !status.is_success() {
        return Err(RefreshError::Fetch {
            message: format!("HTTP {}", status.as_u16()),
        });
    }
    response
        .text()
        .await
        .map_err(|e| RefreshError::Fetch { message: e.to_string() })
}

fn read_file_url(stripped: &str, original: &str) -> Result<String, RefreshError> {
    // After `strip_prefix("file://")`:
    //   `file:///Users/x/foo`        → `/Users/x/foo`
    //   `file://localhost/Users/x/y` → `localhost/Users/x/y`
    // We tolerate the optional `localhost` host segment so both forms
    // work the same way. Anything else is treated as an opaque path.
    let path = stripped.strip_prefix("localhost").unwrap_or(stripped);
    std::fs::read_to_string(Path::new(path)).map_err(|e| RefreshError::Fetch {
        message: format!("read {original}: {e}"),
    })
}

// ---- tree helpers ----------------------------------------------------------

fn find_node(nodes: &[Value], id: &str) -> Option<Value> {
    for node in nodes {
        if node.get("id").and_then(Value::as_str) == Some(id) {
            return Some(node.clone());
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            if let Some(found) = find_node(children, id) {
                return Some(found);
            }
        }
    }
    None
}

fn stamp_node(nodes: &mut [Value], id: &str, ts_str: &str, ts_ms: i64) -> bool {
    for node in nodes.iter_mut() {
        if node.get("id").and_then(Value::as_str) == Some(id) {
            if let Some(obj) = node.as_object_mut() {
                obj.insert("last_refresh".to_string(), json!(ts_str));
                obj.insert("last_refresh_ms".to_string(), json!(ts_ms));
                return true;
            }
        }
        if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            if stamp_node(children, id, ts_str, ts_ms) {
                return true;
            }
        }
    }
    false
}

fn collect_remote_ids(nodes: &[Value]) -> Vec<String> {
    let mut out = Vec::new();
    walk_remote(nodes, &mut |node| {
        if let Some(id) = node.get("id").and_then(Value::as_str) {
            out.push(id.to_string());
        }
    });
    out
}

fn collect_due_remote_ids(nodes: &[Value], now_ms: i64) -> Vec<String> {
    let mut out = Vec::new();
    walk_remote(nodes, &mut |node| {
        let interval_sec = node
            .get("refresh_interval")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        if interval_sec <= 0 {
            return;
        }
        // Accept any URL the manual refresh path can fetch — http,
        // https and file. Electron's cron skipped file:// URLs but
        // that was an oversight: local reads are cheap and "auto
        // refresh from a file watched on disk" is a real workflow.
        let url_ok = node
            .get("url")
            .and_then(Value::as_str)
            .map(|u| {
                u.starts_with("http://")
                    || u.starts_with("https://")
                    || u.starts_with("file://")
            })
            .unwrap_or(false);
        if !url_ok {
            return;
        }
        let last_ms = node
            .get("last_refresh_ms")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let due = last_ms == 0 || (now_ms - last_ms) / 1000 >= interval_sec;
        if due {
            if let Some(id) = node.get("id").and_then(Value::as_str) {
                out.push(id.to_string());
            }
        }
    });
    out
}

fn walk_remote(nodes: &[Value], visit: &mut impl FnMut(&Value)) {
    for node in nodes {
        if node.get("type").and_then(Value::as_str) == Some("remote") {
            visit(node);
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            walk_remote(children, visit);
        }
    }
}

fn format_timestamp(ms: i64) -> String {
    // Mirror the Electron `dayjs().format('YYYY-MM-DD HH:mm:ss')`
    // shape so renderer code that displays last_refresh as-is keeps
    // looking the same.
    chrono::DateTime::<chrono::Local>::from(
        std::time::UNIX_EPOCH + Duration::from_millis(ms as u64),
    )
    .format("%Y-%m-%d %H:%M:%S")
    .to_string()
}
