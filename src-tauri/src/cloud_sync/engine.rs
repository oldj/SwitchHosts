//! Sync engine: first-time setup, pull-overwrite, push-if-changed, and the
//! background watchers that keep local and remote in step like a local git
//! workflow — the auto-push watcher publishes local mutations (debounced),
//! and the remote poller periodically fetches remote changes.
//!
//! Locking discipline mirrors `refresh`: network calls happen **outside**
//! `lock_store`; the lock only covers local read/modify/write. The payload
//! is built under the lock (it reads manifest + entries), so a pull cannot
//! interleave with a user edit and produce a mixed snapshot.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::account::{self, Account, AuthMethod, Platform};
use super::payload::{self, ApplySummary};
use super::provider::{self, DevicePollOutcome, Provider, SyncError};
use crate::http;
use crate::storage::AppState;

/// Local data was modified — schedule an automatic push (debounced).
static DIRTY: AtomicBool = AtomicBool::new(false);
/// A push is currently executing. Prevents overlapping PUTs when several
/// mutations land while one network round trip is already in flight.
static IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// Quiet window (no further mutations) before an auto push fires.
const DEBOUNCE_QUIET: Duration = Duration::from_secs(3);
const WATCHER_TICK: Duration = Duration::from_millis(500);
/// Startup silent pull waits this long so the renderer's initial burst
/// (manifest reload, config push) gets the storage lock first.
const STARTUP_PULL_DELAY: Duration = Duration::from_secs(7);
/// How often the remote poller checks for changes pushed from another
/// machine. The startup pull covers the first check; after that this loop
/// mirrors a background `git fetch`. 30s feels timely for a hosts tool
/// without hammering the platform APIs during an always-on tray session
/// (120 requests/hour, well inside authenticated limits).
const POLL_INTERVAL: Duration = Duration::from_secs(30);

pub fn on_data_mutated() {
    DIRTY.store(true, Ordering::Relaxed);
}

/// Spawn the never-quitting auto-push watcher once at app startup.
/// Mirrors `refresh::start_background_scanner`'s shape: one drove-slow
/// task holding an `AppHandle` clone.
pub fn start_auto_push_watcher<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Wait for the first dirty marker; nothing to do when idle.
            while !DIRTY.load(Ordering::Relaxed) {
                tokio::time::sleep(WATCHER_TICK).await;
            }
            // Debounce: extend the window while more mutations arrive, so a
            // burst of applies pushes once instead of N times.
            let mut last_seen = std::time::Instant::now();
            loop {
                tokio::time::sleep(WATCHER_TICK).await;
                if DIRTY.swap(false, Ordering::Relaxed) {
                    last_seen = std::time::Instant::now();
                }
                if last_seen.elapsed() >= DEBOUNCE_QUIET {
                    break;
                }
            }
            if IN_FLIGHT.swap(true, Ordering::Relaxed) {
                continue;
            }
            if !is_logged_in(&app) {
                IN_FLIGHT.store(false, Ordering::Relaxed);
                continue;
            }
            let result = push_once(&app).await;
            IN_FLIGHT.store(false, Ordering::Relaxed);
            match result {
                Ok(_) => {}
                Err(code) => log::warn!("automatic push failed: {code}"),
            }
        }
    });
}

/// Silent startup pull: skip notification noise, but still overwrite local
/// when the remote is newer (with snapshot protection).
pub fn start_startup_pull<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_PULL_DELAY).await;
        if !is_logged_in(&app) {
            return;
        }
        match pull_once(&app, true).await {
            Ok(_) => {}
            Err(code) if code == "up_to_date" || code == "nothing_to_pull" => {}
            Err(code) => log::info!("silent startup pull skipped/failed: {code}"),
        }
    });
}

/// What the remote poller should do on a given tick. A pure function so
/// the ordering rules — a pending local push always beats a pull — stay
/// unit-testable without a live app handle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PollAction {
    Pull,
    SkipNotLoggedIn,
    /// Local has unpushed mutations: let the auto-push watcher publish
    /// them first. Pulling now would snapshot-and-discard the user's fresh
    /// work in favour of a (presumably older) remote copy.
    SkipPendingPush,
    /// A push is mid-round-trip; its PUT decides the remote state, so the
    /// next tick re-checks instead of racing it.
    SkipInFlight,
}

pub(super) fn decide_poll(logged_in: bool, dirty: bool, in_flight: bool) -> PollAction {
    if !logged_in {
        PollAction::SkipNotLoggedIn
    } else if dirty {
        PollAction::SkipPendingPush
    } else if in_flight {
        PollAction::SkipInFlight
    } else {
        PollAction::Pull
    }
}

/// Continuous remote-change watcher: every [`POLL_INTERVAL`], when logged
/// in and nothing local is pending, compare the remote payload with the
/// last known hash and pull-overwrite (snapshot first) when another machine
/// pushed. `pull_once` is a no-op when hashes match, so the steady-state
/// cost is one cheap GET per tick. The loop never exits; errors just
/// throttle to the next tick.
pub fn start_remote_poller<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            let logged_in = is_logged_in(&app);
            let dirty = DIRTY.load(Ordering::Relaxed);
            let in_flight = IN_FLIGHT.load(Ordering::Relaxed);
            if !matches!(decide_poll(logged_in, dirty, in_flight), PollAction::Pull) {
                continue;
            }
            match pull_once(&app, true).await {
                Ok(_) => {}
                Err(code) if code == "up_to_date" || code == "nothing_to_pull" => {}
                Err(code) => log::info!("remote poll pull skipped/failed: {code}"),
            }
        }
    });
}

fn is_logged_in<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<AppState>();
    account::load(&state.paths.internal)
        .map(|a| a.is_some())
        .unwrap_or(false)
}

fn client_for<R: Runtime>(app: &AppHandle<R>) -> Result<reqwest::Client, String> {
    let state = app.state::<AppState>();
    http::build_client(state.inner())
}

fn load_account<R: Runtime>(app: &AppHandle<R>) -> Result<Account, String> {
    let state = app.state::<AppState>();
    account::load(&state.paths.internal)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "not_logged_in".to_string())
}

fn save_account<R: Runtime>(app: &AppHandle<R>, account: &Account) -> Result<(), String> {
    let state = app.state::<AppState>();
    account::save(&state.paths.internal, account).map_err(|e| e.to_string())
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// First-time setup: verify already performed by the caller (which got the
/// login); this turns a verified token + repo name into a working repo and
/// decides which side wins the first sync, exactly as the wizard's step 2
/// describes:
///
/// - no repo → create it and push local (local wins);
/// - repo exists with the cloud file → pull and overwrite local (remote wins);
/// - repo exists without the cloud file → push local (local wins).
pub async fn setup<R: Runtime>(
    app: &AppHandle<R>,
    platform: Platform,
    auth_method: AuthMethod,
    token: String,
    login: String,
    repo: String,
    device_client_id: Option<String>,
) -> Result<Value, String> {
    if !account::is_valid_repo_name(&repo) {
        return Err(SyncError::InvalidRepoName.code());
    }
    let client = client_for(app)?;
    let provider = Provider::new(platform);
    log::info!(
        "cloud sync setup: platform={}, login={}, repo={}",
        platform.label(),
        login,
        repo
    );
    let exists = provider
        .has_repo(&client, &token, &login, &repo)
        .await
        .map_err(err_code)?;

    let mut account = Account {
        platform,
        auth_method,
        login,
        repo,
        token,
        device_client_id: device_client_id.unwrap_or_default(),
        last_push_at: None,
        last_pull_at: None,
        last_hash: None,
    };

    let result = if !exists {
        provider
            .create_repo(&client, &account.token, &account.repo)
            .await
            .map_err(err_code)?;
        let summary = push_new_file(app, &client, &provider, &account).await?;
        account.last_push_at = Some(now_rfc3339());
        account.last_hash = Some(summary.hash.clone());
        save_account(app, &account)?;
        json!({ "outcome": "created", "pushed": true, "hostsCount": summary.hosts_count })
    } else {
        let remote = provider
            .get_file(&client, &account.token, &account.login, &account.repo)
            .await
            .map_err(err_code)?;
        match remote {
            None => {
                let summary = push_new_file(app, &client, &provider, &account).await?;
                account.last_push_at = Some(now_rfc3339());
                account.last_hash = Some(summary.hash.clone());
                save_account(app, &account)?;
                json!({ "outcome": "pushed", "pushed": true, "hostsCount": summary.hosts_count })
            }
            Some(remote) => {
                let (summary, hash) = apply_remote(app, remote.content).await?;
                account.last_pull_at = Some(now_rfc3339());
                account.last_hash = Some(hash);
                save_account(app, &account)?;
                announce_reload(app);
                json!({
                    "outcome": "pulled",
                    "hostsCount": summary.hosts_count,
                    "trashcanCount": summary.trashcan_count,
                })
            }
        }
    };
    Ok(result)
}

#[derive(Debug)]
struct PushOutcome {
    hosts_count: usize,
    hash: String,
}

/// Build the local payload under the store lock, encode + hash it, and PUT
/// as a brand-new file (no sha).
async fn push_new_file<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    provider: &Provider,
    account: &Account,
) -> Result<PushOutcome, String> {
    let (bytes, hash) = build_local_payload_locked(app)?;
    provider
        .put_file(
            client,
            &account.token,
            &account.login,
            &account.repo,
            &bytes,
            None,
        )
        .await
        .map_err(err_code)?;
    let hosts_count = count_local_hosts(app)?;
    Ok(PushOutcome { hosts_count, hash })
}

/// Manual push. Skips the network when the payload is unchanged since the
/// last sync; updates sha on concurrent-409 with one retry.
pub async fn push_once<R: Runtime>(app: &AppHandle<R>) -> Result<Value, String> {
    let account = load_account(app)?;
    let client = client_for(app)?;
    let provider = Provider::new(account.platform);

    let (bytes, hash) = build_local_payload_locked(app)?;
    if account.last_hash.as_deref() == Some(hash.as_str()) {
        return Ok(json!({ "outcome": "up_to_date" }));
    }

    let remote = provider
        .get_file(&client, &account.token, &account.login, &account.repo)
        .await
        .map_err(err_code)?;
    let (existing_sha, _remote_hash) = match remote {
        None => (None, None),
        Some(file) => {
            let rh = payload::stable_hash_bytes(&file.content).map_err(|e| e.to_string())?;
            if rh == hash {
                // Someone else pushed our exact payload; just adopt it.
                let mut account = account.clone();
                account.last_push_at = Some(now_rfc3339());
                account.last_hash = Some(rh);
                save_account(app, &account)?;
                return Ok(json!({ "outcome": "up_to_date" }));
            }
            (Some(file.sha), Some(rh))
        }
    };

    let push_result = provider
        .put_file(
            &client,
            &account.token,
            &account.login,
            &account.repo,
            &bytes,
            existing_sha.clone(),
        )
        .await;
    if let Err(SyncError::Api(status, _)) = &push_result {
        if *status == 409 && existing_sha.is_some() {
            // sha raced with another writer — re-read and retry once.
            let fresh = provider
                .get_file(&client, &account.token, &account.login, &account.repo)
                .await
                .map_err(err_code)?;
            if let Some(fresh) = fresh {
                let fresh_hash = payload::stable_hash_bytes(&fresh.content).map_err(|e| e.to_string())?;
                if fresh_hash == hash {
                    let mut account = account.clone();
                    account.last_push_at = Some(now_rfc3339());
                    account.last_hash = Some(fresh_hash);
                    save_account(app, &account)?;
                    return Ok(json!({ "outcome": "up_to_date" }));
                }
                provider
                    .put_file(
                        &client,
                        &account.token,
                        &account.login,
                        &account.repo,
                        &bytes,
                        Some(fresh.sha),
                    )
                    .await
                    .map_err(err_code)?;
                let mut account = account.clone();
                account.last_push_at = Some(now_rfc3339());
                account.last_hash = Some(hash);
                save_account(app, &account)?;
                return Ok(json!({ "outcome": "pushed" }));
            }
        }
    }
    push_result.map_err(err_code)?;

    let mut account = account.clone();
    account.last_push_at = Some(now_rfc3339());
    account.last_hash = Some(hash);
    save_account(app, &account)?;
    Ok(json!({ "outcome": "pushed" }))
}

/// Manual / startup pull. Overwrites local when the remote differs; always
/// keeps a timestamped snapshot of the old local payload first.
pub async fn pull_once<R: Runtime>(app: &AppHandle<R>, _silent: bool) -> Result<Value, String> {
    let account = load_account(app)?;
    let client = client_for(app)?;
    let provider = Provider::new(account.platform);

    let remote = provider
        .get_file(&client, &account.token, &account.login, &account.repo)
        .await
        .map_err(err_code)?;
    let Some(remote) = remote else {
        let mut account = account.clone();
        account.last_pull_at = Some(now_rfc3339());
        save_account(app, &account)?;
        return Err("nothing_to_pull".to_string());
    };
    let remote_hash = payload::stable_hash_bytes(&remote.content).map_err(|e| e.to_string())?;
    let local = build_local_payload_locked(app)?;
    if local.1 == remote_hash {
        let mut account = account.clone();
        account.last_pull_at = Some(now_rfc3339());
        account.last_hash = Some(remote_hash);
        save_account(app, &account)?;
        return Ok(json!({ "outcome": "up_to_date" }));
    }
    let (summary, hash) = apply_remote(app, remote.content).await?;
    let mut account = account.clone();
    account.last_pull_at = Some(now_rfc3339());
    account.last_hash = Some(hash);
    save_account(app, &account)?;
    announce_reload(app);
    Ok(json!({
        "outcome": "pulled",
        "hostsCount": summary.hosts_count,
        "trashcanCount": summary.trashcan_count,
    }))
}

/// Shared by setup and pull: parse → snapshot current local → apply under
/// the store lock → return summary + adopted hash. The snapshot is written
/// outside the transactional apply but before any local file is touched,
/// so a crash mid-apply still leaves the pre-pull snapshot on disk.
async fn apply_remote<R: Runtime>(
    app: &AppHandle<R>,
    remote_bytes: Vec<u8>,
) -> Result<(ApplySummary, String), String> {
    log::info!("cloud sync setup: parsing remote payload ({} bytes)", remote_bytes.len());
    let parsed =
        payload::parse_backup(&remote_bytes).map_err(|e| err_code(SyncError::Internal(e.to_string())))?;
    let state = app.state::<AppState>();
    state
        .require_data_dir_usable()
        .map_err(|e| e.to_string())?;

    let local_value = {
        let _guard = state.lock_store().map_err(|e| e.to_string())?;
        let value = payload::build_backup_value(&state.paths).map_err(|e| e.to_string())?;
        value
    };
    log::info!("cloud sync setup: local payload built under lock");
    if let Err(e) = payload::save_snapshot(&state.paths, &local_value) {
        log::warn!("pre-pull snapshot failed; aborting pull to avoid losing data: {e}");
        return Err("snapshot_failed".to_string());
    }
    log::info!("cloud sync setup: pre-pull snapshot saved");
    let summary = {
        let _guard = state.lock_store().map_err(|e| e.to_string())?;
        payload::apply_backup(&state.paths, parsed).map_err(|e| e.to_string())?
    };
    log::info!("cloud sync setup: apply_backup completed (hosts={}, trashcan={})", summary.hosts_count, summary.trashcan_count);
    let hash = payload::stable_hash_bytes(&remote_bytes).map_err(|e| e.to_string())?;
    Ok((summary, hash))
}

fn build_local_payload_locked<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(Vec<u8>, String), String> {
    let state = app.state::<AppState>();
    let _guard = state.lock_store().map_err(|e| e.to_string())?;
    let value = payload::build_backup_value(&state.paths).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
    let hash = payload::stable_hash(&value).map_err(|e| e.to_string())?;
    Ok((bytes, hash))
}

fn count_local_hosts<R: Runtime>(app: &AppHandle<R>) -> Result<usize, String> {
    let state = app.state::<AppState>();
    let manifest = state.read_manifest().map_err(|e| e.to_string())?;
    let mut hosts = 0;
    let mut folders = 0;
    count_walk(&manifest.root, &mut hosts, &mut folders);
    let _ = folders;
    Ok(hosts)
}

fn count_walk(nodes: &[Value], hosts: &mut usize, folders: &mut usize) {
    for node in nodes {
        let kind = node.get("type").and_then(Value::as_str);
        match kind {
            Some("local" | "remote") => *hosts += 1,
            Some("folder") => *folders += 1,
            _ => {}
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            count_walk(children, hosts, folders);
        }
    }
}

fn announce_reload<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit("reload_list", json!({ "_args": [] }));
    let _ = app.emit("tray_list_updated", json!({ "_args": [] }));
}

fn err_code(error: SyncError) -> String {
    let code = error.code();
    log::info!("sync error: {error}");
    code
}

/// Verify a PAT by platform and return the login name.
pub async fn verify_token<R: Runtime>(
    app: &AppHandle<R>,
    platform: Platform,
    token: String,
) -> Result<Value, String> {
    let client = client_for(app)?;
    let provider = Provider::new(platform);
    let login = provider
        .verify(&client, &token.trim())
        .await
        .map_err(err_code)?;
    Ok(json!({ "login": login }))
}

// ---- device flow engine wrappers -------------------------------------------

pub async fn start_device_login<R: Runtime>(
    app: &AppHandle<R>,
    client_id: String,
) -> Result<Value, String> {
    let client = client_for(app)?;
    let response = provider::start_device_code(&client, client_id.trim())
        .await
        .map_err(err_code)?;
    Ok(json!({
        "deviceCode": response.device_code,
        "userCode": response.user_code,
        "verificationUri": response.verification_uri,
        "expiresIn": response.expires_in,
        "interval": response.interval,
    }))
}

pub async fn poll_device_login<R: Runtime>(
    app: &AppHandle<R>,
    client_id: String,
    device_code: String,
) -> Result<Value, String> {
    let client = client_for(app)?;
    match provider::poll_device_token(&client, client_id.trim(), &device_code).await {
        Ok(DevicePollOutcome::Pending { interval }) => Ok(json!({
            "kind": "pending",
            "interval": interval,
        })),
        Ok(DevicePollOutcome::Token { token }) => {
            let provider = Provider::new(Platform::Github);
            let login = provider.verify(&client, &token).await.map_err(err_code)?;
            Ok(json!({ "kind": "token", "token": token, "login": login }))
        }
        Ok(DevicePollOutcome::Expired) => Ok(json!({ "kind": "expired" })),
        Ok(DevicePollOutcome::Denied) => Ok(json!({ "kind": "denied" })),
        Err(e) => Err(err_code(e)),
    }
}

pub async fn logout<R: Runtime>(app: &AppHandle<R>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    account::logout(&state.paths.internal).map_err(|e| e.to_string())?;
    DIRTY.store(false, Ordering::Relaxed);
    Ok(Value::Bool(true))
}

/// Non-secret account view for the settings page. `None` when logged out.
pub fn status<R: Runtime>(app: &AppHandle<R>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let account = account::load(&state.paths.internal).map_err(|e| e.to_string())?;
    Ok(match account {
        None => json!({ "loggedIn": false }),
        Some(account) => {
            let mut view = account.public_view();
            view["loggedIn"] = json!(true);
            view["dirty"] = json!(DIRTY.load(Ordering::Relaxed));
            view
        }
    })
}
