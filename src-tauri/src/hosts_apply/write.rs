//! System hosts write orchestration.
//!
//! Mirrors the Electron `setSystemHosts` flow in
//! [src/main/actions/hosts/setSystemHosts.ts]:
//!
//! 1. Normalize line endings to LF in memory.
//! 2. If `write_mode == "append"`, splice the new content under the
//!    `# --- SWITCHHOSTS_CONTENT_START ---` marker, dropping anything
//!    that was previously below it.
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

use super::elevation::write_privileged;
use super::error::HostsApplyError;

const CONTENT_START_MARKER: &str = "# --- SWITCHHOSTS_CONTENT_START ---";

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
    let target = system_hosts_path()?;
    let content_lf = normalize_line_endings(aggregated_content);

    let previous_raw = read_system_hosts(&target).unwrap_or_default();
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

    match std::fs::write(&target, disk_content.as_bytes()) {
        Ok(()) => Ok(ApplyOutcome {
            previous_content: previous_lf,
            new_content: final_content_lf,
            unchanged: false,
        }),
        Err(e) if is_permission_denied(&e) => {
            // Prefer the silent macOS helper; falls back to OS-native
            // elevation (AEWP / pkexec / UAC) for any other platform or
            // when the helper isn't available.
            write_privileged(&target, &disk_content)?;
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

fn make_append_content(previous_lf: &str, new_content_lf: &str) -> String {
    let head = match previous_lf.find(CONTENT_START_MARKER) {
        Some(idx) => previous_lf[..idx].trim_end().to_string(),
        None => previous_lf.to_string(),
    };

    if new_content_lf.is_empty() {
        return format!("{head}\n");
    }

    format!("{head}\n\n{CONTENT_START_MARKER}\n\n{new_content_lf}")
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

    use super::windows_hosts_path_from_windows_dir;

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
