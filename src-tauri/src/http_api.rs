//! Local HTTP API server.
//!
//! Reproduces the four routes the Electron build exposed via Hono on
//! port 50761:
//!
//! | Method | Path           | Body |
//! |--------|----------------|------|
//! | GET    | `/`            | `Hello SwitchHosts!` |
//! | GET    | `/remote-test` | `# remote-test\n# <timestamp>` |
//! | GET    | `/api/list`    | `{success, data: flat_list}` JSON |
//! | GET    | `/api/toggle?id=<id>` | `ok` / `bad id.` / `not found.` |
//!
//! Lifecycle:
//!
//! - `start(app, only_local)` binds to `127.0.0.1:50761` (only_local =
//!   true) or `0.0.0.0:50761` (only_local = false), spawns a tokio
//!   task that runs the axum router, and stores the join handle in a
//!   process-wide `Mutex`. Subsequent `start` calls with the same
//!   `only_local` are no-ops; calls with a different value tear down
//!   and rebind.
//! - `stop()` aborts the join handle and clears the slot.
//! - The bootstrap path in `lib.rs::run` calls `start` once at startup
//!   if `config.http_api_on == true`. The `config_set` /
//!   `config_update` commands call `start` / `stop` whenever the
//!   `http_api_on` or `http_api_only_local` keys change so the server
//!   stays in sync with the renderer's preferences pane without a
//!   restart.
//!
//! Toggle behaviour: matches the Electron implementation byte for
//! byte — the toggle handler emits the `toggle_item` event with the
//! flipped `on` value, and the main window's `onToggleItem` listener
//! handles the actual apply pipeline (including `choice_mode` /
//! folder semantics from `setOnStateOfItem`). The v5 storage plan
//! noted that doing the apply directly inside the HTTP handler would
//! work even when no renderer is alive, but in our build the main
//! window is created at startup and only ever hidden, so the
//! broadcast always reaches a live listener. The simpler port keeps
//! `choice_mode` semantics centralised in one place.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Mutex;

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::storage::{manifest::Manifest, AppState};

// We pin the HTTP API to the default `Wry` runtime instead of staying
// generic over `R: Runtime`. axum's `Handler` trait requires the
// extracted state to be `Clone + Send + Sync + 'static`, and a derived
// `Clone` on a `<R>`-parameterised wrapper struct requires `R: Clone`
// which `Runtime` doesn't guarantee. Pinning to `Wry` is harmless —
// it's the only runtime we ship, the test runtime never reaches this
// code path.

pub const HTTP_API_PORT: u16 = 50761;

struct ServerHandle {
    task: tauri::async_runtime::JoinHandle<()>,
    only_local: bool,
}

static SERVER: Mutex<Option<ServerHandle>> = Mutex::new(None);

/// Start the HTTP server. Idempotent: a second call with the same
/// `only_local` value is a no-op; with a different value the existing
/// server is stopped and a new one is bound.
pub fn start(app: AppHandle<Wry>, only_local: bool) -> Result<(), String> {
    let mut guard = SERVER.lock().expect("http server mutex poisoned");
    if let Some(existing) = guard.as_ref() {
        if existing.only_local == only_local {
            return Ok(());
        }
    }
    if let Some(prev) = guard.take() {
        prev.task.abort();
    }

    let ip = if only_local {
        IpAddr::V4(Ipv4Addr::LOCALHOST)
    } else {
        IpAddr::V4(Ipv4Addr::UNSPECIFIED)
    };
    let addr = SocketAddr::new(ip, HTTP_API_PORT);

    // Bind synchronously so port-conflict errors surface to the caller
    // (and through it the renderer / config-update flow). Doing the
    // bind inside the spawned task would only log the failure while
    // `start()` returned `Ok`, leaving the preferences pane reporting
    // "HTTP API on" against a dead listener and blocking later
    // same-`only_local` calls via the early-return above. The std
    // listener is handed off to tokio inside `serve()`.
    let std_listener =
        std::net::TcpListener::bind(addr).map_err(|e| format!("bind {addr}: {e}"))?;
    std_listener
        .set_nonblocking(true)
        .map_err(|e| format!("set_nonblocking {addr}: {e}"))?;

    let app_for_task = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        if let Err(e) = serve(app_for_task, std_listener).await {
            log::error!("serve error: {e}");
        }
    });

    *guard = Some(ServerHandle { task, only_local });
    log::info!("listening on http://{addr}");
    Ok(())
}

/// Stop the HTTP server if it's running.
pub fn stop() {
    let mut guard = SERVER.lock().expect("http server mutex poisoned");
    if let Some(handle) = guard.take() {
        handle.task.abort();
        log::info!("stopped");
    }
}

// ---- routes ----------------------------------------------------------------

async fn serve(app: AppHandle<Wry>, std_listener: std::net::TcpListener) -> Result<(), String> {
    let router = Router::new()
        .route("/", get(home))
        .route("/remote-test", get(remote_test))
        .route("/api/list", get(api_list))
        .route("/api/toggle", get(api_toggle))
        .with_state(AppRouterState { app });

    let listener = tokio::net::TcpListener::from_std(std_listener)
        .map_err(|e| format!("tokio listener from_std: {e}"))?;
    axum::serve(listener, router)
        .await
        .map_err(|e| e.to_string())
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
    match Manifest::load(&app_state.paths) {
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
struct ToggleQuery {
    id: Option<String>,
}

async fn api_toggle(
    State(state): State<AppRouterState>,
    Query(q): Query<ToggleQuery>,
) -> &'static str {
    let Some(id) = q.id else {
        return "bad id.";
    };
    if id.is_empty() {
        return "bad id.";
    }
    log::info!("toggle: {id}");

    let app_state = state.app.state::<AppState>();
    let manifest = match Manifest::load(&app_state.paths) {
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

    // Mirror Electron: broadcast `toggle_item` so the main window's
    // existing onToggleItem handler runs the full apply pipeline,
    // including choice_mode / folder cascading semantics from
    // `setOnStateOfItem`. The envelope is the same `_args` shape every
    // other Tauri broadcast in this codebase uses.
    let _ = state.app.emit("toggle_item", json!({ "_args": [id, !on] }));
    "ok"
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
}
