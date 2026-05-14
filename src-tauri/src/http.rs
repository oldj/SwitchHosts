//! Shared `reqwest::Client` builder that honours the user's proxy +
//! User-Agent settings.
//!
//! Used by both the remote-hosts refresh path (`refresh::refresh_one`)
//! and the URL-import path (`commands::import_data_from_url`). Keeping
//! the construction in one place means a future tweak — adding TLS
//! options, request signing, retries — only has to land here once,
//! and clears implementation-notes D8 ("`import_data_from_url` does
//! not honour proxy config").

use std::time::Duration;

use crate::storage::{AppConfig, AppState};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
pub const MAX_REMOTE_HOSTS_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_IMPORT_BACKUP_BYTES: usize = 64 * 1024 * 1024;
const USER_AGENT: &str = concat!(
    "SwitchHosts/",
    env!("SWH_VERSION"),
    " (Tauri; ",
    env!("CARGO_PKG_NAME"),
    ")"
);

/// Build a fresh `reqwest::Client` configured with:
///
/// - 30s connect+read timeout (matches the Electron `axios` default)
/// - SwitchHosts user agent string
/// - HTTP proxy from `use_proxy` / `proxy_protocol` / `proxy_host` /
///   `proxy_port` config when `use_proxy == true`
///
/// Returns a `String` error so commands can convert it to whatever
/// renderer-facing shape they need.
pub fn build_client(state: &AppState) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .user_agent(USER_AGENT);

    let proxy_url = configured_proxy_url_from_state(state);

    if let Some(proxy_url) = proxy_url {
        let proxy = reqwest::Proxy::all(&proxy_url)
            .map_err(|e| format!("invalid proxy {proxy_url}: {e}"))?;
        builder = builder.proxy(proxy);
    }

    builder.build().map_err(|e| e.to_string())
}

pub async fn response_text_with_limit(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<String, String> {
    let body = response_bytes_with_limit(response, max_bytes).await?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

pub async fn response_bytes_with_limit(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    if let Some(content_length) = response.content_length() {
        if content_length > max_bytes as u64 {
            return Err(size_limit_message(content_length, max_bytes));
        }
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        extend_body_with_limit(&mut body, &chunk, max_bytes)?;
    }

    Ok(body)
}

pub fn read_text_file_with_limit(
    path: &std::path::Path,
    max_bytes: usize,
) -> Result<String, String> {
    let body = read_file_with_limit(path, max_bytes)?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

pub fn read_file_with_limit(path: &std::path::Path, max_bytes: usize) -> Result<Vec<u8>, String> {
    use std::io::Read;

    let metadata = std::fs::metadata(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    if metadata.len() > max_bytes as u64 {
        return Err(size_limit_message(metadata.len(), max_bytes));
    }

    let file = std::fs::File::open(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let mut limited = file.take(max_bytes as u64 + 1);
    let mut body = Vec::new();
    limited
        .read_to_end(&mut body)
        .map_err(|e| format!("read {}: {e}", path.display()))?;

    if body.len() > max_bytes {
        return Err(size_limit_message(body.len() as u64, max_bytes));
    }

    Ok(body)
}

fn size_limit_message(actual_bytes: u64, max_bytes: usize) -> String {
    format!("response body too large: {actual_bytes} bytes exceeds limit of {max_bytes} bytes")
}

fn extend_body_with_limit(
    body: &mut Vec<u8>,
    chunk: &[u8],
    max_bytes: usize,
) -> Result<(), String> {
    let next_len = body
        .len()
        .checked_add(chunk.len())
        .ok_or_else(|| size_limit_message(u64::MAX, max_bytes))?;
    if next_len > max_bytes {
        return Err(size_limit_message(next_len as u64, max_bytes));
    }
    body.extend_from_slice(chunk);
    Ok(())
}

pub(crate) fn configured_proxy_url_from_state(state: &AppState) -> Option<String> {
    let cfg = state.config.lock().expect("config mutex poisoned");
    configured_proxy_url(&cfg)
}

pub(crate) fn configured_proxy_url(cfg: &AppConfig) -> Option<String> {
    let host = cfg.proxy_host.trim();
    if !cfg.use_proxy || host.is_empty() || cfg.proxy_port == 0 {
        return None;
    }

    Some(format!(
        "{}://{}:{}",
        cfg.proxy_protocol, host, cfg.proxy_port
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_proxy_url_supports_known_protocols() {
        for (protocol, expected) in [
            ("http", "http://127.0.0.1:1080"),
            ("https", "https://127.0.0.1:1080"),
            ("socks5", "socks5://127.0.0.1:1080"),
        ] {
            let cfg = AppConfig {
                use_proxy: true,
                proxy_protocol: protocol.into(),
                proxy_host: " 127.0.0.1 ".into(),
                proxy_port: 1080,
                ..AppConfig::default()
            };

            assert_eq!(configured_proxy_url(&cfg).as_deref(), Some(expected));
        }
    }

    #[test]
    fn configured_proxy_url_skips_incomplete_settings() {
        let cases = [
            AppConfig {
                use_proxy: false,
                proxy_protocol: "http".into(),
                proxy_host: "127.0.0.1".into(),
                proxy_port: 1080,
                ..AppConfig::default()
            },
            AppConfig {
                use_proxy: true,
                proxy_protocol: "http".into(),
                proxy_host: String::new(),
                proxy_port: 1080,
                ..AppConfig::default()
            },
            AppConfig {
                use_proxy: true,
                proxy_protocol: "http".into(),
                proxy_host: "127.0.0.1".into(),
                proxy_port: 0,
                ..AppConfig::default()
            },
        ];

        for cfg in cases {
            assert_eq!(configured_proxy_url(&cfg), None);
        }
    }

    /// Guards the feature-unification trick declared in Cargo.toml: if the
    /// `reqwest_013` dep is removed or stripped of its `socks` feature, this
    /// assertion fails — and so would SOCKS5 support inside
    /// `tauri-plugin-updater`, which uses the same transitive reqwest 0.13.
    #[test]
    fn socks_feature_unified_into_updater_reqwest() {
        let proxy = reqwest_013::Proxy::all("socks5://127.0.0.1:1080");

        assert!(proxy.is_ok());
    }

    #[test]
    fn extend_body_with_limit_rejects_oversized_chunked_body() {
        let mut body = Vec::new();
        extend_body_with_limit(&mut body, b"abc", 5).unwrap();

        let err = extend_body_with_limit(&mut body, b"def", 5).unwrap_err();

        assert!(err.contains("response body too large"));
        assert_eq!(body, b"abc");
    }

    #[test]
    fn extend_body_with_limit_accepts_body_at_limit() {
        let mut body = Vec::new();
        extend_body_with_limit(&mut body, b"abc", 5).unwrap();
        extend_body_with_limit(&mut body, b"de", 5).unwrap();

        assert_eq!(body, b"abcde");
    }

    #[test]
    fn read_text_file_with_limit_rejects_oversized_files() {
        let path = std::env::temp_dir().join(format!(
            "switchhosts-limited-read-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&path, b"abcdef").unwrap();

        let err = read_text_file_with_limit(&path, 5).unwrap_err();

        assert!(err.contains("response body too large"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn read_text_file_with_limit_accepts_files_at_limit() {
        let path = std::env::temp_dir().join(format!(
            "switchhosts-limited-read-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&path, b"abcde").unwrap();

        let text = read_text_file_with_limit(&path, 5).unwrap();

        assert_eq!(text, "abcde");
        let _ = std::fs::remove_file(path);
    }
}
