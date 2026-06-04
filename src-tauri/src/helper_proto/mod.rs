//! Shared protocol contract between the SwitchHosts app and its
//! privileged helper daemon (`swh_helper`).
//!
//! This module is the single source of truth for:
//! - the helper's launchd label / Mach service name,
//! - the code-signing requirement the daemon uses to pin its clients
//!   (and the app uses to self-check that it is a signable build),
//! - the XPC message keys, operations, and protocol version,
//! - payload validation (size / encoding) applied before any
//!   privileged write,
//! - the atomic, owner/mode-enforcing write primitive the daemon uses
//!   to overwrite the system hosts file.
//!
//! Keeping all of this in one module compiled into `switchhosts_lib`
//! (used by BOTH the main app and the `swh_helper` bin target) means
//! the wire contract and the security pin cannot drift between the two
//! halves of the system.

use std::ffi::CStr;

#[cfg(target_os = "macos")]
pub mod daemon;
#[cfg(target_os = "macos")]
pub mod xpc;

/// launchd label and Mach service name for the privileged helper.
/// Doubles as the SMAppService daemon plist name (`<LABEL>.plist`) and
/// the `MachServices` key the daemon registers.
pub const LABEL: &str = "net.oldj.switchhosts.helper";

/// Bundle identifier of the main app — the identity the daemon pins its
/// clients to.
pub const APP_BUNDLE_ID: &str = "net.oldj.switchhosts";

/// Apple Developer Team ID (the `OU` field of the signing leaf
/// certificate). Both the app and the helper are signed under this team.
pub const TEAM_ID: &str = "J5J6USUX2F";

/// Protocol version. Bump on any breaking change to the message shape.
/// The app compares the running daemon's reported version against this
/// to decide whether the installed helper is current (`version` op).
pub const PROTOCOL_VERSION: u32 = 1;

/// Maximum accepted hosts payload. A real `/etc/hosts` is tens of KB at
/// most; this cap sits far above any legitimate file yet well below
/// anything that could be a memory-pressure vector against a root
/// daemon.
pub const MAX_PAYLOAD_BYTES: usize = 5 * 1024 * 1024;

// ---- XPC message vocabulary -------------------------------------------------
//
// Messages are flat `xpc_dictionary` objects. Requests carry `KEY_OP`
// (one of the `OP_*` values) and, for writes, `KEY_CONTENT` (the raw
// hosts bytes). Replies carry `KEY_STATUS` (`STATUS_OK` / `STATUS_ERR`),
// an optional `KEY_MESSAGE`, and — for the `version` op —
// `KEY_PROTOCOL_VERSION`.
//
// These are `&CStr` (not `&str`) because every consumer is the C-level
// `xpc_dictionary_*` API, which wants NUL-terminated keys/values. The
// daemon compares received op strings as `&CStr` directly.

pub const KEY_OP: &CStr = c"op";
pub const KEY_CONTENT: &CStr = c"content";
pub const KEY_STATUS: &CStr = c"status";
pub const KEY_MESSAGE: &CStr = c"message";
pub const KEY_PROTOCOL_VERSION: &CStr = c"protocol_version";

pub const OP_WRITE: &CStr = c"write_hosts";
pub const OP_VERSION: &CStr = c"version";
pub const OP_PING: &CStr = c"ping";

pub const STATUS_OK: i64 = 0;
pub const STATUS_ERR: i64 = 1;

/// The code-signing requirement string used in two places:
///
/// - the **daemon** pins it on each incoming connection via
///   `xpc_connection_set_codesigning_requirement` (the OS rejects any
///   client that doesn't satisfy it), so only the genuine SwitchHosts
///   app can ask it to write `/etc/hosts`;
/// - the **app** evaluates it against its own static code
///   (`SecCodeCopySelf` + `SecCodeCheckValidity`) before attempting
///   helper registration — an unsigned / wrong-team / ad-hoc build fails
///   this and falls back to the AEWP path instead of futilely prompting.
///
/// Both roles key on the app's bundle identifier (`APP_BUNDLE_ID`).
pub fn app_designated_requirement() -> String {
    format!(
        "identifier \"{APP_BUNDLE_ID}\" and anchor apple generic and certificate leaf[subject.OU] = \"{TEAM_ID}\""
    )
}

/// The requirement the **app** (XPC client) pins on the daemon
/// connection (`xpc_connection_set_codesigning_requirement`) so a rogue
/// process can't impersonate the Mach service.
///
/// Pins the Apple anchor + our Team ID, but NOT a specific identifier:
/// the daemon is the `swh_helper` cargo bin, whose code-signing
/// identifier is assigned by the bundler and not guaranteed to equal
/// [`LABEL`]. Team-only pinning is sufficient here — registering a
/// *system* Mach service requires root, and only our team's code carries
/// this OU, so no non-team process can stand in for the daemon. (The
/// security-critical direction — the daemon verifying its client via
/// [`app_designated_requirement`] — keeps the full identifier pin.)
pub fn helper_designated_requirement() -> String {
    format!("anchor apple generic and certificate leaf[subject.OU] = \"{TEAM_ID}\"")
}

/// Validation failures for an inbound hosts payload.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ProtoError {
    #[error("payload too large: {len} bytes")]
    TooLarge { len: usize },
    #[error("payload contains a NUL byte")]
    ContainsNul,
    #[error("payload is not valid UTF-8")]
    NotUtf8,
}

/// Validate a hosts payload before any privileged write. The daemon is
/// a deliberately dumb byte sink — it does NOT parse or merge hosts
/// content (the app already produced the final bytes) — but it does
/// refuse anything that isn't plausibly a hosts file:
///
/// - over [`MAX_PAYLOAD_BYTES`] (cheap-to-reject DoS guard),
/// - containing an embedded NUL (hosts files are text; a NUL signals a
///   malformed or hostile payload),
/// - not valid UTF-8.
///
/// Cheapest checks first so an oversized payload is rejected before we
/// scan every byte.
pub fn validate_payload(bytes: &[u8]) -> Result<(), ProtoError> {
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return Err(ProtoError::TooLarge { len: bytes.len() });
    }
    if bytes.contains(&0) {
        return Err(ProtoError::ContainsNul);
    }
    if std::str::from_utf8(bytes).is_err() {
        return Err(ProtoError::NotUtf8);
    }
    Ok(())
}

// ---- privileged write primitive (Unix) -------------------------------------

/// The system hosts file the daemon is allowed to write. A compile-time
/// constant: the IPC protocol carries NO path, so a client cannot
/// redirect the privileged write anywhere else.
#[cfg(unix)]
pub const SYSTEM_HOSTS_PATH: &str = "/etc/hosts";

/// Monotonic counter that makes each privileged write's temp file name
/// unique, so two concurrent writes within the daemon never share (and
/// clobber) one temp file.
#[cfg(unix)]
static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Validate `content` and atomically overwrite the system hosts file as
/// `root:wheel` mode `0644`. Intended to run inside the privileged
/// daemon (which is `root`). Returns `InvalidData` if validation fails.
#[cfg(unix)]
pub fn write_system_hosts(content: &[u8]) -> std::io::Result<()> {
    validate_payload(content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))?;
    write_atomic(
        std::path::Path::new(SYSTEM_HOSTS_PATH),
        content,
        Some((0, 0)),
    )
}

/// Atomic write core, factored out so it can be unit-tested
/// unprivileged: write to a sibling temp file, `fsync`, set mode `0644`,
/// optionally `chown` to `owner` (`Some((uid, gid))`; `None` skips the
/// chown so tests can run without root), then `rename(2)` over the
/// target. `rename` within the same directory is atomic, so a reader of
/// the hosts file always sees either the old or the new content, never a
/// partial write. On any failure the temp file is removed best-effort.
#[cfg(unix)]
fn write_atomic(
    target: &std::path::Path,
    content: &[u8],
    owner: Option<(u32, u32)>,
) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    let dir = target.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "target has no parent dir")
    })?;
    let seq = TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = dir.join(format!(".swh-hosts.{}.{}.tmp", std::process::id(), seq));

    let result = (|| -> std::io::Result<()> {
        {
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&tmp)?;
            f.write_all(content)?;
            f.sync_all()?;
        }
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o644))?;
        if let Some((uid, gid)) = owner {
            std::os::unix::fs::chown(&tmp, Some(uid), Some(gid))?;
        }
        std::fs::rename(&tmp, target)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_a_normal_hosts_file() {
        let hosts = b"127.0.0.1 localhost\n::1 localhost\n# comment\n";
        assert_eq!(validate_payload(hosts), Ok(()));
    }

    #[test]
    fn validate_accepts_empty_payload() {
        // The daemon is a dumb byte sink; content policy lives in the
        // app. An empty payload is unusual but not the daemon's call.
        assert_eq!(validate_payload(b""), Ok(()));
    }

    #[test]
    fn validate_rejects_oversized_payload() {
        let big = vec![b'a'; MAX_PAYLOAD_BYTES + 1];
        assert_eq!(
            validate_payload(&big),
            Err(ProtoError::TooLarge {
                len: MAX_PAYLOAD_BYTES + 1
            })
        );
        // Exactly at the cap is allowed.
        let edge = vec![b'a'; MAX_PAYLOAD_BYTES];
        assert_eq!(validate_payload(&edge), Ok(()));
    }

    #[test]
    fn validate_rejects_embedded_nul() {
        assert_eq!(
            validate_payload(b"127.0.0.1 localhost\0evil"),
            Err(ProtoError::ContainsNul)
        );
    }

    #[test]
    fn validate_rejects_invalid_utf8() {
        // 0xFF is never valid in UTF-8 and is not a NUL.
        assert_eq!(
            validate_payload(&[0x31, 0xFF, 0x32]),
            Err(ProtoError::NotUtf8)
        );
    }

    #[test]
    fn designated_requirement_is_exactly_the_pinned_string() {
        // Golden test: a typo here silently weakens the security pin, so
        // assert the byte-for-byte expected requirement.
        assert_eq!(
            app_designated_requirement(),
            "identifier \"net.oldj.switchhosts\" and anchor apple generic and certificate leaf[subject.OU] = \"J5J6USUX2F\""
        );
    }

    #[test]
    fn helper_requirement_is_exactly_the_pinned_string() {
        assert_eq!(
            helper_designated_requirement(),
            "anchor apple generic and certificate leaf[subject.OU] = \"J5J6USUX2F\""
        );
    }

    #[cfg(unix)]
    #[test]
    fn write_atomic_replaces_content_and_sets_mode() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("swh_proto_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let target = dir.join("hosts");
        std::fs::write(&target, "old content").expect("seed target");

        // owner=None: run unprivileged (chown to root would need root).
        write_atomic(&target, b"new content\n", None).expect("atomic write");

        assert_eq!(
            std::fs::read_to_string(&target).expect("read target"),
            "new content\n"
        );
        assert_eq!(
            std::fs::metadata(&target)
                .expect("stat")
                .permissions()
                .mode()
                & 0o777,
            0o644
        );
        // No temp file left behind (any `.swh-hosts.*` sibling).
        let leftovers = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(".swh-hosts."))
            .count();
        assert_eq!(leftovers, 0, "temp file should be renamed away");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn write_system_hosts_rejects_invalid_payload_before_touching_disk() {
        // A NUL-bearing payload must be refused by validation; this also
        // proves validation runs before the (root-only) write is
        // attempted, so the call fails with InvalidData, not EPERM.
        let err = write_system_hosts(b"bad\0payload").expect_err("should reject");
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    }
}
