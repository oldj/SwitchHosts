//! System hosts write orchestration.
//!
//! Mirrors the Electron `setSystemHosts` flow in
//! [src/main/actions/hosts/setSystemHosts.ts]:
//!
//! 1. Normalize line endings to LF in memory.
//! 2. If `write_mode == "append"`, splice the new content into the
//!    section delimited by the `# --- SWITCHHOSTS_CONTENT_START ---` /
//!    `# --- SWITCHHOSTS_CONTENT_END ---` markers, preserving whatever
//!    other tools appended after the END marker. Legacy files written
//!    before the END marker existed are treated as owning everything
//!    from START to EOF (the pre-END behaviour) and gain the END marker
//!    on rewrite.
//! 3. Convert to platform-native line endings for the on-disk content.
//! 4. Read the current system hosts file. If the new payload is
//!    byte-identical (compared via stable hash), short-circuit with
//!    success — avoids triggering an OS auth prompt for a no-op.
//! 5. Try a direct write. On `PermissionDenied`, fall through to the
//!    elevation helper. The renderer's password dialog flow is
//!    deliberately *not* invoked: we let the OS prompt the user.
//! 6. On success, return both the previous and the new content so the
//!    calling command can append two history entries (matches Electron).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

// Serialize our read/write pairs, including compensation, across app entry points.
static SYSTEM_WRITE_LOCK: Mutex<()> = Mutex::new(());

use super::elevation::write_privileged;
use super::error::HostsApplyError;

const CONTENT_START_MARKER: &str = "# --- SWITCHHOSTS_CONTENT_START ---";
const CONTENT_END_MARKER: &str = "# --- SWITCHHOSTS_CONTENT_END ---";

#[cfg(not(target_os = "windows"))]
const UNIX_SYSTEM_HOSTS_PATH: &str = "/etc/hosts";

pub struct ApplyOutcome {
    pub previous_content: String,
    pub new_content: String,
    /// True when the file was already up-to-date and no write happened.
    /// Renderer-visible result is still success in that case, but the
    /// caller can skip recording redundant history entries.
    pub unchanged: bool,
}

/// Write `aggregated_content` to the system hosts file using the
/// configured `write_mode`. Returns the previous + new content on
/// success so the caller can persist apply history.
pub fn apply_to_system_hosts(
    aggregated_content: &str,
    write_mode: &str,
) -> Result<ApplyOutcome, HostsApplyError> {
    let _guard = SYSTEM_WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let target = system_hosts_path()?;
    apply_at(&target, aggregated_content, write_mode)
}

fn apply_at(
    target: &Path,
    aggregated_content: &str,
    write_mode: &str,
) -> Result<ApplyOutcome, HostsApplyError> {
    let content_lf = normalize_line_endings(aggregated_content);

    // Compensation needs a trustworthy pre-write snapshot. An unreadable file
    // must not be mistaken for an empty file and later "restored" to empty.
    let previous_raw = read_system_hosts(target)?;
    let previous_lf = normalize_line_endings(&previous_raw);

    let final_content_lf = if write_mode == "append" {
        make_append_content(&previous_lf, &content_lf)
    } else {
        content_lf.clone()
    };

    let disk_content = restore_line_endings(&final_content_lf);

    if hash_str(&previous_raw) == hash_str(&disk_content) {
        return Ok(ApplyOutcome {
            previous_content: previous_lf,
            new_content: final_content_lf,
            unchanged: true,
        });
    }

    match std::fs::write(target, disk_content.as_bytes()) {
        Ok(()) => Ok(ApplyOutcome {
            previous_content: previous_lf,
            new_content: final_content_lf,
            unchanged: false,
        }),
        Err(e) if is_permission_denied(&e) => {
            // Prefer the silent macOS helper; falls back to OS-native
            // elevation (AEWP / pkexec / UAC) for any other platform or
            // when the helper isn't available.
            write_privileged(target, &disk_content)?;
            Ok(ApplyOutcome {
                previous_content: previous_lf,
                new_content: final_content_lf,
                unchanged: false,
            })
        }
        Err(e) => Err(HostsApplyError::Io {
            message: format!("write {}: {e}", target.display()),
        }),
    }
}

/// Restore the exact pre-apply file only while our write is still current.
pub fn restore_system_hosts(previous: &str, expected: &str) -> Result<(), HostsApplyError> {
    let _guard = SYSTEM_WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    restore_at(&system_hosts_path()?, previous, expected)
}

fn restore_at(target: &Path, previous: &str, expected: &str) -> Result<(), HostsApplyError> {
    let current = read_system_hosts(target)?;
    if normalize_line_endings(&current) != normalize_line_endings(expected) {
        return Err(HostsApplyError::Io {
            message: "System hosts changed after applying; refusing to overwrite newer content"
                .into(),
        });
    }
    let content = restore_line_endings(&normalize_line_endings(previous));
    if current == content {
        return Ok(());
    }
    match std::fs::write(target, content.as_bytes()) {
        Ok(()) => Ok(()),
        Err(e) if is_permission_denied(&e) => write_privileged(target, &content),
        Err(e) => Err(HostsApplyError::Io {
            message: format!("restore {}: {e}", target.display()),
        }),
    }
}

fn read_system_hosts(target: &Path) -> Result<String, HostsApplyError> {
    match std::fs::read_to_string(target) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(HostsApplyError::Io {
            message: format!("read {}: {e}", target.display()),
        }),
    }
}

fn is_permission_denied(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::PermissionDenied
}

pub fn system_hosts_path() -> Result<PathBuf, HostsApplyError> {
    #[cfg(target_os = "windows")]
    {
        windows_system_hosts_path()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(PathBuf::from(UNIX_SYSTEM_HOSTS_PATH))
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn windows_system_hosts_path() -> Result<PathBuf, HostsApplyError> {
    Ok(windows_hosts_path_from_windows_dir(&system_windows_dir()?))
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn windows_hosts_path_from_windows_dir(windows_dir: &Path) -> PathBuf {
    normalized_windows_dir_for_join(windows_dir)
        .join("System32")
        .join("drivers")
        .join("etc")
        .join("hosts")
}

#[cfg(any(target_os = "windows", test))]
fn normalized_windows_dir_for_join(windows_dir: &Path) -> PathBuf {
    let rendered = windows_dir.as_os_str().to_string_lossy();
    let bytes = rendered.as_bytes();

    if bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        PathBuf::from(format!("{rendered}\\"))
    } else {
        windows_dir.to_path_buf()
    }
}

#[cfg(target_os = "windows")]
fn system_windows_dir() -> Result<PathBuf, HostsApplyError> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::SystemInformation::GetSystemWindowsDirectoryW;

    let mut buf = vec![0u16; 260];
    loop {
        let len = unsafe { GetSystemWindowsDirectoryW(buf.as_mut_ptr(), buf.len() as u32) };
        if len == 0 {
            return Err(HostsApplyError::Io {
                message: "GetSystemWindowsDirectoryW failed".to_string(),
            });
        }

        let len = len as usize;
        if len < buf.len() {
            buf.truncate(len);
            return Ok(PathBuf::from(OsString::from_wide(&buf)));
        }

        buf.resize(len + 1, 0);
    }
}

// ---- line ending normalisation ---------------------------------------------

fn normalize_line_endings(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}

#[cfg(target_os = "windows")]
fn restore_line_endings(s: &str) -> String {
    s.replace('\n', "\r\n")
}

#[cfg(not(target_os = "windows"))]
fn restore_line_endings(s: &str) -> String {
    s.to_string()
}

// ---- append-mode helper ----------------------------------------------------

/// Rebuild the hosts file around the SwitchHosts-managed section.
///
/// Layout: `head` (everything before START, untouched) + the managed
/// section wrapped in START/END markers + `tail` (everything after END,
/// untouched). Preserving the tail is what keeps entries other tools
/// append to the end of the file alive across re-applies.
///
/// When the aggregated content is empty but a tail exists, an empty
/// START/END anchor is kept in place: dropping it would make the next
/// non-empty apply re-create the section *after* the tail, silently
/// reordering entries (hosts resolution is first-match-wins).
///
/// The seams are normalised (head trimmed at its end, tail at both
/// ends, fixed blank lines around the markers) so that re-applying the
/// same content is byte-identical — the caller's hash short-circuit
/// depends on that to avoid needless privileged writes.
fn make_append_content(previous_lf: &str, new_content_lf: &str) -> String {
    let (head, tail) = split_around_managed_section(previous_lf);
    let head = head.trim_end();
    let tail = tail.trim();
    let content = strip_marker_lines(new_content_lf);
    let content = content.trim();

    let mut parts: Vec<String> = Vec::new();
    if !head.is_empty() {
        parts.push(head.to_string());
    }
    if !content.is_empty() {
        parts.push(format!(
            "{CONTENT_START_MARKER}\n\n{content}\n\n{CONTENT_END_MARKER}"
        ));
    } else if !tail.is_empty() {
        parts.push(format!("{CONTENT_START_MARKER}\n\n{CONTENT_END_MARKER}"));
    }
    if !tail.is_empty() {
        parts.push(tail.to_string());
    }

    let mut result = parts.join("\n\n");
    result.push('\n');
    result
}

/// True when `line` is a section boundary. Markers only count as
/// boundaries on their own line (modulo surrounding whitespace) — a
/// marker quoted inside a hosts entry's inline comment is content, not
/// a boundary. Every SwitchHosts version has written markers on their
/// own line, so this stays backward-compatible.
fn is_marker_line(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed == CONTENT_START_MARKER || trimmed == CONTENT_END_MARKER
}

/// Split the previous hosts content into (head, tail) around the
/// SwitchHosts-managed section.
///
/// The END marker is only searched for *after* the START marker, so a
/// stray END sitting before START stays part of the head and is never
/// touched. When no END follows START (files written by versions that
/// predate the END marker), the tail is empty: everything from START to
/// EOF is considered SwitchHosts-owned, matching the legacy behaviour.
fn split_around_managed_section(previous_lf: &str) -> (&str, &str) {
    let Some((start_begin, start_end)) = find_marker_line(previous_lf, 0, CONTENT_START_MARKER)
    else {
        return (previous_lf, "");
    };

    let head = &previous_lf[..start_begin];

    match find_marker_line(previous_lf, start_end, CONTENT_END_MARKER) {
        Some((_, end_end)) => (head, &previous_lf[end_end..]),
        None => (head, ""),
    }
}

/// Find the first line at or after byte offset `from` whose trimmed
/// content equals `marker`. Returns the line's `(start, end)` byte
/// offsets, `end` excluding the trailing newline.
fn find_marker_line(text: &str, from: usize, marker: &str) -> Option<(usize, usize)> {
    let mut line_start = from;
    for segment in text[from..].split_inclusive('\n') {
        let line = segment.strip_suffix('\n').unwrap_or(segment);
        if line.trim() == marker {
            return Some((line_start, line_start + line.len()));
        }
        line_start += segment.len();
    }
    None
}

/// Drop aggregated-content lines that *are* a marker line: left in,
/// such a line would make the next parse end the managed section early
/// and leak the remainder into the preserved tail forever. Lines merely
/// containing a marker substring are kept — they are not boundaries.
fn strip_marker_lines(content_lf: &str) -> String {
    if !content_lf.lines().any(is_marker_line) {
        return content_lf.to_string();
    }

    content_lf
        .lines()
        .filter(|line| !is_marker_line(line))
        .collect::<Vec<_>>()
        .join("\n")
}

// ---- comparison hash --------------------------------------------------------

/// Stable in-process content hash. We don't need cryptographic
/// strength — only "are these two byte sequences the same" — so a
/// `DefaultHasher` is plenty and avoids pulling md5/sha into Cargo.toml.
fn hash_str(s: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{make_append_content, windows_hosts_path_from_windows_dir};

    /// Behaviour cases live in a fixture shared with the Playwright
    /// Tauri mock, which reimplements this function in JavaScript. Both
    /// implementations are asserted against the same file so they cannot
    /// drift apart silently; see the `$comment` in the fixture.
    const CASES_JSON: &str = include_str!("../../../test/fixtures/hosts_append_cases.json");

    #[test]
    fn append_mode_matches_shared_behaviour_fixture() {
        let doc: serde_json::Value =
            serde_json::from_str(CASES_JSON).expect("fixture is valid JSON");
        let cases = doc["cases"]
            .as_array()
            .expect("fixture has a `cases` array");
        assert!(!cases.is_empty(), "fixture must define at least one case");

        for case in cases {
            let name = case["name"].as_str().expect("case has a name");
            let mut content = case["previous"]
                .as_str()
                .expect("case has `previous`")
                .to_string();

            for payload in case["applies"].as_array().expect("case has `applies`") {
                let payload = payload.as_str().expect("`applies` holds strings");
                content = make_append_content(&content, payload);
            }

            let expected = case["expected"].as_str().expect("case has `expected`");
            assert_eq!(content, expected, "fixture case `{name}` failed");
        }
    }

    #[test]
    fn windows_hosts_path_uses_resolved_windows_directory() {
        let windows_dir = Path::new(r"D:\Windows");
        let path = windows_hosts_path_from_windows_dir(windows_dir);

        assert!(path.starts_with(windows_dir));
        assert!(path.ends_with(
            Path::new("System32")
                .join("drivers")
                .join("etc")
                .join("hosts")
        ));
    }

    #[test]
    fn windows_hosts_path_normalizes_drive_root_windows_directory() {
        let path = windows_hosts_path_from_windows_dir(Path::new(r"D:"));
        let rendered = path.to_string_lossy();

        assert!(rendered.starts_with(r"D:\"));
        assert!(!rendered.starts_with(r"D:System32"));
        assert!(path.ends_with(
            Path::new("System32")
                .join("drivers")
                .join("etc")
                .join("hosts")
        ));
    }
}

#[cfg(test)]
mod compensation_tests {
    use super::*;

    #[test]
    fn restores_complete_file_without_reappending_managed_or_unmanaged_content() {
        let target =
            std::env::temp_dir().join(format!("switchhosts-restore-{}", std::process::id()));
        let old = "127.0.0.1 localhost\n# --- SWITCHHOSTS_CONTENT_START ---\n10.0.0.2 old.test\n# --- SWITCHHOSTS_CONTENT_END ---\n# user-managed tail\n";
        std::fs::write(&target, restore_line_endings(old)).unwrap();
        let applied = apply_at(&target, "10.0.0.1 dev.test\n", "append").unwrap();
        assert!(applied.new_content.contains("dev.test"));
        assert!(applied.new_content.contains("# user-managed tail"));
        restore_at(&target, &applied.previous_content, &applied.new_content).unwrap();
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            restore_line_endings(old)
        );
        // A later write must survive a delayed compensation attempt.
        std::fs::write(&target, "newer external content\n").unwrap();
        assert!(restore_at(&target, old, &applied.new_content).is_err());
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "newer external content\n"
        );
        std::fs::remove_file(target).unwrap();
    }

    #[test]
    fn unreadable_previous_file_aborts_apply_and_compensation() {
        let target =
            std::env::temp_dir().join(format!("switchhosts-unreadable-{}", std::process::id()));
        std::fs::create_dir_all(&target).unwrap();
        assert!(apply_at(&target, "new content", "overwrite").is_err());
        assert!(restore_at(&target, "old content", "new content").is_err());
        assert!(target.is_dir());
        std::fs::remove_dir(target).unwrap();
    }
}
