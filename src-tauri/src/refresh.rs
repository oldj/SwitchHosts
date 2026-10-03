//! Remote `hosts` refresh, both renderer-driven and time-driven.
//!
//! Mirrors the Electron implementation in
//! [src/main/actions/hosts/refresh.ts] and [src/main/libs/cron.ts]:
//!
//! - `refresh_one` fetches a URL or resolves a domain list, writes the new
//!   content to `entries/<id>.hosts` if it differs, and commits metadata
//!   and content together. Domain failures retain their own cached IPs.
//! - The background scanner wakes every 60 seconds and calls
//!   `refresh_one` on every remote node whose `refresh_interval`
//!   has elapsed since `last_attempt_ms` (or legacy `last_refresh_ms`).
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

use std::collections::{HashMap, HashSet};
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

impl RefreshOutcome {
    /// A batch may write useful content while some queries failed. Keep that
    /// distinct from full success on both command and HTTP API surfaces.
    pub fn into_renderer_value(self) -> Value {
        let (node, changed) = match self {
            Self::Updated { node } => (node, true),
            Self::Unchanged { node } => (node, false),
        };
        let status = node.get("domain_refresh_status").and_then(Value::as_str);
        let failure = if node.get("source").and_then(Value::as_str) == Some("domain") {
            match status {
                Some("partial") => Some(("domain_partial", "Some domains could not be resolved. Previous addresses were kept where available.")),
                Some("failed") => Some(("domain_failed", "No domains could be resolved. Previous addresses were kept where available.")),
                _ => None,
            }
        } else {
            None
        };
        match failure {
            Some((code, message)) => {
                json!({ "success": false, "code": code, "message": message, "changed": changed, "data": node })
            }
            None => json!({ "success": true, "changed": changed, "data": node }),
        }
    }
}

#[derive(Debug)]
pub enum RefreshError {
    /// Node id doesn't exist in the manifest.
    InvalidId,
    /// Node exists but isn't a remote node.
    NotRemote,
    /// Node has no URL set.
    NoUrl,
    /// The target or its cached data changed while a request was outstanding.
    SourceChanged,
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
            RefreshError::SourceChanged => (
                "source_changed",
                "Remote source or cached content changed during refresh; its old result was discarded.".to_string(),
            ),
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
    let snapshot = read_refresh_snapshot(state, id)?;

    // Step 2: fetch the new content. May take seconds; lockless.
    // Domain-sourced nodes resolve via the configured DoH provider
    // instead of an HTTP fetch; everything downstream (write, stamp,
    // events) is shared with the URL path.
    let (new_content, batch_results) = match &snapshot.target {
        RefreshTarget::Domains(domains) => {
            let cached =
                crate::dns::cached_domain_results(&snapshot.node, domains, &snapshot.content);
            let (provider_label, attempts) = resolve_domain_batch(state, domains).await;
            let now_ms = chrono::Utc::now().timestamp_millis();
            let results = crate::dns::merge_domain_results(
                domains,
                attempts,
                &cached,
                &format_timestamp(now_ms),
                now_ms,
            );
            (
                crate::dns::build_batch_hosts_content(&results, &provider_label),
                Some(results),
            )
        }
        RefreshTarget::Url(url) => (fetch_remote(url, state).await?, None),
    };

    // Step 3: re-acquire the manifest under the store lock and stamp
    // last_refresh / last_refresh_ms on the (possibly relocated) node.
    let (updated_snapshot, content_changed) =
        commit_refresh(state, id, &snapshot, &new_content, batch_results.as_deref())?;

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

struct RefreshSnapshot {
    node: Value,
    target: RefreshTarget,
    content: String,
}

fn read_refresh_snapshot(state: &AppState, id: &str) -> Result<RefreshSnapshot, RefreshError> {
    let _guard = state.lock_store().map_err(storage_error)?;
    let manifest = Manifest::load(&state.paths).map_err(storage_error)?;
    let node = find_node(&manifest.root, id).ok_or(RefreshError::InvalidId)?;
    let target = refresh_target(&node)?;
    let content = entries::read_entry(&state.paths.entries_dir, id).map_err(storage_error)?;
    Ok(RefreshSnapshot {
        node,
        target,
        content,
    })
}

/// Recheck the request snapshot and commit content plus per-domain metadata
/// under the same lock and undo journal. Readers cannot observe a half batch,
/// and a storage failure restores both the prior content and its timestamps.
fn commit_refresh(
    state: &AppState,
    id: &str,
    snapshot: &RefreshSnapshot,
    new_content: &str,
    batch_results: Option<&[crate::dns::DomainResult]>,
) -> Result<(Value, bool), RefreshError> {
    use crate::storage::transaction::{self, Target};

    let _guard = state.lock_store().map_err(storage_error)?;
    let mut manifest = Manifest::load(&state.paths).map_err(storage_error)?;
    let current = find_node(&manifest.root, id).ok_or(RefreshError::InvalidId)?;
    ensure_same_target(&current, &snapshot.target)?;
    let old_content = entries::read_entry(&state.paths.entries_dir, id).map_err(storage_error)?;
    // Import/restore can replace a node with the same id and source while the
    // request is in flight. Preserve that content and cache, including newer
    // success times for an unchanged IP. Ordinary title/on/interval edits do
    // not invalidate the request.
    let cache_changed = [
        "domain_results",
        "domain_refresh_status",
        "last_refresh",
        "last_refresh_ms",
        "last_attempt",
        "last_attempt_ms",
    ]
    .iter()
    .any(|key| current.get(key) != snapshot.node.get(key));
    if old_content != snapshot.content || cache_changed {
        return Err(RefreshError::SourceChanged);
    }
    let now_ms = chrono::Utc::now().timestamp_millis();
    stamp_refresh(
        &mut manifest.root,
        id,
        &format_timestamp(now_ms),
        now_ms,
        batch_results,
    );

    // Normalize before comparing to avoid changes caused only by CRLF.
    let new_content_lf = entries::normalize_to_lf(new_content);
    let content_changed = old_content != new_content_lf;
    let mut targets = vec![Target::State, Target::Manifest];
    if content_changed {
        targets.push(Target::Entry(id.into()));
    }
    transaction::run(&state.paths, targets, || {
        if content_changed {
            entries::write_entry(&state.paths.entries_dir, id, &new_content_lf)?;
        }
        manifest.save(&state.paths)
    })
    .map_err(storage_error)?;
    Ok((
        find_node(&manifest.root, id).expect("committed node exists"),
        content_changed,
    ))
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
        match outcome {
            Err(e) => log::warn!("{id}: {e:?}"),
            Ok(RefreshOutcome::Updated { node } | RefreshOutcome::Unchanged { node }) => {
                if node.get("source").and_then(Value::as_str) != Some("domain") {
                    continue;
                }
                let Some(status @ ("partial" | "failed")) =
                    node.get("domain_refresh_status").and_then(Value::as_str)
                else {
                    continue;
                };
                let results = node
                    .get("domain_results")
                    .and_then(Value::as_array)
                    .map(Vec::as_slice)
                    .unwrap_or_default();
                let failed = results
                    .iter()
                    .filter(|result| {
                        matches!(
                            result.get("status").and_then(Value::as_str),
                            Some("stale" | "failed")
                        )
                    })
                    .count();
                // One summary per node; per-domain error details may contain
                // data imported from an older client and must not reach logs.
                log::warn!(
                    "{id}: DNS refresh {status}: {failed}/{} domains failed",
                    results.len()
                );
            }
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

/// Configuration and client errors are recorded against every domain as an
/// attempted failure, so retries respect the interval and cached IPs survive.
async fn resolve_domain_batch(
    state: &AppState,
    domains: &[String],
) -> (
    String,
    Vec<Result<Vec<std::net::Ipv4Addr>, crate::dns::DnsError>>,
) {
    let (provider_id, custom_url) = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        (cfg.dns_provider.clone(), cfg.dns_custom_url.clone())
    };
    let prepared = crate::dns::provider_by_id(&provider_id, &custom_url).and_then(|provider| {
        http::build_client(state)
            .map(|client| (provider, client))
            .map_err(|_| crate::dns::DnsError::Network)
    });
    match prepared {
        Ok((provider, client)) => {
            let attempts = crate::dns::resolve_domains(&client, &provider, domains).await;
            (provider.label, attempts)
        }
        Err(error) => (
            String::new(),
            domains.iter().map(|_| Err(error.clone())).collect(),
        ),
    }
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

fn storage_error(error: crate::storage::StorageError) -> RefreshError {
    RefreshError::Storage {
        message: error.to_string(),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum RefreshTarget {
    Url(String),
    Domains(Vec<String>),
}

fn refresh_target(node: &Value) -> Result<RefreshTarget, RefreshError> {
    if node.get("type").and_then(Value::as_str) != Some("remote") {
        return Err(RefreshError::NotRemote);
    }
    if node.get("source").and_then(Value::as_str) != Some("domain") {
        return node
            .get("url")
            .and_then(Value::as_str)
            .filter(|url| !url.is_empty())
            .map(|url| RefreshTarget::Url(url.into()))
            .ok_or(RefreshError::NoUrl);
    }
    let raw: Vec<&str> = match node.get("domains") {
        Some(Value::Array(domains)) => domains
            .iter()
            .map(|domain| {
                domain.as_str().ok_or_else(|| RefreshError::Fetch {
                    message: "Domain list must contain strings.".into(),
                })
            })
            .collect::<Result<_, _>>()?,
        Some(_) => {
            return Err(RefreshError::Fetch {
                message: "Domain list must be an array.".into(),
            })
        }
        None => node
            .get("url")
            .and_then(Value::as_str)
            .into_iter()
            .collect(),
    };
    let mut seen = HashSet::new();
    let mut domains = Vec::new();
    for raw_domain in raw {
        let domain = raw_domain.trim().to_ascii_lowercase();
        if domain.is_empty() {
            continue;
        }
        if !crate::dns::is_valid_domain(&domain) {
            return Err(RefreshError::Fetch {
                message: format!("Invalid domain: {domain}"),
            });
        }
        if seen.insert(domain.clone()) {
            domains.push(domain);
            if domains.len() > crate::dns::MAX_DOMAINS {
                return Err(RefreshError::Fetch {
                    message: format!(
                        "A domain list can contain at most {} distinct domains.",
                        crate::dns::MAX_DOMAINS
                    ),
                });
            }
        }
    }
    if domains.is_empty() {
        return Err(RefreshError::Fetch {
            message: "At least one domain is required.".into(),
        });
    }
    Ok(RefreshTarget::Domains(domains))
}

fn ensure_same_target(current: &Value, expected: &RefreshTarget) -> Result<(), RefreshError> {
    match refresh_target(current) {
        Ok(target) if &target == expected => Ok(()),
        _ => Err(RefreshError::SourceChanged),
    }
}

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

fn stamp_refresh(
    nodes: &mut [Value],
    id: &str,
    ts_str: &str,
    ts_ms: i64,
    results: Option<&[crate::dns::DomainResult]>,
) -> bool {
    for node in nodes.iter_mut() {
        if node.get("id").and_then(Value::as_str) == Some(id) {
            if let Some(obj) = node.as_object_mut() {
                let status = results.map(crate::dns::domain_refresh_status);
                obj.insert("last_attempt".to_string(), json!(ts_str));
                obj.insert("last_attempt_ms".to_string(), json!(ts_ms));
                if status != Some("failed") {
                    obj.insert("last_refresh".to_string(), json!(ts_str));
                    obj.insert("last_refresh_ms".to_string(), json!(ts_ms));
                }
                if let Some(results) = results {
                    obj.insert(
                        "domains".to_string(),
                        json!(results
                            .iter()
                            .map(|result| &result.domain)
                            .collect::<Vec<_>>()),
                    );
                    obj.insert("domain_results".to_string(), json!(results));
                    obj.insert("domain_refresh_status".to_string(), json!(status));
                }
                return true;
            }
        }
        if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            if stamp_refresh(children, id, ts_str, ts_ms, results) {
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
        // Domain lists and legacy single-domain URLs are both valid.
        // URL-sourced nodes keep the http/https/file scheme requirement.
        let url_ok = if is_domain {
            refresh_target(node).is_ok()
        } else {
            match node.get("url").and_then(Value::as_str) {
                Some(u) => {
                    u.starts_with("http://")
                        || u.starts_with("https://")
                        || u.starts_with("file://")
                }
                None => false,
            }
        };
        if !url_ok {
            return;
        }
        let last_ms = node
            .get("last_attempt_ms")
            .and_then(Value::as_i64)
            .or_else(|| node.get("last_refresh_ms").and_then(Value::as_i64))
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

    struct Fixture(AppState);

    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "switchhosts-refresh-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let paths = crate::storage::V5Paths::under(root);
            paths.ensure_dirs().unwrap();
            Self(AppState {
                paths,
                config: Mutex::new(crate::storage::AppConfig::default()),
                store_lock: Mutex::new(()),
                application_recovery: Default::default(),
                config_write_lock: Mutex::new(()),
                update_check_lock: tokio::sync::Mutex::new(()),
                is_will_quit: AtomicBool::new(false),
                last_geometry_persist_ms: std::sync::atomic::AtomicU64::new(0),
                data_dir_recovery: None,
            })
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0.paths.root);
        }
    }

    #[test]
    fn refresh_commit_rolls_back_content_and_metadata_when_manifest_save_fails() {
        let fixture = Fixture::new();
        let state = &fixture.0;
        let node = json!({"id":"batch", "type":"remote", "source":"domain", "domains":["a.test"], "last_refresh_ms":100});
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        entries::write_entry(&state.paths.entries_dir, "batch", "1.2.3.4 a.test\n").unwrap();
        let snapshot = read_refresh_snapshot(state, "batch").unwrap();
        let previous_manifest = std::fs::read(&state.paths.manifest_file).unwrap();
        let previous_state = std::fs::read(&state.paths.state_file).unwrap();
        std::fs::create_dir(state.paths.root.join("manifest.json.tmp")).unwrap();
        let results = crate::dns::merge_domain_results(
            &["a.test".into()],
            vec![Ok(vec!["5.6.7.8".parse().unwrap()])],
            &HashMap::new(),
            "now",
            200,
        );
        assert!(matches!(
            commit_refresh(
                state,
                "batch",
                &snapshot,
                "5.6.7.8 a.test\n",
                Some(&results)
            ),
            Err(RefreshError::Storage { .. })
        ));
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "batch").unwrap(),
            "1.2.3.4 a.test\n"
        );
        assert_eq!(
            std::fs::read(&state.paths.manifest_file).unwrap(),
            previous_manifest
        );
        assert_eq!(
            std::fs::read(&state.paths.state_file).unwrap(),
            previous_state
        );
        assert!(!state
            .paths
            .internal
            .join("storage-transaction.json")
            .exists());
    }

    #[test]
    fn outdated_and_deleted_refresh_targets_do_not_write_content() {
        let fixture = Fixture::new();
        let state = &fixture.0;
        let node =
            json!({"id":"batch", "type":"remote", "source":"domain", "domains":["new.test"]});
        Manifest {
            root: vec![node],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        entries::write_entry(&state.paths.entries_dir, "batch", "current").unwrap();
        let mut snapshot = read_refresh_snapshot(state, "batch").unwrap();
        snapshot.target = RefreshTarget::Domains(vec!["old.test".into()]);
        assert!(matches!(
            commit_refresh(state, "batch", &snapshot, "outdated", None),
            Err(RefreshError::SourceChanged)
        ));
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "batch").unwrap(),
            "current"
        );
        Manifest::default().save(&state.paths).unwrap();
        entries::delete_entry(&state.paths.entries_dir, "batch").unwrap();
        assert!(matches!(
            commit_refresh(state, "batch", &snapshot, "outdated", None),
            Err(RefreshError::InvalidId)
        ));
        assert!(!entries::entry_path(&state.paths.entries_dir, "batch")
            .unwrap()
            .exists());
    }

    #[test]
    fn in_flight_results_cannot_overwrite_a_reimported_domain_cache() {
        for query_succeeds in [false, true] {
            for imported_ip in ["1.2.3.4", "5.6.7.8"] {
                let fixture = Fixture::new();
                let state = &fixture.0;
                let node = json!({"id":"batch", "type":"remote", "source":"domain", "domains":["a.test"],
                    "domain_results":[{"domain":"a.test", "ips":["1.2.3.4"], "status":"resolved", "last_success_ms":100}]});
                let original_content = crate::dns::build_domain_hosts_content(
                    "a.test",
                    &["1.2.3.4".parse().unwrap()],
                    "Test DoH",
                );
                Manifest {
                    root: vec![node],
                    ..Default::default()
                }
                .save(&state.paths)
                .unwrap();
                entries::write_entry(&state.paths.entries_dir, "batch", &original_content).unwrap();
                let snapshot = read_refresh_snapshot(state, "batch").unwrap();
                let domains = vec!["a.test".into()];
                let cached =
                    crate::dns::cached_domain_results(&snapshot.node, &domains, &snapshot.content);

                // The request is still in flight when the user deletes the item
                // and imports the same id/source, possibly with the same IP but
                // a more recent successful lookup.
                Manifest::default().save(&state.paths).unwrap();
                entries::delete_entry(&state.paths.entries_dir, "batch").unwrap();
                let imported_node = json!({"id":"batch", "type":"remote", "source":"domain", "domains":["a.test"],
                    "domain_results":[{"domain":"a.test", "ips":[imported_ip], "status":"resolved", "last_success_ms":200}]});
                let imported_content = crate::dns::build_domain_hosts_content(
                    "a.test",
                    &[imported_ip.parse().unwrap()],
                    "Test DoH",
                );
                let backup = json!({"format":"switchhosts-backup", "manifest":{"root":[imported_node.clone()]},
                    "entries":{"batch":imported_content.clone()}});
                assert_eq!(
                    crate::import_export::import_backup_bytes(
                        &serde_json::to_vec(&backup).unwrap(),
                        &state.paths,
                    )
                    .unwrap(),
                    json!(true)
                );

                let attempt = if query_succeeds {
                    Ok(vec!["9.8.7.6".parse().unwrap()])
                } else {
                    Err(crate::dns::DnsError::NoARecord)
                };
                let results = crate::dns::merge_domain_results(
                    &domains,
                    vec![attempt],
                    &cached,
                    "later",
                    300,
                );
                let content = crate::dns::build_batch_hosts_content(&results, "Test DoH");
                assert!(matches!(
                    commit_refresh(state, "batch", &snapshot, &content, Some(&results)),
                    Err(RefreshError::SourceChanged)
                ));
                assert_eq!(
                    Manifest::load(&state.paths).unwrap().root,
                    vec![imported_node]
                );
                assert_eq!(
                    entries::read_entry(&state.paths.entries_dir, "batch").unwrap(),
                    imported_content
                );
            }
        }
    }

    #[test]
    fn in_flight_url_result_cannot_overwrite_replaced_content() {
        let fixture = Fixture::new();
        let state = &fixture.0;
        let node = json!({"id":"url", "type":"remote", "url":"https://example.test/hosts"});
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        entries::write_entry(&state.paths.entries_dir, "url", "original").unwrap();
        let snapshot = read_refresh_snapshot(state, "url").unwrap();
        let backup = json!({"format":"switchhosts-backup", "manifest":{"root":[node.clone()]},
            "entries":{"url":"imported"}});
        crate::import_export::import_backup_bytes(
            &serde_json::to_vec(&backup).unwrap(),
            &state.paths,
        )
        .unwrap();
        assert!(matches!(
            commit_refresh(state, "url", &snapshot, "old response", None),
            Err(RefreshError::SourceChanged)
        ));
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "url").unwrap(),
            "imported"
        );
        assert_eq!(Manifest::load(&state.paths).unwrap().root, vec![node]);
    }

    #[test]
    fn in_flight_result_cannot_restore_cache_cleared_by_a_source_switch() {
        let fixture = Fixture::new();
        let state = &fixture.0;
        let mut node = json!({"id":"batch", "type":"remote", "source":"domain", "domains":["a.test"],
            "domain_results":[{"domain":"a.test", "ips":["1.2.3.4"], "status":"resolved"}]});
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        entries::write_entry(&state.paths.entries_dir, "batch", "original").unwrap();
        let snapshot = read_refresh_snapshot(state, "batch").unwrap();
        // Switching to URL and back clears DNS cache provenance even if the
        // final domain list matches the in-flight request's initial target.
        node["source"] = json!("url");
        node["url"] = json!("https://example.test/hosts");
        node["domain_results"] = json!([]);
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        node["source"] = json!("domain");
        node["url"] = json!("a.test");
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        assert!(matches!(
            commit_refresh(state, "batch", &snapshot, "outdated", None),
            Err(RefreshError::SourceChanged)
        ));
        assert_eq!(Manifest::load(&state.paths).unwrap().root, vec![node]);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "batch").unwrap(),
            "original"
        );
    }

    #[test]
    fn refresh_commit_preserves_concurrent_title_switch_and_interval_edits() {
        let fixture = Fixture::new();
        let state = &fixture.0;
        let mut node = json!({"id":"url", "type":"remote", "url":"https://example.test/hosts",
            "title":"before", "on":false, "refresh_interval":60});
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        entries::write_entry(&state.paths.entries_dir, "url", "original").unwrap();
        let snapshot = read_refresh_snapshot(state, "url").unwrap();
        node["title"] = json!("after");
        node["on"] = json!(true);
        node["refresh_interval"] = json!(300);
        Manifest {
            root: vec![node],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        let (updated, changed) =
            commit_refresh(state, "url", &snapshot, "new response", None).unwrap();
        assert!(changed);
        assert_eq!(updated["title"], "after");
        assert_eq!(updated["on"], true);
        assert_eq!(updated["refresh_interval"], 300);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "url").unwrap(),
            "new response"
        );
    }

    #[tokio::test]
    async fn provider_configuration_failure_still_commits_attempts_and_prunes_removed_domains() {
        let fixture = Fixture::new();
        let state = &fixture.0;
        state.config.lock().unwrap().dns_provider = "not-a-provider".into();
        let node = json!({"id":"batch", "type":"remote", "source":"domain", "domains":["a.test"], "last_refresh_ms":100,
            "domain_results":[{"domain":"a.test", "ips":["1.2.3.4"], "status":"resolved", "last_success_ms":100}]});
        Manifest {
            root: vec![node.clone()],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        let original = "1.2.3.4 a.test\n5.6.7.8 removed.test\n";
        entries::write_entry(&state.paths.entries_dir, "batch", original).unwrap();
        let snapshot = read_refresh_snapshot(state, "batch").unwrap();
        let domains = vec!["a.test".into()];
        let cached = crate::dns::cached_domain_results(&node, &domains, original);
        let (label, attempts) = resolve_domain_batch(state, &domains).await;
        let results = crate::dns::merge_domain_results(&domains, attempts, &cached, "now", 200);
        let content = crate::dns::build_batch_hosts_content(&results, &label);
        let (updated, changed) =
            commit_refresh(state, "batch", &snapshot, &content, Some(&results)).unwrap();
        assert!(changed);
        assert_eq!(updated["domain_refresh_status"], "failed");
        assert_eq!(updated["last_refresh_ms"], 100);
        assert!(updated["last_attempt_ms"].as_i64().unwrap() > 100);
        assert_eq!(updated["domain_results"][0]["status"], "stale");
        let persisted = entries::read_entry(&state.paths.entries_dir, "batch").unwrap();
        assert!(persisted.contains("1.2.3.4 a.test"));
        assert!(!persisted.contains("removed.test"));
    }

    #[tokio::test]
    async fn batch_setup_errors_keep_safe_categories_without_configuration_details() {
        for case in 0..3 {
            let fixture = Fixture::new();
            let state = &fixture.0;
            let expected = {
                let mut config = state.config.lock().unwrap();
                match case {
                    0 => {
                        config.dns_provider = "private-provider-secret".into();
                        crate::dns::DnsError::InvalidProvider
                    }
                    1 => {
                        config.dns_provider = "custom".into();
                        config.dns_custom_url =
                            "https://user:secret@resolver.test/resolve?token=secret".into();
                        crate::dns::DnsError::InvalidTemplate
                    }
                    _ => {
                        config.use_proxy = true;
                        config.proxy_host = "[private-proxy-secret".into();
                        config.proxy_port = 8080;
                        crate::dns::DnsError::Network
                    }
                }
            };
            if case == 2 {
                // Fail before any request so this test never uses real DNS.
                assert!(http::build_client(state).is_err());
            }
            let (label, attempts) =
                resolve_domain_batch(state, &["a.test".into(), "b.test".into()]).await;
            assert!(label.is_empty());
            assert_eq!(attempts.len(), 2);
            for attempt in attempts {
                let error = attempt.unwrap_err();
                assert_eq!(
                    std::mem::discriminant(&error),
                    std::mem::discriminant(&expected)
                );
                let message = error.to_string();
                assert!(!message.contains("secret"));
                assert!(!message.contains("resolver.test"));
                assert!(!message.contains("private"));
            }
        }
    }

    #[test]
    fn domain_targets_upgrade_old_urls_and_prefer_explicit_lists() {
        assert_eq!(
            refresh_target(&json!({"type":"remote", "source":"domain", "url":"GitHub.com"}))
                .unwrap(),
            RefreshTarget::Domains(vec!["github.com".into()])
        );
        assert_eq!(refresh_target(&json!({"type":"remote", "source":"domain", "url":"old.test", "domains":[" A.test ", "b.test", "a.test", ""]})).unwrap(),
            RefreshTarget::Domains(vec!["a.test".into(), "b.test".into()]));
        assert!(refresh_target(
            &json!({"type":"remote", "source":"domain", "url":"old.test", "domains":[]})
        )
        .is_err());
        assert!(refresh_target(
            &json!({"type":"remote", "source":"domain", "domains":["a.test", "bad domain"]})
        )
        .is_err());
    }

    #[test]
    fn domain_target_limit_applies_after_case_insensitive_deduplication() {
        assert_eq!(crate::dns::MAX_DOMAINS, 100);
        let domains: Vec<String> = (0..100).map(|index| format!("d{index}.test")).collect();
        let mut input = domains.clone();
        input.extend([" D0.TEST ".into(), "d99.test".into(), "".into()]);
        assert_eq!(
            refresh_target(&json!({"type":"remote", "source":"domain", "domains":input})).unwrap(),
            RefreshTarget::Domains(domains)
        );
        input.push("one-too-many.test".into());
        assert!(matches!(
            refresh_target(&json!({"type":"remote", "source":"domain", "domains":input})),
            Err(RefreshError::Fetch { .. })
        ));
    }

    #[test]
    fn scanner_logging_reports_batch_failures_once_without_domain_error_details() {
        struct RecordingLogger(Mutex<Vec<String>>);

        impl log::Log for RecordingLogger {
            fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
                metadata.level() == log::Level::Warn
            }

            fn log(&self, record: &log::Record<'_>) {
                if self.enabled(record.metadata()) {
                    let message = record.args().to_string();
                    if message.starts_with("review-log-") {
                        self.0.lock().unwrap().push(message);
                    }
                }
            }

            fn flush(&self) {}
        }

        static LOGGER: RecordingLogger = RecordingLogger(Mutex::new(Vec::new()));
        log::set_logger(&LOGGER).unwrap();
        log::set_max_level(log::LevelFilter::Warn);
        let batch = |status, statuses: &[&str]| {
            json!({"source":"domain", "domain_refresh_status":status, "domain_results": statuses.iter().map(|status|
                json!({"domain":"private.test", "status":status, "ips":[], "error":"https://user:secret@resolver.test/resolve?token=secret"})
            ).collect::<Vec<_>>()})
        };
        let mut url_node = batch("failed", &["failed"]);
        url_node["source"] = json!("url");
        // Exercise the exact log path called after startup and periodic scans.
        log_refresh_errors(&[
            (
                "review-log-partial".into(),
                Ok(RefreshOutcome::Updated {
                    node: batch("partial", &["resolved", "stale", "failed"]),
                }),
            ),
            (
                "review-log-failed".into(),
                Ok(RefreshOutcome::Unchanged {
                    node: batch("failed", &["stale", "failed"]),
                }),
            ),
            (
                "review-log-complete".into(),
                Ok(RefreshOutcome::Updated {
                    node: batch("complete", &["resolved"]),
                }),
            ),
            (
                "review-log-url".into(),
                Ok(RefreshOutcome::Unchanged { node: url_node }),
            ),
            ("review-log-error".into(), Err(RefreshError::InvalidId)),
        ]);
        let warnings = LOGGER.0.lock().unwrap();
        assert_eq!(
            warnings.as_slice(),
            [
                "review-log-partial: DNS refresh partial: 2/3 domains failed",
                "review-log-failed: DNS refresh failed: 2/2 domains failed",
                "review-log-error: InvalidId",
            ]
        );
        assert!(warnings.iter().all(|warning| !warning.contains("secret")
            && !warning.contains("resolver.test")
            && !warning.contains("private.test")));
    }

    #[test]
    fn stale_refresh_cannot_overwrite_a_changed_source_domain_list_or_type() {
        let original = json!({"type":"remote", "source":"domain", "domains":["a.test", "b.test"]});
        let target = refresh_target(&original).unwrap();
        assert!(ensure_same_target(&original, &target).is_ok());
        for updated in [
            json!({"type":"remote", "source":"domain", "domains":["a.test"]}),
            json!({"type":"remote", "source":"domain", "domains":["b.test", "a.test"]}),
            json!({"type":"remote", "source":"url", "url":"https://a.test"}),
            json!({"type":"local", "source":"domain", "domains":["a.test", "b.test"]}),
        ] {
            assert!(matches!(
                ensure_same_target(&updated, &target),
                Err(RefreshError::SourceChanged)
            ));
        }
    }

    #[test]
    fn failed_attempt_updates_status_and_retry_clock_without_erasing_last_success() {
        let mut nodes = vec![
            json!({"id":"batch", "type":"remote", "source":"domain", "domains":["a.test"],
            "refresh_interval":60, "last_refresh_ms":100, "last_refresh":"previous"}),
        ];
        let results = crate::dns::merge_domain_results(
            &["a.test".into()],
            vec![Err(crate::dns::DnsError::NoARecord)],
            &HashMap::new(),
            "now",
            1_000_000,
        );
        stamp_refresh(&mut nodes, "batch", "now", 1_000_000, Some(&results));
        assert_eq!(nodes[0]["domain_refresh_status"], "failed");
        assert_eq!(nodes[0]["last_attempt_ms"], 1_000_000);
        assert_eq!(nodes[0]["last_refresh_ms"], 100);
        assert_eq!(nodes[0]["domain_results"][0]["status"], "failed");
        assert!(collect_due_remote_ids(&nodes, 1_030_000).is_empty());
        assert_eq!(collect_due_remote_ids(&nodes, 1_060_000), vec!["batch"]);
    }

    #[test]
    fn partial_and_failed_batches_are_never_reported_as_complete_success() {
        for (status, code) in [("partial", "domain_partial"), ("failed", "domain_failed")] {
            let node = json!({"source":"domain", "domain_refresh_status":status});
            let result = RefreshOutcome::Updated { node: node.clone() }.into_renderer_value();
            assert_eq!(result["success"], false);
            assert_eq!(result["code"], code);
            assert_eq!(result["changed"], true);
            assert_eq!(result["data"], node);
        }
    }

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
        let touched = stamp_refresh(
            &mut nodes,
            "remote-2",
            "2026-05-09 14:00:00",
            1_700_000,
            None,
        );
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

        assert!(!stamp_refresh(&mut nodes, "missing-id", "ts", 0, None));
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
        stamp_refresh(&mut nodes, "remote-2", "ignored", now_ms - 30_000, None);
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
