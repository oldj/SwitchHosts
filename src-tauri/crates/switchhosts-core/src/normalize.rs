//! Hosts content normalization.
//!
//! Direct port of `src/common/normalize.ts` and the duplicate-removal
//! pass in `src-tauri/src/hosts_apply/aggregate.rs`.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedLine {
    pub ip: String,
    pub domains: Vec<String>,
    pub comment: String,
}

pub fn parse_line(line: &str) -> ParsedLine {
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

pub fn format_line(ip: &str, domains: &[String], comment: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    parts.push(ip.to_string());
    parts.push(domains.join(" "));
    if !comment.is_empty() {
        parts.push(format!("# {comment}"));
    }
    parts.join(" ").trim().to_string()
}

fn format_comment_only(comment: &str) -> String {
    if comment.is_empty() {
        String::new()
    } else {
        format!("# {comment}")
    }
}

/// Remove duplicate domain records from hosts content.
///
/// `line_ending` should be `"\n"` or `"\r\n"` depending on the target
/// platform (mirrors `os.EOL` in the Node version).
pub fn remove_duplicate_records(content: &str, line_ending: &str) -> String {
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

    new_lines.join(line_ending)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remove_duplicate_marks_repeated_domains() {
        let input = "127.0.0.1 localhost\n127.0.0.1 localhost\n";
        let output = remove_duplicate_records(input, "\n");

        assert!(output.contains("invalid hosts (repeated)"));
        assert_eq!(output.lines().filter(|l| l == "127.0.0.1 localhost").count(), 1);
    }

    #[test]
    fn parse_line_splits_comment() {
        let parsed = parse_line("127.0.0.1 localhost # dev");

        assert_eq!(parsed.ip, "127.0.0.1");
        assert_eq!(parsed.domains, vec!["localhost"]);
        assert_eq!(parsed.comment, "dev");
    }
}
