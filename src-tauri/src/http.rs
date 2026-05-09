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
}
