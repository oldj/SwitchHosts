//! Local HTTP API server.
//!
//! Reproduces the four routes the Electron build exposed via Hono on
//! port 50761, plus `/api/refresh`:
//!
//! | Method | Path           | Body |
//! |--------|----------------|------|
//! | GET    | `/`            | `Hello SwitchHosts!` |
//! | GET    | `/remote-test` | `# remote-test\n# <timestamp>` |
//! | GET    | `/api/list`    | `{success, data: flat_list}` JSON |
//! | GET    | `/api/toggle?id=<id>` | `ok` / `bad id.` / `not found.` / see below |
//! | GET    | `/api/refresh?id=<id>` | `{success, changed, data}` / `{success: false, code, message}` JSON |
//!
//! Every route answers `200` even for failures; callers discriminate on
//! the body (`success` for the JSON routes, the literal string for the
//! text ones). That's what `/api/list` already did in the Electron
//! build and what the shipped Alfred workflow expects, so `/api/refresh`
//! follows suit rather than introducing a second error convention on
//! the same port.
//!
//! When the toggle is applied in the backend (no renderer, see below)
//! it can also answer `cancelled.` (user dismissed the OS auth
//! prompt), `write mode not set.`, `recovery required.`,
//! `applied but not persisted.` or `apply failed.`. All replies are 200 with a terse body, matching
//! the existing ones.
//!
//! Lifecycle: the configured port defaults to 50761. Config commits reserve
//! a new listener before persisting, then replace the previous server. Runtime
//! status is queried independently of the user's enabled preference.
//!
//! Toggle behaviour: with a main window alive this matches the
//! Electron implementation byte for byte — the handler emits
//! `toggle_item` with the flipped `on` value and the window's
//! `onToggleItem` runs the apply pipeline, keeping `choice_mode` /
//! folder semantics from `setOnStateOfItem` in one place.
//!
//! A Tauri event with no listener is dropped, though, and there are
//! two supported configurations with no main window: `hide_at_launch`
//! skips window creation at setup, and `lightweight_mode` destroys the
//! window when the user closes it. In both, the broadcast reaches
//! nobody while the endpoint still answers `ok`. The v5 storage plan
//! anticipated this — it noted that applying directly inside the HTTP
//! handler works even when no renderer is alive — so that is what the
//! no-window path does, reusing the renderer's selection rules
//! (`manifest::set_on_state_of_item`) and the same apply pipeline
//! (`commands::apply_aggregated_content`) rather than a bare write.
//!
//! Refresh behaviour: unlike toggle, `/api/refresh` calls
//! `refresh::refresh_one` directly instead of broadcasting to the
//! renderer. The fetch + write + `last_refresh` stamp are backend-owned
//! already — the cron scanner in refresh.rs drives exactly this path —
//! so the handler can await the real outcome and report `changed` /
//! `fetch_failed` back to the caller instead of a blind `ok`. Applying
//! the new content to the system `hosts` file still happens the usual
//! way: `refresh_one` emits `hosts_content_changed`, and List's
//! subscriber re-applies when the node is switched on.

use std::sync::Mutex;

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::hosts_apply::HostsApplyError;
use crate::lifecycle::MAIN_WINDOW_LABEL;
use crate::refresh::{self, RefreshError, RefreshOutcome};
use crate::storage::{AppConfig, AppState, StorageError};

// We pin the HTTP API to the default `Wry` runtime instead of staying
// generic over `R: Runtime`. axum's `Handler` trait requires the
// extracted state to be `Clone + Send + Sync + 'static`, and a derived
// `Clone` on a `<R>`-parameterised wrapper struct requires `R: Clone`
// which `Runtime` doesn't guarantee. Pinning to `Wry` is harmless —
// it's the only runtime we ship, the test runtime never reaches this
// code path.

mod server;
mod toggle;

use toggle::{apply_toggle_in_backend, ensure_toggle_allowed, ToggleError};

static SERVER: Mutex<server::Server> = Mutex::new(server::Server::new());

/// Called at startup or from the blocking config writer. Persistence runs
/// while the server mutex is held, so a status query never sees a half-commit.
pub fn configure(
    app: AppHandle<Wry>,
    config: &AppConfig,
    persist: impl FnOnce() -> Result<(), StorageError>,
) -> Result<(), StorageError> {
    let endpoint = config.http_api_on.then_some(server::Endpoint {
        port: config.http_api_port,
        only_local: config.http_api_only_local,
    });
    let result = SERVER
        .lock()
        .expect("http server mutex poisoned")
        .configure(router(app.clone()), endpoint, persist);
    let _ = app.emit("http_api_status_changed", json!({ "_args": [] }));
    result
}

pub fn status() -> server::Status {
    SERVER.lock().expect("http server mutex poisoned").status()
}

// ---- routes ----------------------------------------------------------------

fn router(app: AppHandle<Wry>) -> Router {
    Router::new()
        .route("/", get(home))
        .route("/remote-test", get(remote_test))
        .route("/api/list", get(api_list))
        .route("/api/toggle", get(api_toggle))
        .route("/api/refresh", get(api_refresh))
        .with_state(AppRouterState { app })
}

#[derive(Clone)]
struct AppRouterState {
    app: AppHandle<Wry>,
}

async fn home() -> &'static str {
    "Hello SwitchHosts!"
}

async fn remote_test() -> String {
    let now = chrono::Local::now().format("%a %b %e %Y %H:%M:%S GMT%z");
    format!("# remote-test\n# {now}")
}

async fn api_list(State(state): State<AppRouterState>) -> Response {
    let app_state = state.app.state::<AppState>();
    match app_state.read_manifest() {
        Ok(manifest) => {
            let flat = flatten_root(&manifest.root);
            Json(json!({ "success": true, "data": flat })).into_response()
        }
        Err(e) => Json(json!({
            "success": false,
            "message": e.to_string(),
        }))
        .into_response(),
    }
}

#[derive(Deserialize)]
struct IdQuery {
    id: Option<String>,
}

async fn api_toggle(State(state): State<AppRouterState>, Query(q): Query<IdQuery>) -> &'static str {
    let Some(id) = q.id else {
        return "bad id.";
    };
    if id.is_empty() {
        return "bad id.";
    }
    log::info!("toggle: {id}");

    // A live main window owns the renderer apply pipeline. With no main
    // window, read and compute the toggle only after acquiring the apply lock.
    if state.app.get_webview_window(MAIN_WINDOW_LABEL).is_some() {
        let app_state = state.app.state::<AppState>();
        if let Err(error) = ensure_toggle_allowed(&app_state.application_recovery) {
            return error.as_body();
        }
        let manifest = match app_state.read_manifest() {
            Ok(m) => m,
            Err(e) => {
                log::warn!("manifest load failed: {e}");
                return "not found.";
            }
        };
        let Some(node) = find_node(&manifest.root, &id) else {
            return "not found.";
        };
        let on = node.get("on").and_then(Value::as_bool).unwrap_or(false);
        let _ = state.app.emit("toggle_item", json!({ "_args": [id, !on] }));
        return "ok";
    }

    // No main window: a Tauri event with no listener is dropped, so the
    // broadcast above would silently do nothing. Apply in the handler
    // instead, reusing the same selection rules the renderer applies.
    match apply_toggle_in_backend(&state.app, &id).await {
        Ok(()) => "ok",
        Err(e) => {
            // A cancelled prompt is a deliberate user action, not a fault;
            // the renderer path stays quiet about it too.
            if matches!(e, ToggleError::Apply(HostsApplyError::Cancelled)) {
                log::info!("toggle cancelled by the user: {id}");
            } else {
                log::warn!("toggle failed for {id}: {e}");
            }
            e.as_body()
        }
    }
}

async fn api_refresh(State(state): State<AppRouterState>, Query(q): Query<IdQuery>) -> Response {
    let Some(id) = q.id.filter(|id| !id.is_empty()) else {
        return Json(bad_id_value()).into_response();
    };
    log::info!("refresh: {id}");

    let app_state = state.app.state::<AppState>();
    // Unlike toggle — which only broadcasts and lets the renderer's
    // apply pipeline hit the usual guards — this handler writes to the
    // data directory itself, so it needs the same backstop the
    // `refresh_remote_hosts` command has: refuse while the data
    // directory is unresolved and the app is sitting on the recovery
    // dialog.
    if let Err(e) = app_state.require_data_dir_usable() {
        let denied = RefreshError::Storage {
            message: e.to_string(),
        };
        return Json(denied.into_renderer_value()).into_response();
    }

    let result = refresh::refresh_one(&state.app, app_state.inner(), &id).await;
    Json(refresh_result_value(result)).into_response()
}

/// Share the command's response shape, including `changed` because HTTP
/// callers cannot listen for `hosts_refreshed`. Partial domain failures
/// carry `success: false` and the committed node in `data`, so callers can
/// distinguish usable cached results from a fully successful refresh.
fn refresh_result_value(result: Result<RefreshOutcome, RefreshError>) -> Value {
    match result {
        Ok(outcome) => outcome.into_renderer_value(),
        Err(e) => e.into_renderer_value(),
    }
}

/// A missing / empty `id` is the caller's mistake, not a lookup miss —
/// keep it distinct from `invalid_id` ("no such node"), the same way
/// toggle separates `bad id.` from `not found.`.
fn bad_id_value() -> Value {
    json!({
        "success": false,
        "code": "bad_id",
        "message": "query parameter `id` is required",
    })
}

// ---- tree helpers ----------------------------------------------------------

fn flatten_root(nodes: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    walk(nodes, &mut out);
    out
}

fn walk(nodes: &[Value], out: &mut Vec<Value>) {
    for node in nodes {
        out.push(node.clone());
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            walk(children, out);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_recovery_rejects_http_toggle_before_any_write() {
        let recovery = crate::hosts_apply::recovery::ApplicationRecovery::default();
        assert!(ensure_toggle_allowed(&recovery).is_ok());
        recovery.record(vec![json!({"id":"a", "on":true})], "applied".into());
        assert!(matches!(
            ensure_toggle_allowed(&recovery),
            Err(ToggleError::RecoveryRequired)
        ));
        assert_eq!(
            ensure_toggle_allowed(&recovery).err().unwrap().as_body(),
            "recovery required."
        );
        recovery.begin();
        assert!(matches!(
            ensure_toggle_allowed(&recovery),
            Err(ToggleError::RecoveryRequired)
        ));
        assert!(recovery.is_pending());
    }

    fn tree_fixture() -> Vec<Value> {
        // root
        // ├── local-1
        // ├── folder-a
        // │   ├── local-2
        // │   └── folder-b
        // │       └── local-3
        // └── local-4
        json!([
            { "id": "local-1", "type": "local", "on": true },
            {
                "id": "folder-a",
                "type": "folder",
                "children": [
                    { "id": "local-2", "type": "local", "on": false },
                    {
                        "id": "folder-b",
                        "type": "folder",
                        "children": [
                            { "id": "local-3", "type": "local", "on": true },
                        ]
                    }
                ]
            },
            { "id": "local-4", "type": "local", "on": false },
        ])
        .as_array()
        .cloned()
        .unwrap()
    }

    #[test]
    fn flatten_root_emits_parents_before_descendants_in_dfs_order() {
        let flat = flatten_root(&tree_fixture());
        let ids: Vec<&str> = flat.iter().filter_map(|n| n.get("id")?.as_str()).collect();
        assert_eq!(
            ids,
            vec!["local-1", "folder-a", "local-2", "folder-b", "local-3", "local-4"]
        );
    }

    #[test]
    fn flatten_root_handles_empty_tree() {
        assert!(flatten_root(&[]).is_empty());
    }

    #[test]
    fn find_node_locates_top_level_id() {
        let n = find_node(&tree_fixture(), "local-4").unwrap();
        assert_eq!(n.get("type").and_then(Value::as_str), Some("local"));
    }

    #[test]
    fn find_node_recurses_into_nested_folders() {
        // Two levels deep — exercises the recursive arm.
        let n = find_node(&tree_fixture(), "local-3").unwrap();
        assert_eq!(n.get("on").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn find_node_returns_none_for_missing_id() {
        assert!(find_node(&tree_fixture(), "does-not-exist").is_none());
    }

    #[test]
    fn find_node_skips_folder_with_non_array_children_field() {
        // A malformed node whose `children` is not an array should not
        // panic and should not be treated as a parent.
        let nodes = json!([
            { "id": "weird", "children": "not-an-array" },
            { "id": "real", "type": "local" },
        ])
        .as_array()
        .cloned()
        .unwrap();
        assert!(find_node(&nodes, "real").is_some());
        assert!(find_node(&nodes, "missing").is_none());
    }

    #[tokio::test]
    async fn home_route_returns_static_greeting() {
        assert_eq!(home().await, "Hello SwitchHosts!");
    }

    #[tokio::test]
    async fn remote_test_route_starts_with_marker_and_carries_timestamp() {
        let body = remote_test().await;
        assert!(
            body.starts_with("# remote-test\n# "),
            "unexpected body prefix: {body:?}"
        );
        // Timestamp must be non-empty (the chrono format string is dynamic).
        let ts = &body["# remote-test\n# ".len()..];
        assert!(!ts.is_empty());
    }

    #[test]
    fn refresh_result_value_distinguishes_updated_from_unchanged() {
        let node = json!({ "id": "remote-1", "type": "remote" });

        let updated = refresh_result_value(Ok(RefreshOutcome::Updated { node: node.clone() }));
        assert_eq!(
            updated,
            json!({ "success": true, "changed": true, "data": node })
        );

        let unchanged = refresh_result_value(Ok(RefreshOutcome::Unchanged { node: node.clone() }));
        assert_eq!(
            unchanged,
            json!({ "success": true, "changed": false, "data": node })
        );
    }

    #[test]
    fn refresh_result_value_passes_error_codes_through() {
        for (err, code) in [
            (RefreshError::InvalidId, "invalid_id"),
            (RefreshError::NotRemote, "not_remote"),
            (RefreshError::NoUrl, "no_url"),
            (
                RefreshError::Fetch {
                    message: "HTTP 502".into(),
                },
                "fetch_failed",
            ),
        ] {
            let v = refresh_result_value(Err(err));
            assert_eq!(v.get("success").and_then(Value::as_bool), Some(false));
            assert_eq!(v.get("code").and_then(Value::as_str), Some(code));
            // The message must survive — Raycast / Alfred show it verbatim.
            assert!(
                v.get("message")
                    .and_then(Value::as_str)
                    .is_some_and(|m| !m.is_empty()),
                "missing message for {code}: {v}"
            );
        }
    }

    #[test]
    fn bad_id_value_is_not_confused_with_a_lookup_miss() {
        let v = bad_id_value();
        assert_eq!(v.get("success").and_then(Value::as_bool), Some(false));
        assert_eq!(v.get("code").and_then(Value::as_str), Some("bad_id"));
        // `invalid_id` is reserved for "the node doesn't exist".
        assert_ne!(v.get("code").and_then(Value::as_str), Some("invalid_id"));
    }
}
