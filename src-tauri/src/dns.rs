//! Domain-name → IP resolution over DNS-over-HTTPS (JSON API), used by
//! remote hosts entries whose `source` is `"domain"`.
//!
//! The DoH endpoints in the builtin registry are IP-literal so the
//! resolver itself never needs a DNS lookup (no bootstrap problem).
//! Query/response handling follows the Google JSON DoH shape
//! (`Status`, `Answer[].type == 1` for A records). Only IPv4 A records
//! are used; an IPv6-only domain resolves to `DnsError::NoARecord`.

use std::collections::{HashMap, HashSet};
use std::net::Ipv4Addr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct DohProvider {
    /// config id, e.g. "alidns"
    pub id: String,
    /// short display name for UI lists, e.g. "Ali DoH"
    pub name: String,
    /// label used in generated hosts comments, e.g. "Ali DoH (223.5.5.5)"
    pub label: String,
    /// URL template containing "{domain}"
    pub template: String,
    /// Cloudflare's JSON API requires this Accept header
    pub json_header: bool,
}

/// Only allow structured, non-sensitive error categories across the storage
/// boundary. Request URLs, proxy settings, response bodies, and arbitrary
/// transport/parser error strings must never become persisted node metadata.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DnsError {
    Timeout,
    Network,
    HttpStatus(u16),
    Parse,
    BadStatus(i64),
    NoARecord,
    InvalidProvider,
    InvalidTemplate,
}

impl std::fmt::Display for DnsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DnsError::Timeout => write!(f, "DNS query timed out. Please retry."),
            DnsError::Network => {
                write!(
                    f,
                    "DNS network request failed. The DNS service can be changed in Preferences."
                )
            }
            DnsError::HttpStatus(status) => write!(f, "DNS service returned HTTP {status}."),
            DnsError::Parse => write!(f, "DNS service returned an invalid response."),
            DnsError::BadStatus(s) => write!(
                f,
                "DNS server returned status {s}. The DNS service can be changed in Preferences."
            ),
            DnsError::NoARecord => write!(f, "Domain has no IPv4 (A) records."),
            DnsError::InvalidProvider => {
                write!(f, "Unknown DNS provider. Fix it in Preferences.")
            }
            DnsError::InvalidTemplate => write!(
                f,
                "Custom DoH template must be an HTTP(S) URL containing the {{domain}} placeholder."
            ),
        }
    }
}

pub fn builtin_providers() -> Vec<DohProvider> {
    vec![
        DohProvider {
            id: "alidns".into(),
            name: "Ali DoH".into(),
            label: "Ali DoH (223.5.5.5)".into(),
            template: "https://223.5.5.5/resolve?name={domain}&type=A".into(),
            json_header: false,
        },
        DohProvider {
            id: "dnspod".into(),
            name: "DNSPod".into(),
            label: "DNSPod (120.53.53.53)".into(),
            template: "https://120.53.53.53/dns-query?name={domain}&type=A".into(),
            json_header: false,
        },
        DohProvider {
            id: "cloudflare".into(),
            name: "Cloudflare".into(),
            label: "Cloudflare (1.1.1.1)".into(),
            template: "https://1.1.1.1/dns-query?name={domain}&type=A".into(),
            json_header: true,
        },
        DohProvider {
            id: "google".into(),
            name: "Google".into(),
            label: "Google (8.8.8.8)".into(),
            template: "https://8.8.8.8/resolve?name={domain}&type=A".into(),
            json_header: false,
        },
    ]
}

pub fn is_known_provider_id(id: &str) -> bool {
    id == "custom" || builtin_providers().iter().any(|p| p.id == id)
}

pub fn provider_by_id(id: &str, custom_template: &str) -> Result<DohProvider, DnsError> {
    if let Some(p) = builtin_providers().into_iter().find(|p| p.id == id) {
        return Ok(p);
    }
    if id == "custom" {
        let valid_url = reqwest::Url::parse(&custom_template.replace("{domain}", "example.test"))
            .is_ok_and(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some());
        if !custom_template.contains("{domain}") || !valid_url {
            return Err(DnsError::InvalidTemplate);
        }
        return Ok(DohProvider {
            id: "custom".into(),
            name: "Custom".into(),
            label: "Custom DoH".into(),
            template: custom_template.to_string(),
            json_header: false,
        });
    }
    Err(DnsError::InvalidProvider)
}

/// Validate a bare domain name (no scheme, no path). Must stay in sync
/// with `isValidDomain` in `src/common/hostsFn.ts`.
pub fn is_valid_domain(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() || s.len() > 253 {
        return false;
    }
    if s.contains("://") {
        return false;
    }
    if s.chars()
        .any(|c| matches!(c, '/' | ':' | '@' | ' ' | '\t' | '\r' | '\n'))
    {
        return false;
    }
    if s.ends_with('.') {
        return false; // FQDN trailing dot is rejected as-is
    }
    let labels: Vec<&str> = s.split('.').collect();
    if labels.len() < 2 {
        return false;
    }
    for label in &labels {
        if label.is_empty() || label.len() > 63 {
            return false;
        }
        if label.starts_with('-') || label.ends_with('-') {
            return false;
        }
        if !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return false;
        }
    }
    let tld = labels[labels.len() - 1];
    if tld.len() < 2 {
        return false;
    }
    if s.parse::<std::net::IpAddr>().is_ok() {
        return false;
    }
    true
}

pub const MAX_DOH_BYTES: usize = 64 * 1024;
pub const MAX_DOMAINS: usize = 100;
const BATCH_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Deserialize)]
struct DohAnswer {
    #[serde(rename = "type")]
    rtype: u16,
    data: String,
}

#[derive(Deserialize)]
struct DohResponse {
    #[serde(rename = "Status", default)]
    status: i64,
    #[serde(rename = "Answer", default)]
    answer: Vec<DohAnswer>,
}

/// Parse a Google-style DoH JSON body and return IPv4 A records in
/// answer order. `Status != 0`, no A records, or malformed JSON are
/// all errors (no silent fallback).
pub fn parse_doh_a_records(body: &str) -> Result<Vec<Ipv4Addr>, DnsError> {
    let resp: DohResponse = serde_json::from_str(body).map_err(|_| DnsError::Parse)?;
    if resp.status != 0 {
        return Err(DnsError::BadStatus(resp.status));
    }
    let ips: Vec<Ipv4Addr> = resp
        .answer
        .iter()
        .filter(|a| a.rtype == 1)
        .filter_map(|a| a.data.parse::<Ipv4Addr>().ok())
        .collect();
    if ips.is_empty() {
        return Err(DnsError::NoARecord);
    }
    Ok(ips)
}

/// Build the hosts content for a domain-sourced remote entry. First IP
/// is the active line; the rest are commented alternates. The whole
/// content is rebuilt on every refresh (never appended).
///
/// Deliberately timestamp-free: `refresh_one_inner` decides "changed"
/// by comparing the whole file, so a resolve-time line would make
/// every refresh look like an update and rewrite the system hosts
/// even when the IP is unchanged. The refresh time is already
/// recorded on the node as `last_refresh`.
pub fn build_domain_hosts_content(domain: &str, ips: &[Ipv4Addr], provider_label: &str) -> String {
    let mut lines = Vec::with_capacity(ips.len() + 3);
    lines.push(format!("# Source: domain {domain}"));
    lines.push(format!("# Resolved via {provider_label}"));
    lines.push(format!("{} {}", ips[0], domain));
    if ips.len() > 1 {
        lines.push("# Alternate addresses:".to_string());
        for ip in &ips[1..] {
            lines.push(format!("# {ip} {domain}"));
        }
    }
    lines.join("\n") + "\n"
}

/// Resolve `domain` via the provider's DoH JSON endpoint. `client`
/// should come from `http::build_client` so proxy / UA / timeout stay
/// consistent with the remote-hosts fetch path.
pub async fn resolve_domain(
    client: &reqwest::Client,
    provider: &DohProvider,
    domain: &str,
) -> Result<Vec<Ipv4Addr>, DnsError> {
    let url = provider.template.replace("{domain}", domain);
    let mut req = client.get(&url);
    if provider.json_header {
        req = req.header("Accept", "application/dns-json");
    }
    let mut response = req.send().await.map_err(classify_reqwest_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(DnsError::HttpStatus(status.as_u16()));
    }
    // Read bounded chunks here so timeout/network errors remain typed instead
    // of becoming the arbitrary strings used by the general HTTP helper.
    if response
        .content_length()
        .is_some_and(|size| size > MAX_DOH_BYTES as u64)
    {
        return Err(DnsError::Parse);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(classify_reqwest_error)? {
        if chunk.len() > MAX_DOH_BYTES - body.len() {
            return Err(DnsError::Parse);
        }
        body.extend_from_slice(&chunk);
    }
    let body = std::str::from_utf8(&body).map_err(|_| DnsError::Parse)?;
    parse_doh_a_records(body)
}

fn classify_reqwest_error(error: reqwest::Error) -> DnsError {
    if error.is_timeout() {
        DnsError::Timeout
    } else if error.is_builder() {
        DnsError::InvalidTemplate
    } else {
        DnsError::Network
    }
}

/// Share the HTTP client's connection pool, with at most four outstanding
/// queries. Indexing completed tasks restores the user's input order. A hard
/// 60-second deadline covers the whole batch, including domains still queued.
pub async fn resolve_domains(
    client: &reqwest::Client,
    provider: &DohProvider,
    domains: &[String],
) -> Vec<Result<Vec<Ipv4Addr>, DnsError>> {
    resolve_domains_with_timeout(client, provider, domains, BATCH_TIMEOUT).await
}

async fn resolve_domains_with_timeout(
    client: &reqwest::Client,
    provider: &DohProvider,
    domains: &[String],
    timeout: Duration,
) -> Vec<Result<Vec<Ipv4Addr>, DnsError>> {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut pending = tokio::task::JoinSet::new();
    let mut next = 0;
    let mut results: Vec<_> = domains.iter().map(|_| Err(DnsError::Timeout)).collect();
    loop {
        while next < domains.len() && pending.len() < 4 && tokio::time::Instant::now() < deadline {
            let index = next;
            let domain = domains[index].clone();
            let client = client.clone();
            let provider = provider.clone();
            pending
                .spawn(async move { (index, resolve_domain(&client, &provider, &domain).await) });
            next += 1;
        }
        match tokio::time::timeout_at(deadline, pending.join_next()).await {
            Ok(Some(Ok((index, result)))) => results[index] = result,
            Ok(Some(Err(_))) => log::warn!("DNS query task failed"),
            Ok(None) => break,
            Err(_) => {
                pending.abort_all();
                // Finished tasks can already be in the completion queue when
                // the deadline fires. Retain those results, and wait only for
                // cancellation of the remaining HTTP futures, never their I/O.
                while let Some(completed) = pending.join_next().await {
                    if let Ok((index, result)) = completed {
                        results[index] = result;
                    }
                }
                break;
            }
        }
    }
    results
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DomainStatus {
    Resolved,
    Stale,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DomainResult {
    pub domain: String,
    pub ips: Vec<Ipv4Addr>,
    pub status: DomainStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_success: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_success_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Read older single-domain entries as a cache on the first batch refresh.
/// Only IPv4 mapping lines for configured domains are eligible, so a removed
/// domain can never leak back into the regenerated hosts file.
pub fn cached_domain_results(
    snapshot: &Value,
    domains: &[String],
    content: &str,
) -> HashMap<String, DomainResult> {
    let mut cached = HashMap::new();
    if let Some(results) = snapshot.get("domain_results").and_then(Value::as_array) {
        for value in results {
            if let Ok(mut result) = serde_json::from_value::<DomainResult>(value.clone()) {
                result.domain = result.domain.to_ascii_lowercase();
                if domains.contains(&result.domain) && !result.ips.is_empty() {
                    cached.insert(result.domain.clone(), result);
                }
            }
        }
    }
    // Metadata is authoritative once present; do not resurrect an old line
    // that a previous refresh intentionally removed.
    if snapshot.get("domain_results").is_some() {
        return cached;
    }
    // URL subscriptions can contain arbitrary (including commented) hosts
    // mappings. Only migrate the recognizable single-domain generator output;
    // changing a subscription's source must not activate those old comments.
    let mut lines = content.lines();
    let Some(legacy_domain) = lines
        .next()
        .and_then(|line| line.strip_prefix("# Source: domain "))
    else {
        return cached;
    };
    let Some(provider_label) = lines
        .next()
        .and_then(|line| line.strip_prefix("# Resolved via "))
    else {
        return cached;
    };
    if snapshot.get("source").and_then(Value::as_str) != Some("domain")
        || !domains
            .iter()
            .any(|domain| domain.eq_ignore_ascii_case(legacy_domain))
    {
        return cached;
    }
    for line in content.lines() {
        // The old generator writes inactive alternate IPs as comments.
        let mut fields = line.trim().trim_start_matches('#').split_whitespace();
        let Some(ip) = fields.next().and_then(|word| word.parse::<Ipv4Addr>().ok()) else {
            continue;
        };
        for word in fields.take_while(|word| !word.starts_with('#')) {
            let domain = word.to_ascii_lowercase();
            if !domain.eq_ignore_ascii_case(legacy_domain) {
                continue;
            }
            let result = cached
                .entry(domain.clone())
                .or_insert_with(|| DomainResult {
                    domain,
                    ips: Vec::new(),
                    status: DomainStatus::Stale,
                    last_success: snapshot
                        .get("last_refresh")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    last_success_ms: snapshot.get("last_refresh_ms").and_then(Value::as_i64),
                    error: None,
                });
            // The old resolver could return duplicate A records. Preserve
            // their exact sequence until the generated content is verified.
            result.ips.push(ip);
        }
    }
    if let Some(result) = cached.get_mut(&legacy_domain.to_ascii_lowercase()) {
        if build_domain_hosts_content(legacy_domain, &result.ips, provider_label) != content {
            cached.clear();
        } else {
            let mut seen = HashSet::new();
            result.ips.retain(|ip| seen.insert(*ip));
        }
    }
    cached
}

pub fn merge_domain_results(
    domains: &[String],
    attempts: Vec<Result<Vec<Ipv4Addr>, DnsError>>,
    cached: &HashMap<String, DomainResult>,
    stamp: &str,
    now_ms: i64,
) -> Vec<DomainResult> {
    domains
        .iter()
        .zip(attempts)
        .map(|(domain, attempt)| match attempt {
            Ok(ips) if !ips.is_empty() => DomainResult {
                domain: domain.clone(),
                ips,
                status: DomainStatus::Resolved,
                last_success: Some(stamp.into()),
                last_success_ms: Some(now_ms),
                error: None,
            },
            attempt => {
                let error = attempt.err().unwrap_or(DnsError::NoARecord).to_string();
                if let Some(previous) = cached.get(domain).filter(|result| !result.ips.is_empty()) {
                    DomainResult {
                        status: DomainStatus::Stale,
                        error: Some(error),
                        ..previous.clone()
                    }
                } else {
                    DomainResult {
                        domain: domain.clone(),
                        ips: Vec::new(),
                        status: DomainStatus::Failed,
                        last_success: None,
                        last_success_ms: None,
                        error: Some(error),
                    }
                }
            }
        })
        .collect()
}

pub fn domain_refresh_status(results: &[DomainResult]) -> &'static str {
    let resolved = results
        .iter()
        .filter(|result| result.status == DomainStatus::Resolved)
        .count();
    if resolved == 0 {
        "failed"
    } else if resolved == results.len() {
        "complete"
    } else {
        "partial"
    }
}

/// Keep generated content stable when only attempt timestamps or error text
/// change. Those details belong in the manifest, not the system hosts file.
pub fn build_batch_hosts_content(results: &[DomainResult], provider_label: &str) -> String {
    results
        .iter()
        .map(|result| {
            if result.ips.is_empty() {
                format!(
                    "# Source: domain {}\n# No successful IPv4 resolution yet\n",
                    result.domain
                )
            } else {
                let label = if result.status == DomainStatus::Stale {
                    "previous successful lookup (cached)"
                } else {
                    provider_label
                };
                build_domain_hosts_content(&result.domain, &result.ips, label)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn assert_persisted_error_is_safe(error: DnsError, private_parts: &[&str]) {
        let results = merge_domain_results(
            &["example.test".into()],
            vec![Err(error)],
            &HashMap::new(),
            "now",
            100,
        );
        let serialized = serde_json::to_string(&results).unwrap();
        for private in private_parts {
            assert!(
                !serialized.contains(private),
                "private error detail persisted: {serialized}"
            );
        }
    }

    #[test]
    fn configuration_and_parser_errors_do_not_persist_private_values() {
        let private_template = "https://private-doh.test/resolve?token=TEST_PRIVATE_TOKEN";
        assert_persisted_error_is_safe(
            provider_by_id("custom", private_template).unwrap_err(),
            &["TEST_PRIVATE_TOKEN", "private-doh.test", "https://"],
        );
        assert_persisted_error_is_safe(
            provider_by_id("TEST_PRIVATE_PROVIDER", "").unwrap_err(),
            &["TEST_PRIVATE_PROVIDER"],
        );
        assert_persisted_error_is_safe(
            parse_doh_a_records(r#"{"Status":"TEST_PRIVATE_RESPONSE","Answer":[]}"#).unwrap_err(),
            &["TEST_PRIVATE_RESPONSE"],
        );
    }

    #[tokio::test]
    async fn reqwest_network_errors_do_not_persist_request_urls() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            // A real transport failure: close without an HTTP response.
            let (socket, _) = listener.accept().await.unwrap();
            drop(socket);
        });
        let template = format!("http://{address}/resolve?name={{domain}}&token=TEST_PRIVATE_TOKEN");
        let provider = provider_by_id("custom", &template).unwrap();
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let error = resolve_domain(&client, &provider, "example.test")
            .await
            .unwrap_err();
        server.await.unwrap();
        assert_eq!(error, DnsError::Network);
        assert_persisted_error_is_safe(
            error,
            &["TEST_PRIVATE_TOKEN", &address.to_string(), "http://"],
        );
    }

    #[tokio::test]
    async fn local_http_failures_keep_safe_status_parse_and_timeout_categories() {
        use axum::{http::StatusCode, routing::get, Router};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = Router::new()
            .route(
                "/http",
                get(|| async { (StatusCode::BAD_GATEWAY, "TEST_PRIVATE_RESPONSE") }),
            )
            .route(
                "/parse",
                get(|| async { r#"{"Status":"TEST_PRIVATE_RESPONSE"}"# }),
            )
            .route(
                "/oversized",
                get(|| async { "x".repeat(MAX_DOH_BYTES + 1) }),
            )
            .route(
                "/timeout",
                get(|| async {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    "TEST_PRIVATE_RESPONSE"
                }),
            );
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_millis(100))
            .build()
            .unwrap();
        for (path, expected) in [
            ("http", DnsError::HttpStatus(502)),
            ("parse", DnsError::Parse),
            ("oversized", DnsError::Parse),
            ("timeout", DnsError::Timeout),
        ] {
            let provider = provider_by_id(
                "custom",
                &format!("http://{address}/{path}?name={{domain}}&token=TEST_PRIVATE_TOKEN"),
            )
            .unwrap();
            let error = resolve_domain(&client, &provider, "example.test")
                .await
                .unwrap_err();
            assert_eq!(error, expected);
            assert_persisted_error_is_safe(
                error,
                &[
                    "TEST_PRIVATE_TOKEN",
                    "TEST_PRIVATE_RESPONSE",
                    &address.to_string(),
                    "http://",
                ],
            );
        }
        server.abort();
    }

    #[tokio::test]
    async fn response_body_transport_errors_do_not_persist_request_urls() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            socket.read(&mut request).await.unwrap();
            // Truncate a declared body after the response headers succeeded.
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 10000\r\nConnection: close\r\n\r\nTEST_PRIVATE_RESPONSE").await.unwrap();
        });
        let provider = provider_by_id(
            "custom",
            &format!("http://{address}/?name={{domain}}&token=TEST_PRIVATE_TOKEN"),
        )
        .unwrap();
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let error = resolve_domain(&client, &provider, "example.test")
            .await
            .unwrap_err();
        server.await.unwrap();
        assert_eq!(error, DnsError::Network);
        assert_persisted_error_is_safe(
            error,
            &[
                "TEST_PRIVATE_TOKEN",
                "TEST_PRIVATE_RESPONSE",
                &address.to_string(),
                "http://",
            ],
        );
    }

    #[tokio::test]
    async fn batch_deadline_keeps_completed_results_times_out_queue_and_cancels_connections() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let started = Arc::new(AtomicUsize::new(0));
        let cancelled = Arc::new(AtomicUsize::new(0));
        let (started_in_server, cancelled_in_server) = (started.clone(), cancelled.clone());
        let server = tokio::spawn(async move {
            let mut workers = tokio::task::JoinSet::new();
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let started = started_in_server.clone();
                let cancelled = cancelled_in_server.clone();
                workers.spawn(async move {
                    let mut request = Vec::new();
                    let mut byte = [0];
                    while !request.ends_with(b"\r\n\r\n") {
                        socket.read_exact(&mut byte).await.unwrap();
                        request.push(byte[0]);
                    }
                    started.fetch_add(1, Ordering::SeqCst);
                    if String::from_utf8(request).unwrap().contains("name=fast.test") {
                        let body = r#"{"Status":0,"Answer":[{"type":1,"data":"1.2.3.4"}]}"#;
                        let response = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                        socket.write_all(response.as_bytes()).await.unwrap();
                    } else {
                        // No response: closing this connection proves the client
                        // task was cancelled, rather than left running after return.
                        match socket.read(&mut byte).await {
                            Ok(0) | Err(_) => { cancelled.fetch_add(1, Ordering::SeqCst); },
                            Ok(_) => panic!("unexpected additional request bytes"),
                        }
                    }
                });
            }
        });
        let provider =
            provider_by_id("custom", &format!("http://{address}/?name={{domain}}")).unwrap();
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let domains = std::iter::once("fast.test".to_string())
            .chain((1..MAX_DOMAINS).map(|index| format!("slow{index}.test")))
            .collect::<Vec<_>>();
        let start = tokio::time::Instant::now();
        let results = tokio::time::timeout(
            Duration::from_secs(1),
            resolve_domains_with_timeout(&client, &provider, &domains, Duration::from_millis(250)),
        )
        .await
        .expect("the batch must finish before the individual request timeouts");
        assert!(
            start.elapsed() < Duration::from_secs(1),
            "batch exceeded its overall deadline"
        );
        assert_eq!(results.len(), MAX_DOMAINS);
        assert_eq!(results[0], Ok(vec![Ipv4Addr::new(1, 2, 3, 4)]));
        assert!(results[1..]
            .iter()
            .all(|result| *result == Err(DnsError::Timeout)));
        assert_eq!(
            started.load(Ordering::SeqCst),
            5,
            "queued requests must not start after the cutoff"
        );
        tokio::time::timeout(Duration::from_secs(1), async {
            while cancelled.load(Ordering::SeqCst) < 4 {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("outstanding request connections should be closed");
        server.abort();
    }

    #[test]
    fn batch_keeps_only_configured_domains_and_merges_independent_failures() {
        let snapshot = json!({ "source":"domain", "url": "cached.test", "last_refresh": "old stamp", "last_refresh_ms": 100 });
        let domains = vec!["fresh.test".into(), "cached.test".into(), "new.test".into()];
        let cached = cached_domain_results(&snapshot, &domains,
            "# Source: domain cached.test\n# Resolved via Test DoH\n1.2.3.4 cached.test\n# Alternate addresses:\n# 1.2.3.5 cached.test\n");
        assert!(!cached.contains_key("removed.test"));
        let results = merge_domain_results(
            &domains,
            vec![
                Ok(vec!["2.3.4.5".parse().unwrap()]),
                Err(DnsError::BadStatus(2)),
                Err(DnsError::NoARecord),
            ],
            &cached,
            "new stamp",
            200,
        );
        assert_eq!(
            results
                .iter()
                .map(|result| result.status.clone())
                .collect::<Vec<_>>(),
            vec![
                DomainStatus::Resolved,
                DomainStatus::Stale,
                DomainStatus::Failed
            ]
        );
        assert_eq!(results[0].last_success_ms, Some(200));
        assert_eq!(results[1].last_success_ms, Some(100));
        assert_eq!(results[1].ips.len(), 2);
        assert!(results[1].error.is_some());
        assert!(results[2].ips.is_empty());
        assert_eq!(domain_refresh_status(&results), "partial");
        let content = build_batch_hosts_content(&results, "Test DoH");
        assert!(content.contains("2.3.4.5 fresh.test"));
        assert!(content.contains("1.2.3.4 cached.test"));
        assert!(!content.contains("removed.test"));
        assert!(!content.contains("old stamp"));
        assert!(content.find("fresh.test").unwrap() < content.find("cached.test").unwrap());
        assert!(content.find("cached.test").unwrap() < content.find("new.test").unwrap());
    }

    #[test]
    fn successful_retry_clears_errors_and_failed_batches_keep_success_timestamps() {
        let domains = vec!["example.test".into()];
        let cached = cached_domain_results(
            &json!({ "domain_results": [{
            "domain": "example.test", "ips": ["1.2.3.4"], "status": "stale",
            "last_success": "original", "last_success_ms": 100, "error": "timeout"
        }] }),
            &domains,
            "",
        );
        let failed = merge_domain_results(
            &domains,
            vec![Err(DnsError::NoARecord)],
            &cached,
            "later",
            200,
        );
        assert_eq!(domain_refresh_status(&failed), "failed");
        assert_eq!(failed[0].last_success_ms, Some(100));
        let success = merge_domain_results(
            &domains,
            vec![Ok(vec!["5.6.7.8".parse().unwrap()])],
            &cached,
            "later",
            200,
        );
        assert_eq!(domain_refresh_status(&success), "complete");
        assert_eq!(success[0].last_success_ms, Some(200));
        assert!(success[0].error.is_none());
    }

    #[test]
    fn cache_metadata_prevents_resurrecting_removed_old_content() {
        let domains = vec!["example.test".into()];
        let cached = cached_domain_results(
            &json!({"domain_results": []}),
            &domains,
            "1.2.3.4 example.test\n",
        );
        assert!(cached.is_empty());
    }

    #[test]
    fn arbitrary_subscription_content_never_becomes_a_successful_domain_cache() {
        let domains = vec!["example.test".into()];
        let domain_snapshot = json!({"source":"domain"});
        for content in [
            "# 127.0.0.1 example.test\n",
            "127.0.0.1 example.test\n",
            "# Source: domain example.test\n# Resolved via Test DoH\n# 127.0.0.1 example.test\n",
        ] {
            assert!(cached_domain_results(&domain_snapshot, &domains, content).is_empty());
        }
        let generated =
            build_domain_hosts_content("example.test", &["1.2.3.4".parse().unwrap()], "Test DoH");
        assert!(!cached_domain_results(&domain_snapshot, &domains, &generated).is_empty());
        assert!(cached_domain_results(&json!({"source":"url"}), &domains, &generated).is_empty());
        assert!(cached_domain_results(
            &json!({"source":"domain", "domain_results":[]}),
            &domains,
            &generated
        )
        .is_empty());
    }

    #[test]
    fn legacy_duplicate_answers_remain_cached_when_the_first_batch_refresh_fails() {
        let ips = parse_doh_a_records(
            r#"{"Status":0,"Answer":[{"type":1,"data":"1.2.3.4"},{"type":1,"data":"5.6.7.8"},{"type":1,"data":"1.2.3.4"}]}"#,
        )
        .unwrap();
        assert_eq!(ips.len(), 3);
        let old_content = build_domain_hosts_content("example.test", &ips, "Test DoH");
        let domains = vec!["example.test".into()];
        let snapshot = json!({"source":"domain", "url":"example.test", "last_refresh_ms":100});
        let cached = cached_domain_results(&snapshot, &domains, &old_content);
        let results = merge_domain_results(
            &domains,
            vec![Err(DnsError::NoARecord)],
            &cached,
            "later",
            200,
        );
        assert_eq!(results[0].status, DomainStatus::Stale);
        assert_eq!(
            results[0].ips,
            vec![
                "1.2.3.4".parse::<Ipv4Addr>().unwrap(),
                "5.6.7.8".parse::<Ipv4Addr>().unwrap(),
            ]
        );
        assert_eq!(results[0].last_success_ms, Some(100));
        let content = build_batch_hosts_content(&results, "Test DoH");
        assert!(content.contains("\n1.2.3.4 example.test\n"));
        assert_eq!(content.matches("1.2.3.4 example.test").count(), 1);
        assert!(content.contains("# 5.6.7.8 example.test\n"));

        // Accept only the exact old generator output, including its original
        // duplicate sequence; unrelated or disabled mapping lines remain invalid.
        assert!(cached_domain_results(
            &snapshot,
            &domains,
            &format!("{old_content}# subscription comment\n")
        )
        .is_empty());
        assert!(cached_domain_results(
            &snapshot,
            &domains,
            &old_content.replace("\n1.2.3.4 example.test\n", "\n# 1.2.3.4 example.test\n")
        )
        .is_empty());
        assert!(cached_domain_results(&json!({"source":"url"}), &domains, &old_content).is_empty());
    }

    #[tokio::test]
    async fn batch_queries_are_bounded_and_results_preserve_input_order() {
        use std::io::{Read, Write};
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        use std::time::Duration;

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let server_peak = peak.clone();
        let server = std::thread::spawn(move || {
            let mut workers = Vec::new();
            for _ in 0..9 {
                let (mut stream, _) = listener.accept().unwrap();
                let active = active.clone();
                let peak = server_peak.clone();
                workers.push(std::thread::spawn(move || {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(3)))
                        .unwrap();
                    let mut request = Vec::new();
                    let mut byte = [0];
                    while !request.ends_with(b"\r\n\r\n") {
                        stream.read_exact(&mut byte).unwrap();
                        request.push(byte[0]);
                    }
                    let request = String::from_utf8(request).unwrap();
                    let index: usize = request
                        .split("name=d")
                        .nth(1)
                        .unwrap()
                        .split('.')
                        .next()
                        .unwrap()
                        .parse()
                        .unwrap();
                    let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(current, Ordering::SeqCst);
                    // Different response delays force completion order to vary.
                    std::thread::sleep(Duration::from_millis(if index % 4 == 0 {
                        100
                    } else {
                        35
                    }));
                    let body = format!(
                        r#"{{"Status":0,"Answer":[{{"type":1,"data":"10.0.0.{}"}}]}}"#,
                        index + 1
                    );
                    active.fetch_sub(1, Ordering::SeqCst);
                    write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .unwrap();
                }));
            }
            for worker in workers {
                worker.join().unwrap();
            }
        });
        let provider =
            provider_by_id("custom", &format!("http://{address}/?name={{domain}}")).unwrap();
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        let domains = (0..9)
            .map(|index| format!("d{index}.test"))
            .collect::<Vec<_>>();
        let results = resolve_domains(&client, &provider, &domains).await;
        server.join().unwrap();
        assert!((2..=4).contains(&peak.load(Ordering::SeqCst)));
        for (index, result) in results.into_iter().enumerate() {
            assert_eq!(
                result.unwrap(),
                vec![Ipv4Addr::new(10, 0, 0, index as u8 + 1)]
            );
        }
    }

    #[test]
    fn is_valid_domain_accepts_plain_domains() {
        for s in [
            "github.com",
            "a-b.example.co",
            "raw.githubusercontent.com",
            "xn--fiqs8s.example",
            "1.2.3.4.com",
        ] {
            assert!(is_valid_domain(s), "should accept: {s}");
        }
    }

    #[test]
    fn is_valid_domain_rejects_bad_input() {
        let too_long_label = "a".repeat(64);
        let too_long_name = format!("{}.com", "a".repeat(250));
        for s in [
            "",
            "   ",
            "github",
            "github.com.",
            "https://github.com",
            "github.com/x",
            "github.com:443",
            "a..b",
            ".a.com",
            "-a.com",
            "a-.com",
            "192.168.1.1",
            "a b.com",
            too_long_label.as_str(),
            too_long_name.as_str(),
        ] {
            assert!(!is_valid_domain(s), "should reject: {s:?}");
        }
    }

    #[test]
    fn provider_by_id_resolves_builtins_and_custom() {
        let p = provider_by_id("alidns", "").unwrap();
        assert_eq!(p.id, "alidns");
        assert!(p.template.contains("{domain}"));
        assert!(!p.json_header);

        let cf = provider_by_id("cloudflare", "").unwrap();
        assert!(cf.json_header);

        let tpl = "https://doh.example.com/resolve?name={domain}&type=A";
        let cu = provider_by_id("custom", tpl).unwrap();
        assert_eq!(cu.template, tpl);

        assert!(matches!(
            provider_by_id("custom", "https://no-placeholder.example/resolve"),
            Err(DnsError::InvalidTemplate)
        ));
        assert!(matches!(
            provider_by_id("bogus", ""),
            Err(DnsError::InvalidProvider)
        ));
    }

    #[test]
    fn known_provider_ids() {
        assert!(is_known_provider_id("alidns"));
        assert!(is_known_provider_id("custom"));
        assert!(!is_known_provider_id("bogus"));
    }

    use std::net::Ipv4Addr;

    fn ip(s: &str) -> Ipv4Addr {
        s.parse().unwrap()
    }

    #[test]
    fn parse_doh_a_records_filters_type_1_only() {
        let body = r#"{
            "Status": 0,
            "Answer": [
                {"name": "example.com.", "type": 1, "TTL": 60, "data": "93.184.216.34"},
                {"name": "example.com.", "type": 5, "TTL": 60, "data": "ns1.example.com"},
                {"name": "example.com.", "type": 28, "TTL": 60, "data": "2606:2800:220:1:1:1:1:1"},
                {"name": "example.com.", "type": 1, "TTL": 60, "data": "93.184.216.35"}
            ]
        }"#;
        let ips = parse_doh_a_records(body).unwrap();
        assert_eq!(ips, vec![ip("93.184.216.34"), ip("93.184.216.35")]);
    }

    #[test]
    fn parse_doh_a_records_error_paths() {
        assert!(matches!(
            parse_doh_a_records(r#"{"Status":3,"Answer":[]}"#),
            Err(DnsError::BadStatus(3))
        ));
        assert!(matches!(
            parse_doh_a_records(r#"{"Status":0,"Answer":[]}"#),
            Err(DnsError::NoARecord)
        ));
        assert!(matches!(
            parse_doh_a_records("not json"),
            Err(DnsError::Parse)
        ));
        // Answer 里全是非 A 记录 → NoARecord
        assert!(matches!(
            parse_doh_a_records(r#"{"Status":0,"Answer":[{"name":"x.","type":5,"data":"y"}]}"#),
            Err(DnsError::NoARecord)
        ));
    }

    #[test]
    fn build_content_single_ip_golden() {
        let ips = [ip("140.82.112.3")];
        let out = build_domain_hosts_content("github.com", &ips, "Ali DoH (223.5.5.5)");
        assert_eq!(
            out,
            "# Source: domain github.com\n\
             # Resolved via Ali DoH (223.5.5.5)\n\
             140.82.112.3 github.com\n"
        );
    }

    #[test]
    fn build_content_multi_ip_golden() {
        let ips = [ip("140.82.112.3"), ip("20.205.243.166")];
        let out = build_domain_hosts_content("github.com", &ips, "Ali DoH (223.5.5.5)");
        assert_eq!(
            out,
            "# Source: domain github.com\n\
             # Resolved via Ali DoH (223.5.5.5)\n\
             140.82.112.3 github.com\n\
             # Alternate addresses:\n\
             # 20.205.243.166 github.com\n"
        );
    }

    #[tokio::test]
    async fn resolve_domain_queries_template_and_parses_answer() {
        use std::collections::HashMap;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = axum::Router::new().route(
            "/resolve",
            axum::routing::get(
                |axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>| async move {
                    if params.get("name").map(String::as_str) == Some("example.com") {
                        axum::Json(serde_json::json!({
                            "Status": 0,
                            "Answer": [
                                {"name": "example.com.", "type": 1, "TTL": 60, "data": "93.184.216.34"}
                            ]
                        }))
                    } else {
                        axum::Json(serde_json::json!({"Status": 0, "Answer": []}))
                    }
                },
            ),
        );
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        let client = reqwest::Client::new();
        let template = format!("http://{addr}/resolve?name={{domain}}&type=A");
        let provider = provider_by_id("custom", &template).unwrap();
        let ips = resolve_domain(&client, &provider, "example.com")
            .await
            .unwrap();
        assert_eq!(ips, vec![ip("93.184.216.34")]);

        // 模板没有把 name 传成服务端期望的值 → 空 Answer → NoARecord
        assert!(matches!(
            resolve_domain(&client, &provider, "other.com").await,
            Err(DnsError::NoARecord)
        ));
    }
}
