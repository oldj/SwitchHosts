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
//! seconds. The lock covers content writes and the manifest stamp, and we
//! re-find the target node before writing so concurrent deletion does not
//! recreate its content. Readers and transaction recovery use the same lock.
//!
//! Two overlapping fetches of the same node can still finish out of order:
//! A fetches V1 slowly, B writes V2, then A overwrites it with V1. The command,
//! scanner and HTTP API can all initiate a refresh concurrently.
//! `refresh_one_inner` therefore serialises on a per-node mutex held
//! across the whole sequence. Per-node rather than global: a single
//! mutex would park an `/api/refresh` call behind an entire
//! `refresh_all` fan-out — N nodes × up to the 30s fetch timeout.
//! Lock order is always refresh-lock → `store_lock`, never the reverse.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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

// ---- per-node serialisation ------------------------------------------------

/// One mutex per node id, created on demand. `Option<HashMap>` rather
/// than a `LazyLock` because `Mutex::new` is const while `HashMap::new`
/// is not, and `LazyLock` would push the crate past the 1.77 MSRV
/// declared in Cargo.toml — same shape as `http_api::SERVER`.
static REFRESH_LOCKS: Mutex<Option<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
    Mutex::new(None);

fn refresh_lock_for(id: &str) -> Arc<tokio::sync::Mutex<()>> {
    let mut guard = REFRESH_LOCKS.lock().expect("refresh locks mutex poisoned");
    lock_for_in(guard.get_or_insert_with(HashMap::new), id)
}

/// Split out from `refresh_lock_for` so the sweep below is testable
/// against a local map — the static is shared by every test in the
/// binary and its size can't be asserted on deterministically.
fn lock_for_in(
    map: &mut HashMap<String, Arc<tokio::sync::Mutex<()>>>,
    id: &str,
) -> Arc<tokio::sync::Mutex<()>> {
    // `strong_count == 1` means the map itself holds the only reference,
    // so no refresh is running or queued on that node and the entry can
    // go. Without this, ids of deleted nodes would pin their mutex for
    // the life of the process.
    map.retain(|_, lock| Arc::strong_count(lock) > 1);
    map.entry(id.to_string()).or_default().clone()
}

/// Refresh a single remote node by id.
pub async fn refresh_one<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    id: &str,
) -> Result<RefreshOutcome, RefreshError> {
    refresh_one_inner(app, state, id, true).await
}

async fn refresh_one_inner<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    id: &str,
    emit_content_changed: bool,
) -> Result<RefreshOutcome, RefreshError> {
    // Step 0: take this node's refresh mutex for the whole function.
    // Everything below is a read-modify-write straddling an await, so a
    // second refresh of the same id must queue rather than interleave —
    // see the rollback scenario in the module docs. Different ids stay
    // fully concurrent.
    let node_lock = refresh_lock_for(id);
    let _serialised = node_lock.lock().await;

    // Step 1: take a consistent snapshot, then release the store lock
    // before fetching from the network.
    let manifest = state.read_manifest().map_err(|e| RefreshError::Storage {
        message: e.to_string(),
    })?;
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
    let source = snapshot
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or("url")
        .to_string();

    // Step 2: fetch the new content. May take seconds; lockless.
    // Domain-sourced nodes resolve via the configured DoH provider
    // instead of an HTTP fetch; everything downstream (write, stamp,
    // events) is shared with the URL path.
    let new_content = if source == "domain" {
        resolve_domain_content(state, &url).await?
    } else {
        fetch_remote(&url, state).await?
    };

    // Step 3: re-acquire the manifest under the store lock and stamp
    // last_refresh / last_refresh_ms on the (possibly relocated) node.
    let (updated_snapshot, content_changed) = {
        let _guard = state.lock_store().map_err(|e| RefreshError::Storage {
            message: e.to_string(),
        })?;
        let mut manifest = Manifest::load(&state.paths).map_err(|e| RefreshError::Storage {
            message: e.to_string(),
        })?;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let stamp = format_timestamp(now_ms);
        let touched = stamp_node(&mut manifest.root, id, &stamp, now_ms);
        if !touched {
            // The node was deleted while fetching. Do not recreate its content.
            return Err(RefreshError::InvalidId);
        }
        // Compare with the entries file (always LF on disk). The
        // remote payload may use CRLF, so normalize before comparing —
        // otherwise a CRLF response would defeat the equality check on
        // every poll and we'd emit a spurious "content changed" event each
        // tick.
        let old_content = entries::read_entry(&state.paths.entries_dir, id).map_err(|e| {
            RefreshError::Storage {
                message: e.to_string(),
            }
        })?;
        let new_content_lf = entries::normalize_to_lf(&new_content);
        let content_changed = old_content != new_content_lf;
        if content_changed {
            entries::write_entry(&state.paths.entries_dir, id, &new_content_lf).map_err(|e| {
                RefreshError::Storage {
                    message: e.to_string(),
                }
            })?;
        }

        manifest
            .save(&state.paths)
            .map_err(|e| RefreshError::Storage {
                message: e.to_string(),
            })?;
        (
            find_node(&manifest.root, id).unwrap_or(snapshot.clone()),
            content_changed,
        )
    };

    // Step 4: tell the UI. Both events match the Electron broadcast
    // names so the existing renderer subscribers fire unchanged.
    let _ = app.emit(
        "hosts_refreshed",
        json!({ "_args": [updated_snapshot.clone()] }),
    );
    if content_changed && emit_content_changed {
        let _ = app.emit("hosts_content_changed", json!({ "_args": [id] }));
    }

    if content_changed {
        Ok(RefreshOutcome::Updated {
            node: updated_snapshot,
        })
    } else {
        Ok(RefreshOutcome::Unchanged {
            node: updated_snapshot,
        })
    }
}

/// Refresh every remote node in the manifest. Failures are collected
/// per-node and returned alongside successes so the caller (renderer
/// or background scanner) can decide what to do.
pub async fn refresh_all<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Vec<(String, Result<RefreshOutcome, RefreshError>)> {
    let manifest = match state.read_manifest() {
        Ok(m) => m,
        Err(e) => {
            log::warn!("manifest load failed: {e}");
            return Vec::new();
        }
    };
    let ids = collect_remote_ids(&manifest.root);
    refresh_many(app, state, ids).await
}

async fn refresh_many<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    ids: Vec<String>,
) -> Vec<(String, Result<RefreshOutcome, RefreshError>)> {
    let mut results = Vec::with_capacity(ids.len());
    let mut changed_ids = Vec::new();
    for id in ids {
        let outcome = refresh_one_inner(app, state, &id, false).await;
        if matches!(&outcome, Ok(RefreshOutcome::Updated { .. })) {
            changed_ids.push(id.clone());
        }
        results.push((id, outcome));
    }
    emit_content_changed_batch(app, &changed_ids);
    results
}

fn emit_content_changed_batch<R: Runtime>(app: &AppHandle<R>, ids: &[String]) {
    if ids.is_empty() {
        return;
    }
    let _ = app.emit("hosts_content_changed_batch", json!({ "_args": [ids] }));
}

fn log_refresh_errors(results: &[(String, Result<RefreshOutcome, RefreshError>)]) {
    for (id, outcome) in results {
        if let Err(e) = outcome {
            log::warn!("{id}: {e:?}");
        }
    }
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
        if should_refresh_all_on_startup(&app) {
            let state_guard = app.state::<AppState>();
            let results = refresh_all(&app, state_guard.inner()).await;
            log_refresh_errors(&results);
            let _ = app.emit("reload_list", json!({ "_args": [] }));
            tokio::time::sleep(SCAN_INTERVAL).await;
            if stop_for_task.load(Ordering::Relaxed) {
                return;
            }
        }
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
    let manifest = match state.read_manifest() {
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
    let results = refresh_many(app, state, due_ids).await;
    log_refresh_errors(&results);
    // Mirror the Electron `broadcast(events.reload_list)` at the end
    // of every scan so List components rerun loadHostsData.
    let _ = app.emit("reload_list", json!({ "_args": [] }));
}

fn should_refresh_all_on_startup<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state_guard = app.state::<AppState>();
    state_guard
        .config
        .lock()
        .map(|cfg| cfg.refresh_remote_hosts_on_startup)
        .unwrap_or(false)
}

// ---- fetch -----------------------------------------------------------------

/// Resolve a domain-sourced remote node into hosts content via the
/// configured DoH provider. Errors keep the previous content on disk
/// (the caller only writes on success), matching the HTTP path.
async fn resolve_domain_content(state: &AppState, domain: &str) -> Result<String, RefreshError> {
    if !crate::dns::is_valid_domain(domain) {
        return Err(RefreshError::Fetch {
            message: format!("invalid domain: {domain}"),
        });
    }
    let (provider_id, custom_url) = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        (cfg.dns_provider.clone(), cfg.dns_custom_url.clone())
    };
    let provider =
        crate::dns::provider_by_id(&provider_id, &custom_url).map_err(|e| RefreshError::Fetch {
            message: e.to_string(),
        })?;
    let client = http::build_client(state).map_err(|message| RefreshError::Fetch { message })?;
    let ips = crate::dns::resolve_domain(&client, &provider, domain)
        .await
        .map_err(|e| RefreshError::Fetch {
            message: e.to_string(),
        })?;
    Ok(crate::dns::build_domain_hosts_content(
        domain,
        &ips,
        &provider.label,
    ))
}

async fn fetch_remote(url: &str, state: &AppState) -> Result<String, RefreshError> {
    if let Some(stripped) = url.strip_prefix("file://") {
        return read_file_url(stripped, url);
    }

    let client = http::build_client(state).map_err(|message| RefreshError::Fetch { message })?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| RefreshError::Fetch {
            message: e.to_string(),
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(RefreshError::Fetch {
            message: format!("HTTP {}", status.as_u16()),
        });
    }
    http::response_text_with_limit(response, http::MAX_REMOTE_HOSTS_BYTES)
        .await
        .map_err(|message| RefreshError::Fetch { message })
}

fn read_file_url(stripped: &str, original: &str) -> Result<String, RefreshError> {
    // After `strip_prefix("file://")`:
    //   `file:///Users/x/foo`        → `/Users/x/foo`
    //   `file://localhost/Users/x/y` → `localhost/Users/x/y`
    // We tolerate the optional `localhost` host segment so both forms
    // work the same way. Anything else is treated as an opaque path.
    let path = stripped.strip_prefix("localhost").unwrap_or(stripped);
    http::read_text_file_with_limit(Path::new(path), http::MAX_REMOTE_HOSTS_BYTES).map_err(
        |message| RefreshError::Fetch {
            message: format!("{original}: {message}"),
        },
    )
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
        let is_domain = node.get("source").and_then(Value::as_str) == Some("domain");
        // Domain-sourced nodes carry a bare domain in `url` — accept it
        // directly; URL-sourced nodes keep the http/https/file scheme
        // requirement.
        let url_ok = match node.get("url").and_then(Value::as_str) {
            Some(u) if is_domain => !u.is_empty(),
            Some(u) => {
                u.starts_with("http://") || u.starts_with("https://") || u.starts_with("file://")
            }
            None => false,
        };
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

#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> Vec<Value> {
        // Mixed types under a folder so the walk_remote / find_node /
        // stamp_node passes are exercised against realistic shapes.
        json!([
            { "id": "local-1", "type": "local", "on": true },
            {
                "id": "folder-a",
                "type": "folder",
                "children": [
                    {
                        "id": "remote-1",
                        "type": "remote",
                        "url": "https://example.com/hosts",
                        "refresh_interval": 60,
                        "last_refresh_ms": 0,
                    },
                    {
                        "id": "remote-2",
                        "type": "remote",
                        "url": "https://example.com/other",
                        "refresh_interval": 60,
                        "last_refresh_ms": 1_000,
                    },
                    {
                        "id": "remote-no-interval",
                        "type": "remote",
                        "url": "https://example.com/never",
                        "refresh_interval": 0,
                        "last_refresh_ms": 0,
                    },
                    {
                        "id": "remote-bad-scheme",
                        "type": "remote",
                        "url": "ftp://nope.example.com/hosts",
                        "refresh_interval": 60,
                        "last_refresh_ms": 0,
                    },
                ]
            },
            {
                "id": "remote-file",
                "type": "remote",
                "url": "file:///tmp/hosts",
                "refresh_interval": 60,
                "last_refresh_ms": 0,
            },
            {
                "id": "remote-domain",
                "type": "remote",
                "url": "github.com",
                "source": "domain",
                "refresh_interval": 60,
                "last_refresh_ms": 0,
            },
        ])
        .as_array()
        .cloned()
        .unwrap()
    }

    #[test]
    fn find_node_locates_top_level_then_nested() {
        let nodes = tree();
        assert_eq!(
            find_node(&nodes, "local-1")
                .and_then(|n| n.get("type").and_then(Value::as_str).map(String::from)),
            Some("local".into())
        );
        assert_eq!(
            find_node(&nodes, "remote-1")
                .and_then(|n| n.get("url").and_then(Value::as_str).map(String::from)),
            Some("https://example.com/hosts".into())
        );
        assert!(find_node(&nodes, "missing").is_none());
    }

    #[test]
    fn stamp_node_writes_both_fields_and_returns_true_only_when_found() {
        let mut nodes = tree();
        let touched = stamp_node(&mut nodes, "remote-2", "2026-05-09 14:00:00", 1_700_000);
        assert!(touched);
        let stamped = find_node(&nodes, "remote-2").unwrap();
        assert_eq!(
            stamped.get("last_refresh").and_then(Value::as_str),
            Some("2026-05-09 14:00:00")
        );
        assert_eq!(
            stamped.get("last_refresh_ms").and_then(Value::as_i64),
            Some(1_700_000)
        );

        // Unrelated nodes must not be touched.
        let untouched = find_node(&nodes, "remote-1").unwrap();
        assert_eq!(
            untouched.get("last_refresh_ms").and_then(Value::as_i64),
            Some(0)
        );

        assert!(!stamp_node(&mut nodes, "missing-id", "ts", 0));
    }

    #[test]
    fn collect_remote_ids_skips_local_and_folder_nodes() {
        let ids = collect_remote_ids(&tree());
        assert_eq!(
            ids,
            vec![
                "remote-1",
                "remote-2",
                "remote-no-interval",
                "remote-bad-scheme",
                "remote-file",
                "remote-domain"
            ]
        );
    }

    #[test]
    fn collect_due_remote_ids_respects_interval_url_scheme_and_first_run() {
        // now = 1_000_000 ms.
        // remote-1: last_ms=0 → first-run due.
        // remote-2: last_ms=1_000, interval=60s → 999 sec elapsed → due.
        // remote-no-interval: interval=0 → skip.
        // remote-bad-scheme: ftp:// → skip.
        // remote-file: file:// is allowed, last_ms=0 → due.
        let due = collect_due_remote_ids(&tree(), 1_000_000);
        assert_eq!(
            due,
            vec!["remote-1", "remote-2", "remote-file", "remote-domain"]
        );
    }

    #[test]
    fn collect_due_ids_domain_source_rules() {
        // source=domain 且 url 非空 → 即使没有 http(s):// 前缀也算 due
        let due = collect_due_remote_ids(&tree(), 1_000_000);
        assert!(due.contains(&"remote-domain".into()));

        // source=domain 但 url 为空 → 不 due
        let bare = json!([
            { "id": "d-empty", "type": "remote", "url": "", "source": "domain",
              "refresh_interval": 60, "last_refresh_ms": 0 }
        ]);
        let due2 = collect_due_remote_ids(bare.as_array().unwrap(), 1_000_000);
        assert!(due2.is_empty());
    }

    #[test]
    fn collect_due_remote_ids_skips_when_interval_not_yet_elapsed() {
        // Stamp remote-2 at now-30s and ask for due nodes; with a 60s
        // interval it must not be reported.
        let mut nodes = tree();
        let now_ms: i64 = 10_000_000;
        stamp_node(&mut nodes, "remote-2", "ignored", now_ms - 30_000);
        let due = collect_due_remote_ids(&nodes, now_ms);
        assert!(!due.contains(&"remote-2".into()));
        // remote-1 (last_ms=0) is still due.
        assert!(due.contains(&"remote-1".into()));
    }

    #[test]
    fn lock_for_in_shares_one_mutex_per_id_and_sweeps_idle_entries() {
        let mut map = HashMap::new();

        let a = lock_for_in(&mut map, "a");
        let a_again = lock_for_in(&mut map, "a");
        let b = lock_for_in(&mut map, "b");

        assert!(
            Arc::ptr_eq(&a, &a_again),
            "two refreshes of one node must share a mutex, or they don't exclude each other"
        );
        assert!(!Arc::ptr_eq(&a, &b));
        assert_eq!(map.len(), 2);

        // "a" goes idle (e.g. its node was deleted); the next lookup
        // must reclaim it while leaving the still-referenced "b" alone.
        drop(a);
        drop(a_again);
        let _b_again = lock_for_in(&mut map, "b");

        assert_eq!(map.len(), 1, "idle mutexes must not accumulate");
        assert!(map.contains_key("b"));
    }

    #[tokio::test]
    async fn same_node_refreshes_are_serialised() {
        // The registry is process-wide and tests run in parallel, so use
        // ids no other test touches.
        let first = refresh_lock_for("serialise-test-node");
        let second = refresh_lock_for("serialise-test-node");

        let held = first.lock().await;
        assert!(
            second.try_lock().is_err(),
            "a concurrent refresh of the same node must queue, not interleave"
        );

        drop(held);
        assert!(second.try_lock().is_ok(), "the mutex must release cleanly");
    }

    #[tokio::test]
    async fn different_nodes_refresh_concurrently() {
        let a = refresh_lock_for("concurrent-test-a");
        let b = refresh_lock_for("concurrent-test-b");

        let _held = a.lock().await;

        assert!(
            b.try_lock().is_ok(),
            "unrelated nodes must not block each other — that's why the lock is per-id"
        );
    }

    #[test]
    fn format_timestamp_matches_yyyy_mm_dd_hh_mm_ss_layout() {
        // The exact value depends on the local timezone; only the
        // shape is part of the contract with the renderer's display.
        let s = format_timestamp(1_700_000_000_000);
        let bytes = s.as_bytes();
        assert_eq!(bytes.len(), 19);
        assert_eq!(bytes[4], b'-');
        assert_eq!(bytes[7], b'-');
        assert_eq!(bytes[10], b' ');
        assert_eq!(bytes[13], b':');
        assert_eq!(bytes[16], b':');
        for i in [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18] {
            assert!(
                bytes[i].is_ascii_digit(),
                "char at {i} should be a digit: {s}"
            );
        }
    }
}
