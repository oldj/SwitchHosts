//! The privileged daemon's XPC listener loop (macOS).
//!
//! Run from `src/bin/swh_helper.rs` after launchd starts the helper as
//! `root`. Listens on the Mach service [`super::LABEL`], pins each
//! client to the genuine SwitchHosts app via
//! [`xpc_connection_set_codesigning_requirement`], and services exactly
//! three operations: [`super::OP_WRITE`], [`super::OP_VERSION`],
//! [`super::OP_PING`]. The write target is the compile-time constant
//! `/etc/hosts` — the protocol carries no path, so a client cannot
//! redirect the privileged write.

use std::ffi::{CStr, CString};

use block2::RcBlock;

use super::xpc::*;
use super::{
    app_designated_requirement, write_system_hosts, KEY_CONTENT, KEY_MESSAGE, KEY_OP,
    KEY_PROTOCOL_VERSION, KEY_STATUS, LABEL, OP_PING, OP_VERSION, OP_WRITE, PROTOCOL_VERSION,
    STATUS_ERR, STATUS_OK,
};

/// Bring up the listener and park forever servicing it. Never returns.
pub fn run() -> ! {
    let name = CString::new(LABEL).expect("LABEL has no NUL");
    let client_req = CString::new(app_designated_requirement()).expect("requirement has no NUL");

    unsafe {
        let listener = xpc_connection_create_mach_service(
            name.as_ptr(),
            std::ptr::null_mut(),
            XPC_CONNECTION_MACH_SERVICE_LISTENER,
        );
        if listener.is_null() {
            daemon_log(
                libc::LOG_ERR,
                &format!("[swh_helper] failed to create Mach service listener for {LABEL}"),
            );
            std::process::exit(1);
        }

        // Listener handler: invoked once per new peer connection.
        let on_new_peer = RcBlock::new(move |peer: XpcObject| {
            if !is_type(peer, type_connection()) {
                return; // ignore error sentinels delivered to the listener
            }

            // OS-enforced client authentication (macOS 12+): only the
            // genuine, correctly-signed SwitchHosts app may talk to us.
            let rc = set_codesigning_requirement(peer, client_req.as_ptr());
            if rc != 0 {
                daemon_log(
                    libc::LOG_ERR,
                    &format!("[swh_helper] set_codesigning_requirement failed: {rc}"),
                );
                xpc_connection_cancel(peer);
                return;
            }

            // Per-peer message handler.
            let on_message = RcBlock::new(move |event: XpcObject| {
                if is_type(event, type_dictionary()) {
                    handle_request(event);
                }
                // Non-dictionary events are connection errors / EOF — the
                // connection tears down on its own; nothing to do.
            });
            // `xpc_connection_set_event_handler` copies the block, so
            // our `RcBlock` can drop here; XPC holds its own ref for the
            // connection's lifetime and releases it on teardown.
            xpc_connection_set_event_handler(peer, &on_message);
            xpc_connection_resume(peer);
        });

        xpc_connection_set_event_handler(listener, &on_new_peer);
        xpc_connection_resume(listener);
        daemon_log(
            libc::LOG_NOTICE,
            &format!("[swh_helper] listener up on {LABEL}, protocol v{PROTOCOL_VERSION}"),
        );

        dispatch_main()
    }
}

/// Handle one request dictionary and reply on its originating
/// connection.
///
/// # Safety
/// `event` must be a valid XPC dictionary delivered by a peer
/// connection.
unsafe fn handle_request(event: XpcObject) {
    let remote = xpc_dictionary_get_remote_connection(event);
    let reply = xpc_dictionary_create_reply(event);
    if reply.is_null() {
        return;
    }

    let op_ptr = xpc_dictionary_get_string(event, KEY_OP.as_ptr());
    let op = if op_ptr.is_null() {
        c""
    } else {
        CStr::from_ptr(op_ptr)
    };

    if op == OP_PING {
        xpc_dictionary_set_int64(reply, KEY_STATUS.as_ptr(), STATUS_OK);
    } else if op == OP_VERSION {
        xpc_dictionary_set_int64(reply, KEY_STATUS.as_ptr(), STATUS_OK);
        xpc_dictionary_set_uint64(
            reply,
            KEY_PROTOCOL_VERSION.as_ptr(),
            PROTOCOL_VERSION as u64,
        );
    } else if op == OP_WRITE {
        let mut len: usize = 0;
        let data = xpc_dictionary_get_data(event, KEY_CONTENT.as_ptr(), &mut len);
        if data.is_null() {
            reply_error(reply, "missing content");
        } else {
            let bytes = std::slice::from_raw_parts(data as *const u8, len);
            match write_system_hosts(bytes) {
                Ok(()) => {
                    daemon_log(
                        libc::LOG_NOTICE,
                        &format!("[swh_helper] wrote {len} bytes to /etc/hosts"),
                    );
                    xpc_dictionary_set_int64(reply, KEY_STATUS.as_ptr(), STATUS_OK);
                }
                Err(e) => {
                    daemon_log(libc::LOG_ERR, &format!("[swh_helper] write failed: {e}"));
                    reply_error(reply, &e.to_string());
                }
            }
        }
    } else {
        reply_error(reply, "unknown op");
    }

    if !remote.is_null() {
        xpc_connection_send_message(remote, reply);
    }
    xpc_release(reply);
}

/// Stamp an error status + message onto `reply`.
///
/// # Safety
/// `reply` must be a valid XPC dictionary owned by the caller.
unsafe fn reply_error(reply: XpcObject, message: &str) {
    xpc_dictionary_set_int64(reply, KEY_STATUS.as_ptr(), STATUS_ERR);
    if let Ok(c) = CString::new(message) {
        xpc_dictionary_set_string(reply, KEY_MESSAGE.as_ptr(), c.as_ptr());
    }
}

// --- diagnostics -----------------------------------------------------------

// A LaunchDaemon's stderr is detached — launchd discards it without a
// `StandardErrorPath` — so `eprintln!` alone is invisible once the helper
// runs under launchd. Route diagnostics through `syslog`, which bridges to
// the unified logging system, so `log show --predicate 'process ==
// "swh_helper"'` surfaces them (e.g. the `set_codesigning_requirement`
// failure that silently rejects every client when the XPC symbol is
// missing). stderr is kept too, so running the binary directly in a
// terminal during development still prints output.
extern "C" {
    fn syslog(priority: std::os::raw::c_int, format: *const std::os::raw::c_char, ...);
}

/// Emit one diagnostic line to both stderr and the unified log.
fn daemon_log(priority: std::os::raw::c_int, msg: &str) {
    eprintln!("{msg}");
    if let Ok(c) = CString::new(msg) {
        // The literal `%s` is the format string and `msg` is its argument,
        // so message text containing `%` can't be read as a format directive.
        unsafe { syslog(priority, c"%s".as_ptr(), c.as_ptr()) };
    }
}
