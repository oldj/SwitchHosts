//! App-side XPC client for the privileged helper daemon.
//!
//! Connects to the `net.oldj.switchhosts.helper` Mach service in the
//! privileged (system) launchd domain, pins the daemon's code signature,
//! and exposes the two operations the rest of the app needs:
//! - [`write_hosts`] — the silent `/etc/hosts` write used by the apply
//!   path (`hosts_apply::elevation::write_privileged`),
//! - [`probe_version`] — a reachability + protocol-version handshake
//!   used by `helper_admin::status` to distinguish current vs outdated.
//!
//! Any failure (connection refused, signature mismatch, daemon error) is
//! returned as `Err` / `None`; the caller falls back to the AEWP path so
//! applying hosts never hard-fails because of the helper.

/// Ask the daemon to overwrite `/etc/hosts` with `content`. `Ok(())`
/// means the privileged write succeeded silently.
///
/// This is a *blocking* synchronous call — deliberately NOT wrapped in a
/// background-thread timeout. A write has a side effect, and an XPC
/// request, once sent, executes on the daemon regardless of whether the
/// caller is still waiting; abandoning a "timed-out" write thread could
/// let a stale write land on disk *after* a later apply, clobbering it.
/// Blocking keeps the write synchronous with the apply (so the
/// renderer's serialized applies stay ordered). Liveness is still
/// protected: `write_privileged` only calls this after `helper_admin::
/// status()` — whose probe IS timeout-bounded — has just confirmed the
/// daemon is reachable, so a hung daemon is caught there and routed to
/// AEWP before any write is attempted.
pub fn write_hosts(content: &[u8]) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        imp::write_hosts(content)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = content;
        Err("privileged helper is not supported on this platform".into())
    }
}

/// Ping the daemon for its protocol version. `None` if unreachable or it
/// doesn't reply within the timeout. This read-only probe IS bounded by
/// a timeout (no side effect, so a late/abandoned reply is harmless) and
/// is what gates the side-effecting [`write_hosts`] above.
///
/// Single-flight **per generation**: on timeout the worker thread stays
/// blocked in the (uncancellable) sync XPC call, so to stop abandoned
/// workers piling up while the daemon hangs and status is queried
/// repeatedly (each apply / opening Preferences), only one worker per
/// generation may exist — while one is outstanding, callers get `None`
/// without spawning another. A stuck worker only blocks ITS generation;
/// [`reset_probe_gate`] (called after register/unregister) bumps the
/// generation so a fresh probe runs even if a pre-repair probe is
/// permanently stuck — otherwise a repair could never be observed as
/// healthy until an app restart.
pub fn probe_version() -> Option<u64> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::atomic::Ordering::SeqCst;
        let generation = PROBE_GEN.load(SeqCst);
        loop {
            let inflight = PROBE_INFLIGHT_GEN.load(SeqCst);
            if inflight == generation {
                // A worker for the current generation is already running.
                return None;
            }
            // Free (`NO_PROBE`) or a stale older-generation worker — claim
            // the slot for this generation.
            if PROBE_INFLIGHT_GEN
                .compare_exchange_weak(inflight, generation, SeqCst, SeqCst)
                .is_ok()
            {
                break;
            }
        }
        run_with_timeout(XPC_TIMEOUT, move || {
            let _guard = ProbeGuard { generation };
            imp::probe_version()
        })
        .flatten()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// Abandon any in-flight probe's single-flight claim by bumping the
/// generation, so the next [`probe_version`] spawns a fresh worker even
/// if a previous one is permanently stuck on a (now-replaced) hung
/// daemon. Call after register/unregister so a post-repair status probe
/// isn't blocked by a stuck pre-repair probe.
pub fn reset_probe_gate() {
    #[cfg(target_os = "macos")]
    {
        PROBE_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
}

/// `probe_version` single-flight state. `PROBE_INFLIGHT_GEN` holds the
/// generation of the worker currently in flight, or `NO_PROBE` when free.
#[cfg(target_os = "macos")]
const NO_PROBE: u64 = u64::MAX;
#[cfg(target_os = "macos")]
static PROBE_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(target_os = "macos")]
static PROBE_INFLIGHT_GEN: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(NO_PROBE);

/// Frees the single-flight slot when the probe worker returns/panics —
/// but only if it still holds *our* generation (a newer probe or a
/// `reset_probe_gate` may have superseded us; don't clobber that).
#[cfg(target_os = "macos")]
struct ProbeGuard {
    generation: u64,
}
#[cfg(target_os = "macos")]
impl Drop for ProbeGuard {
    fn drop(&mut self) {
        use std::sync::atomic::Ordering::SeqCst;
        let _ = PROBE_INFLIGHT_GEN.compare_exchange(self.generation, NO_PROBE, SeqCst, SeqCst);
    }
}

/// Bound for the read-only probe round-trip. Generous enough for a
/// launchd cold-start of the daemon, short enough that a hung daemon
/// can't stall a status query indefinitely.
#[cfg(target_os = "macos")]
const XPC_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

/// Run a *side-effect-free* `f` on a dedicated thread, returning `None`
/// if it doesn't finish within `timeout`. `send_message_with_reply_sync`
/// has no built-in timeout, so this caps how long a misbehaving daemon
/// can block a status query. Only safe for reads: on timeout the worker
/// is abandoned (its connection tears down inside `f` once the sync call
/// eventually returns/errors), so any late result is simply discarded.
#[cfg(target_os = "macos")]
fn run_with_timeout<T: Send + 'static>(
    timeout: std::time::Duration,
    f: impl FnOnce() -> T + Send + 'static,
) -> Option<T> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(timeout).ok()
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::{c_void, CStr, CString};

    use block2::RcBlock;

    use crate::helper_proto::{self, xpc::*};

    /// Open a pinned, resumed connection to the daemon, run `f`, then
    /// tear it down. Returns `None` if the connection couldn't even be
    /// created.
    fn with_connection<T>(f: impl FnOnce(XpcConnection) -> T) -> Option<T> {
        let name = CString::new(helper_proto::LABEL).ok()?;
        let req = CString::new(helper_proto::helper_designated_requirement()).ok()?;
        unsafe {
            let conn = xpc_connection_create_mach_service(
                name.as_ptr(),
                std::ptr::null_mut(),
                XPC_CONNECTION_MACH_SERVICE_PRIVILEGED,
            );
            if conn.is_null() {
                return None;
            }
            // A handler must be set before resume. We use the synchronous
            // send-with-reply API, so async events are only errors/EOF
            // here — nothing to act on.
            let handler = RcBlock::new(move |_event: XpcObject| {});
            xpc_connection_set_event_handler(conn, &handler);
            // Pin the daemon identity so a rogue process can't squat the
            // Mach name. Best-effort; the system enforces it on 12+.
            let _ = set_codesigning_requirement(conn, req.as_ptr());
            xpc_connection_resume(conn);

            let out = f(conn);

            xpc_connection_cancel(conn);
            xpc_release(conn);
            Some(out)
        }
    }

    pub fn write_hosts(content: &[u8]) -> Result<(), String> {
        with_connection(|conn| unsafe {
            let msg = xpc_dictionary_create(std::ptr::null(), std::ptr::null(), 0);
            xpc_dictionary_set_string(
                msg,
                helper_proto::KEY_OP.as_ptr(),
                helper_proto::OP_WRITE.as_ptr(),
            );
            xpc_dictionary_set_data(
                msg,
                helper_proto::KEY_CONTENT.as_ptr(),
                content.as_ptr() as *const c_void,
                content.len(),
            );
            let reply = xpc_connection_send_message_with_reply_sync(conn, msg);
            xpc_release(msg);
            let r = interpret_status(reply);
            if !reply.is_null() {
                xpc_release(reply);
            }
            r
        })
        .unwrap_or_else(|| Err("could not connect to the privileged helper".into()))
    }

    pub fn probe_version() -> Option<u64> {
        with_connection(|conn| unsafe {
            let msg = xpc_dictionary_create(std::ptr::null(), std::ptr::null(), 0);
            xpc_dictionary_set_string(
                msg,
                helper_proto::KEY_OP.as_ptr(),
                helper_proto::OP_VERSION.as_ptr(),
            );
            let reply = xpc_connection_send_message_with_reply_sync(conn, msg);
            xpc_release(msg);
            let v = if is_type(reply, type_dictionary())
                && xpc_dictionary_get_int64(reply, helper_proto::KEY_STATUS.as_ptr())
                    == helper_proto::STATUS_OK
            {
                Some(xpc_dictionary_get_uint64(
                    reply,
                    helper_proto::KEY_PROTOCOL_VERSION.as_ptr(),
                ))
            } else {
                None
            };
            if !reply.is_null() {
                xpc_release(reply);
            }
            v
        })
        .flatten()
    }

    /// Map a reply dictionary to `Ok`/`Err`. A null or error-typed reply
    /// means the connection failed (unreachable / signature mismatch).
    unsafe fn interpret_status(reply: XpcObject) -> Result<(), String> {
        if reply.is_null() {
            return Err("no reply from helper".into());
        }
        if is_type(reply, type_error()) {
            return Err("helper connection error (unreachable or rejected)".into());
        }
        if !is_type(reply, type_dictionary()) {
            return Err("unexpected reply type from helper".into());
        }
        let status = xpc_dictionary_get_int64(reply, helper_proto::KEY_STATUS.as_ptr());
        if status == helper_proto::STATUS_OK {
            return Ok(());
        }
        let m = xpc_dictionary_get_string(reply, helper_proto::KEY_MESSAGE.as_ptr());
        if m.is_null() {
            Err("helper reported a write failure".into())
        } else {
            Err(CStr::from_ptr(m).to_string_lossy().into_owned())
        }
    }
}
