//! Listener changes and config persistence form one serialized operation.
//! Call from a blocking thread: stopping waits for the old listener to close.

use std::io;
use std::net::{Ipv4Addr, SocketAddr, TcpListener};

use axum::Router;
use serde::Serialize;

use crate::storage::StorageError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub port: u16,
    pub only_local: bool,
}

impl Endpoint {
    fn address(self) -> SocketAddr {
        SocketAddr::from((
            if self.only_local {
                Ipv4Addr::LOCALHOST
            } else {
                Ipv4Addr::UNSPECIFIED
            },
            self.port,
        ))
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ApiError {
    pub code: &'static str,
    pub port: u16,
    pub reason: String,
}

impl ApiError {
    fn binding(endpoint: Endpoint, error: io::Error) -> Self {
        Self {
            code: match error.kind() {
                io::ErrorKind::AddrInUse => "address_in_use",
                io::ErrorKind::PermissionDenied => "permission_denied",
                _ => "bind_failed",
            },
            port: endpoint.port,
            reason: error.to_string(),
        }
    }

    fn into_storage(self) -> StorageError {
        StorageError::HttpApi {
            code: self.code.into(),
            port: self.port,
            reason: self.reason,
        }
    }
}

#[derive(Serialize)]
pub struct Status {
    pub running: bool,
    pub address: Option<String>,
    pub error: Option<ApiError>,
}

struct Running {
    endpoint: Endpoint,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
pub struct Server {
    running: Option<Running>,
    error: Option<ApiError>,
}

fn bind(endpoint: Endpoint) -> Result<tokio::net::TcpListener, ApiError> {
    let listener =
        TcpListener::bind(endpoint.address()).map_err(|e| ApiError::binding(endpoint, e))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| ApiError::binding(endpoint, e))?;
    let runtime = tauri::async_runtime::handle();
    let _entered = runtime.inner().enter();
    tokio::net::TcpListener::from_std(listener).map_err(|e| ApiError::binding(endpoint, e))
}

impl Server {
    pub const fn new() -> Self {
        Self {
            running: None,
            error: None,
        }
    }

    pub fn status(&self) -> Status {
        let active = self
            .running
            .as_ref()
            .filter(|s| !s.task.inner().is_finished());
        Status {
            running: active.is_some(),
            address: active.map(|s| format!("http://{}", s.endpoint.address())),
            error: if active.is_some() {
                None
            } else {
                self.error.clone().or_else(|| {
                    self.running.as_ref().map(|s| ApiError {
                        code: "serve_failed",
                        port: s.endpoint.port,
                        reason: "HTTP API listener stopped unexpectedly".into(),
                    })
                })
            },
        }
    }

    fn start(&mut self, router: Router, endpoint: Endpoint, listener: tokio::net::TcpListener) {
        let task = tauri::async_runtime::spawn(async move {
            if let Err(error) = axum::serve(listener, router).await {
                log::error!("HTTP API serve error: {error}");
            }
        });
        self.running = Some(Running { endpoint, task });
        self.error = None;
    }

    pub fn stop(&mut self) {
        if let Some(previous) = self.running.take() {
            previous.task.abort();
            // abort() alone does not release the socket synchronously.
            let _ = tauri::async_runtime::block_on(previous.task);
        }
    }

    fn restore(&mut self, router: Router, previous: Option<Endpoint>) {
        if let Some(endpoint) = previous {
            match bind(endpoint) {
                Ok(listener) => self.start(router, endpoint, listener),
                Err(error) => {
                    log::error!("HTTP API rollback failed: {}", error.reason);
                    self.error = Some(error);
                }
            }
        }
    }

    pub fn configure(
        &mut self,
        router: Router,
        desired: Option<Endpoint>,
        persist: impl FnOnce() -> Result<(), StorageError>,
    ) -> Result<(), StorageError> {
        let previous = self
            .running
            .as_ref()
            .filter(|s| !s.task.inner().is_finished())
            .map(|s| s.endpoint);
        if previous.is_none() {
            self.stop();
        }
        if desired == previous {
            persist()?;
            if desired.is_none() {
                self.stop();
            }
            self.error = None;
            return Ok(());
        }

        // Different ports can coexist: reserve the new socket while the old
        // service stays live. Changing scope on the same port overlaps bind
        // addresses, so release first and restore on any failure.
        let release_first = matches!((previous, desired), (Some(a), Some(b)) if a.port == b.port);
        if release_first {
            self.stop();
        }
        let listener = match desired.map(bind).transpose() {
            Ok(listener) => listener,
            Err(error) => {
                if release_first {
                    self.restore(router, previous);
                }
                if !release_first && self.running.is_none() {
                    self.error = Some(error.clone());
                }
                return Err(error.into_storage());
            }
        };

        if let Err(error) = persist() {
            drop(listener);
            if release_first {
                self.restore(router, previous);
            }
            return Err(error);
        }

        self.stop();
        if let (Some(endpoint), Some(listener)) = (desired, listener) {
            self.start(router, endpoint, listener);
        }
        self.error = None;
        Ok(())
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;

    fn router() -> Router {
        Router::new().route("/", get(|| async { "ready" }))
    }

    fn free_endpoint() -> Endpoint {
        let socket = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        Endpoint {
            port: socket.local_addr().unwrap().port(),
            only_local: true,
        }
    }

    fn assert_serving(endpoint: Endpoint) {
        let body = tauri::async_runtime::block_on(async {
            reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .unwrap()
                .get(format!("http://127.0.0.1:{}", endpoint.port))
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap()
        });
        assert_eq!(body, "ready");
    }

    #[test]
    fn custom_port_switch_releases_old_listener_and_is_idempotent() {
        let mut server = Server::new();
        let first = free_endpoint();
        server.configure(router(), Some(first), || Ok(())).unwrap();
        assert_serving(first);
        let next = free_endpoint();
        server
            .configure(router(), Some(next), || {
                assert_serving(first);
                assert!(TcpListener::bind(next.address()).is_err());
                Ok(())
            })
            .unwrap();
        assert_serving(next);
        assert!(TcpListener::bind(first.address()).is_ok());
        server.configure(router(), Some(next), || Ok(())).unwrap();
        assert_serving(next);
        server.configure(router(), None, || Ok(())).unwrap();
        assert!(!server.status().running);
        assert!(TcpListener::bind(next.address()).is_ok());
    }

    #[test]
    fn occupied_port_does_not_persist_or_stop_old_service() {
        let mut server = Server::new();
        let old = free_endpoint();
        server.configure(router(), Some(old), || Ok(())).unwrap();
        let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let target = Endpoint {
            port: occupied.local_addr().unwrap().port(),
            only_local: true,
        };
        let error = server
            .configure(router(), Some(target), || panic!("must not persist"))
            .unwrap_err();
        assert!(matches!(error, StorageError::HttpApi { code, .. } if code == "address_in_use"));
        assert_serving(old);
        assert_eq!(
            server.status().address,
            Some(format!("http://{}", old.address()))
        );
    }

    #[test]
    fn save_failure_releases_prepared_socket_and_keeps_old_service() {
        let mut server = Server::new();
        let old = free_endpoint();
        server.configure(router(), Some(old), || Ok(())).unwrap();
        let next = free_endpoint();
        assert!(server
            .configure(router(), Some(next), || Err(StorageError::Io {
                path: "config.json".into(),
                reason: "disk full".into(),
            }))
            .is_err());
        assert_serving(old);
        assert!(TcpListener::bind(next.address()).is_ok());
        // A failed disable must also leave the old service alive.
        assert!(server
            .configure(router(), None, || Err(StorageError::Io {
                path: "config.json".into(),
                reason: "disk full".into(),
            }))
            .is_err());
        assert_serving(old);
    }

    #[test]
    fn changing_scope_on_same_port_waits_for_close_and_rolls_back_save_failure() {
        let mut server = Server::new();
        let local = free_endpoint();
        let public = Endpoint {
            only_local: false,
            ..local
        };
        server.configure(router(), Some(local), || Ok(())).unwrap();
        server.configure(router(), Some(public), || Ok(())).unwrap();
        assert_serving(public);
        assert!(server
            .configure(router(), Some(local), || Err(StorageError::Io {
                path: "config.json".into(),
                reason: "disk full".into(),
            }))
            .is_err());
        assert_eq!(
            server.status().address,
            Some(format!("http://{}", public.address()))
        );
        assert_serving(public);
        server.configure(router(), Some(local), || Ok(())).unwrap();
        assert_serving(local);
    }

    #[test]
    fn startup_conflict_is_visible_and_can_be_retried() {
        let mut server = Server::new();
        let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = Endpoint {
            port: occupied.local_addr().unwrap().port(),
            only_local: true,
        };
        assert!(server
            .configure(router(), Some(endpoint), || Ok(()))
            .is_err());
        assert!(!server.status().running);
        assert_eq!(server.status().error.unwrap().code, "address_in_use");
        drop(occupied);
        server
            .configure(router(), Some(endpoint), || Ok(()))
            .unwrap();
        assert_serving(endpoint);
        assert!(server.status().error.is_none());
    }

    #[test]
    fn changing_scope_with_a_keep_alive_client_can_rebind_the_port() {
        let mut server = Server::new();
        let local = free_endpoint();
        let public = Endpoint {
            only_local: false,
            ..local
        };
        server.configure(router(), Some(public), || Ok(())).unwrap();
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        tauri::async_runtime::block_on(async {
            client
                .get(format!("http://127.0.0.1:{}", local.port))
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
        });
        server.configure(router(), Some(local), || Ok(())).unwrap();
        assert_serving(local);
    }

    #[test]
    fn permission_errors_have_a_distinct_code() {
        let error = ApiError::binding(
            free_endpoint(),
            io::Error::from(io::ErrorKind::PermissionDenied),
        );
        assert_eq!(error.code, "permission_denied");
    }
}
