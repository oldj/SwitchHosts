//! Selected-content aggregation.
//!
//! Mirrors `src/main/actions/list/getContentOfList.ts` from the
//! Electron build:
//!
//! 1. Recursively flatten the manifest tree.
//! 2. Keep nodes whose `on` flag is true.
//! 3. For each kept node, read its `entries/<id>.hosts` file (system
//!    nodes and folder/group nodes contribute empty content).
//! 4. Join with `"\n\n"`.
//! 5. If `remove_duplicate_records` is enabled, run the same
//!    domain/IP dedup pass `src/common/normalize.ts` does.
//!
//! Group/folder semantics: the renderer is responsible for propagating
//! `on` to a folder's children before calling apply (see
//! `setOnStateOfItem` in `src/common/hostsFn.ts`). We mirror Electron's
//! aggregation step exactly, so any changes to that propagation logic
//! land naturally without touching the Rust side.
//!
//! System nodes (`isSys === true`) have no `entries/<id>.hosts` file —
//! `entries::read_entry` returns empty for missing files, so they
//! gracefully contribute nothing. The system file itself is the
//! destination, not a source.

use serde_json::Value;

use crate::storage::{entries, error::StorageError, paths::V5Paths};

/// Aggregate the content of every selected node in `list`, returning
/// the final string the renderer wants to write to `/etc/hosts`.
///
/// `list` is the manifest root in renderer-facing legacy shape (the
/// same shape `get_list` returns to the front end).
pub fn aggregate_selected_content(
    list: &[Value],
    paths: &V5Paths,
    remove_duplicate_records: bool,
) -> Result<String, StorageError> {
    let mut chunks: Vec<String> = Vec::new();
    collect_selected(list, paths, &mut chunks)?;
    let mut content = chunks.join("\n\n");
    if remove_duplicate_records {
        content = remove_duplicate_records_pass(&content);
    }
    Ok(content)
}

fn collect_selected(
    nodes: &[Value],
    paths: &V5Paths,
    out: &mut Vec<String>,
) -> Result<(), StorageError> {
    for node in nodes {
        if is_on(node) {
            if let Some(id) = node.get("id").and_then(Value::as_str) {
                let content = entries::read_entry(&paths.entries_dir, id)?;
                out.push(content);
            }
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            collect_selected(children, paths, out)?;
        }
    }
    Ok(())
}

fn is_on(node: &Value) -> bool {
    node.get("on").and_then(Value::as_bool).unwrap_or(false)
}

// ---- duplicate-record removal ---------------------------------------------
//
// Direct port of `removeDuplicateRecords` in `src/common/normalize.ts`.
// Behavioural notes carried over verbatim so the renderer's preview
// (which still runs the JS version when reachable) and the Tauri-side
// apply produce identical output:
//
// - Lines that don't parse into ip + at least one domain are passed
//   through unchanged.
// - IPv4 and IPv6 addresses occupy independent namespaces — the same
//   domain pointing at both is not a duplicate.
// - For each duplicate domain set, an `# invalid hosts (repeated): ...`
//   marker line is appended right after the surviving line.
// - Output line endings follow the *current* platform, mirroring
//   `os.EOL` in the Node version. The privileged-write step in P2.E.2
//   re-normalises this to the system hosts file's preferred ending.

struct ParsedLine {
    ip: String,
    domains: Vec<String>,
    comment: String,
}

fn parse_line(line: &str) -> ParsedLine {
    let (cnt, comment) = match line.split_once('#') {
        Some((before, after)) => (before, after.trim().to_string()),
        None => (line, String::new()),
    };
    let normalized: String = cnt.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    let mut parts = normalized.split(' ').filter(|s| !s.is_empty());
    let ip = parts.next().unwrap_or("").to_string();
    let domains: Vec<String> = parts.map(|s| s.to_string()).collect();
    ParsedLine {
        ip,
        domains,
        comment,
    }
}

fn format_line(ip: &str, domains: &[String], comment: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    parts.push(ip.to_string());
    parts.push(domains.join(" "));
    if !comment.is_empty() {
        parts.push(format!("# {comment}"));
    }
    parts.join(" ").trim().to_string()
}

fn format_comment_only(comment: &str) -> String {
    // Mirrors `formatLine({ comment })` — empty ip and empty domains.
    if comment.is_empty() {
        String::new()
    } else {
        format!("# {comment}")
    }
}

fn remove_duplicate_records_pass(content: &str) -> String {
    use std::collections::HashSet;

    let mut seen: HashSet<String> = HashSet::new();
    let mut new_lines: Vec<String> = Vec::new();

    for line in content.split('\n') {
        let parsed = parse_line(line);
        if parsed.ip.is_empty() || parsed.domains.is_empty() {
            new_lines.push(line.to_string());
            continue;
        }
        let ipv = if parsed.ip.contains(':') { 6 } else { 4 };

        let mut new_domains: Vec<String> = Vec::new();
        let mut duplicate_domains: Vec<String> = Vec::new();
        for domain in &parsed.domains {
            let key = format!("{domain}_{ipv}");
            if seen.contains(&key) {
                duplicate_domains.push(domain.clone());
            } else {
                seen.insert(key);
                new_domains.push(domain.clone());
            }
        }

        if !new_domains.is_empty() {
            new_lines.push(format_line(&parsed.ip, &new_domains, &parsed.comment));
        }
        if !duplicate_domains.is_empty() {
            let inner = format_line(&parsed.ip, &duplicate_domains, "");
            let comment = format!("invalid hosts (repeated): {inner}");
            new_lines.push(format_comment_only(&comment));
        }
    }

    new_lines.join(line_ending())
}

#[cfg(target_os = "windows")]
fn line_ending() -> &'static str {
    "\r\n"
}

#[cfg(not(target_os = "windows"))]
fn line_ending() -> &'static str {
    "\n"
}
