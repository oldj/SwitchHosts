//! Resolve selected sources, including references from enabled groups.
//! Group references are evaluated from the current manifest and entry files;
//! their own `on` flags do not affect an enabled group's content. Folders keep
//! the existing selection semantics (their children's flags select sources).

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::storage::{entries, error::StorageError, paths::V5Paths};

fn flatten<'a>(nodes: &'a [Value], out: &mut Vec<&'a Value>) {
    for node in nodes {
        out.push(node);
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            flatten(children, out);
        }
    }
}

/// Ordered, unique leaf sources used by the selected configuration. Shared
/// by aggregation and change detection so disabled group members still sync.
pub(crate) fn selected_source_ids(list: &[Value]) -> Vec<String> {
    source_ids(list, None)
}

fn source_ids(list: &[Value], target: Option<&str>) -> Vec<String> {
    let mut nodes = Vec::new();
    flatten(list, &mut nodes);
    let by_id: HashMap<&str, &Value> = nodes
        .iter()
        .filter_map(|node| node.get("id").and_then(Value::as_str).map(|id| (id, *node)))
        .collect();
    let mut visited = HashSet::new();
    let mut ids = Vec::new();
    fn visit<'a>(
        id: &'a str,
        by_id: &HashMap<&'a str, &'a Value>,
        visited: &mut HashSet<&'a str>,
        ids: &mut Vec<String>,
    ) {
        if !visited.insert(id) {
            return;
        }
        let Some(node) = by_id.get(id) else {
            return;
        };
        if id == "0" || node.get("is_sys").and_then(Value::as_bool) == Some(true) {
            return;
        }
        match node.get("type").and_then(Value::as_str).unwrap_or("local") {
            "group" => {
                if let Some(include) = node.get("include").and_then(Value::as_array) {
                    for id in include.iter().filter_map(Value::as_str) {
                        visit(id, by_id, visited, ids);
                    }
                }
            }
            "local" | "remote" => ids.push(id.to_string()),
            _ => {}
        }
    }
    if let Some(target) = target {
        if let Some((id, _)) = by_id.get_key_value(target) {
            visit(id, &by_id, &mut visited, &mut ids);
        }
    } else {
        for node in nodes {
            if node.get("on").and_then(Value::as_bool).unwrap_or(false) {
                if let Some(id) = node.get("id").and_then(Value::as_str) {
                    visit(id, &by_id, &mut visited, &mut ids);
                }
            }
        }
    }
    ids
}

pub fn aggregate_selected_content(
    list: &[Value],
    paths: &V5Paths,
    remove_duplicate_records: bool,
) -> Result<String, StorageError> {
    let mut content = read_sources(&selected_source_ids(list), paths, true)?;
    if remove_duplicate_records {
        content = remove_duplicate_records_pass(&content);
    }
    Ok(content)
}

/// Read a group's live sources for previews, without changing member switches.
pub(crate) fn group_content(
    list: &[Value],
    id: &str,
    paths: &V5Paths,
) -> Result<String, StorageError> {
    read_sources(&source_ids(list, Some(id)), paths, false)
}

fn read_sources(ids: &[String], paths: &V5Paths, normalize: bool) -> Result<String, StorageError> {
    ids.iter()
        .map(|id| {
            let content = entries::read_entry(&paths.entries_dir, id)?;
            Ok(if normalize {
                crate::hosts_text::normalize(&content)
            } else {
                content
            })
        })
        .collect::<Result<Vec<_>, StorageError>>()
        .map(|chunks| chunks.join("\n\n"))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_resolve_disabled_sources_once_in_reference_order_and_break_cycles() {
        let list = vec![
            serde_json::json!({"id":"folder", "type":"folder", "children":[
                {"id":"a", "type":"local", "on":false},
                {"id":"b", "type":"remote", "on":false}
            ]}),
            serde_json::json!({"id":"g", "type":"group", "on":true, "include":["b","a","nested","missing","0"]}),
            serde_json::json!({"id":"nested", "type":"group", "include":["g","a"]}),
            serde_json::json!({"id":"0", "is_sys":true, "on":true}),
            serde_json::json!({"id":"unused", "type":"local", "on":false}),
        ];
        assert_eq!(selected_source_ids(&list), ["b", "a"]);
        assert_eq!(source_ids(&list, Some("g")), ["b", "a"]);
        let mut disabled = list.clone();
        disabled[1]["on"] = serde_json::json!(false);
        assert!(selected_source_ids(&disabled).is_empty());
        disabled[0]["children"][0]["on"] = serde_json::json!(true);
        assert_eq!(selected_source_ids(&disabled), ["a"]);
    }

    #[test]
    fn bom_is_removed_from_each_source_before_joining_and_deduplication() {
        let root = std::env::temp_dir().join(format!("swh-bom-aggregate-{}", std::process::id()));
        let paths = V5Paths::under(root.clone());
        paths.ensure_dirs().unwrap();
        // Simulate existing/imported entries, bypassing write_entry normalization.
        std::fs::write(
            paths.entries_dir.join("a.hosts"),
            "\u{feff}192.0.2.1 a.test\r\n",
        )
        .unwrap();
        std::fs::write(
            paths.entries_dir.join("b.hosts"),
            "\u{feff}192.0.2.2 a.test b.test\r\n",
        )
        .unwrap();
        let list = vec![
            serde_json::json!({"id":"a", "on":true}),
            serde_json::json!({"id":"b", "on":true}),
        ];
        for dedup in [false, true] {
            let content = aggregate_selected_content(&list, &paths, dedup).unwrap();
            assert!(!content.contains('\u{feff}'));
            assert!(content.contains("192.0.2.1 a.test"));
            assert!(content.contains(if dedup {
                "192.0.2.2 b.test"
            } else {
                "192.0.2.2 a.test b.test"
            }));
        }
        // Applying must not silently change the source that is still open in
        // an editor, including its invisible BOM and the resulting offsets.
        assert_eq!(
            entries::read_entry(&paths.entries_dir, "a").unwrap(),
            "\u{feff}192.0.2.1 a.test\n"
        );
        assert_eq!(
            std::fs::read_to_string(paths.entries_dir.join("a.hosts")).unwrap(),
            "\u{feff}192.0.2.1 a.test\r\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
