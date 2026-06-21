//! Minimal FFI bindings to libxpc and libdispatch, shared by the
//! privileged daemon ([`super::daemon`]) and the app-side client
//! (`crate::hosts_apply::helper_client`).
//!
//! Only the handful of symbols those two callers need are declared. The
//! XPC object model is reference-counted C; callers own anything from a
//! `*_create*` / `*_with_reply_sync` and must [`xpc_release`] it.
//!
//! Client authentication is handled entirely by the XPC peer
//! code-signing requirement (`xpc_connection_set_peer_code_signing_requirement`,
//! public since macOS 12; older builds also exported the alias
//! `xpc_connection_set_codesigning_requirement`, which macOS 26 dropped —
//! see [`set_codesigning_requirement`], which tries both). Because the
//! helper is gated to macOS 13+, this single OS-enforced check is
//! sufficient — we deliberately avoid the private
//! `xpc_connection_get_audit_token` path.

use std::ffi::{c_char, c_void};

use block2::Block;

pub type XpcObject = *mut c_void;
pub type XpcConnection = *mut c_void;
pub type XpcType = *const c_void;

/// `xpc_connection_create_mach_service` flags.
pub const XPC_CONNECTION_MACH_SERVICE_LISTENER: u64 = 1 << 0;
pub const XPC_CONNECTION_MACH_SERVICE_PRIVILEGED: u64 = 1 << 1;

extern "C" {
    // Opaque type descriptors. We only ever compare their addresses
    // against the result of `xpc_get_type`, never read them, so a `u8`
    // placeholder type is sufficient to name the symbols.
    pub static _xpc_type_connection: u8;
    pub static _xpc_type_dictionary: u8;
    pub static _xpc_type_error: u8;

    pub fn xpc_get_type(object: XpcObject) -> XpcType;
    pub fn xpc_retain(object: XpcObject) -> XpcObject;
    pub fn xpc_release(object: XpcObject);

    pub fn xpc_connection_create_mach_service(
        name: *const c_char,
        targetq: *mut c_void,
        flags: u64,
    ) -> XpcConnection;
    pub fn xpc_connection_set_event_handler(
        connection: XpcConnection,
        handler: &Block<dyn Fn(XpcObject)>,
    );
    pub fn xpc_connection_resume(connection: XpcConnection);
    pub fn xpc_connection_cancel(connection: XpcConnection);
    pub fn xpc_connection_send_message(connection: XpcConnection, message: XpcObject);
    pub fn xpc_connection_send_message_with_reply_sync(
        connection: XpcConnection,
        message: XpcObject,
    ) -> XpcObject;

    pub fn xpc_dictionary_create(
        keys: *const *const c_char,
        values: *const XpcObject,
        count: usize,
    ) -> XpcObject;
    pub fn xpc_dictionary_create_reply(original: XpcObject) -> XpcObject;
    pub fn xpc_dictionary_get_remote_connection(dictionary: XpcObject) -> XpcConnection;
    pub fn xpc_dictionary_set_string(
        dictionary: XpcObject,
        key: *const c_char,
        value: *const c_char,
    );
    pub fn xpc_dictionary_get_string(dictionary: XpcObject, key: *const c_char) -> *const c_char;
    pub fn xpc_dictionary_set_int64(dictionary: XpcObject, key: *const c_char, value: i64);
    pub fn xpc_dictionary_get_int64(dictionary: XpcObject, key: *const c_char) -> i64;
    pub fn xpc_dictionary_set_uint64(dictionary: XpcObject, key: *const c_char, value: u64);
    pub fn xpc_dictionary_get_uint64(dictionary: XpcObject, key: *const c_char) -> u64;
    pub fn xpc_dictionary_set_data(
        dictionary: XpcObject,
        key: *const c_char,
        bytes: *const c_void,
        length: usize,
    );
    pub fn xpc_dictionary_get_data(
        dictionary: XpcObject,
        key: *const c_char,
        length: *mut usize,
    ) -> *const c_void;

    /// Parks the calling thread servicing the (main) dispatch queue.
    /// Never returns; used by the daemon to stay alive while XPC
    /// delivers connections on its managed queues.
    pub fn dispatch_main() -> !;
}

/// The XPC "pin the peer to a code-signing requirement" call, resolved
/// at runtime via `dlsym` rather than link-time binding.
///
/// The crate's deployment target (11.0) predates these symbols, so a
/// strong extern reference fails to link; the helper only ever runs on
/// macOS 13+ (gated by `SMAppService`), so a dynamic lookup is both
/// sufficient and the only way to keep the 11.0-target build linking.
///
/// Two spellings exist across OS versions and BOTH must be tried:
/// - `xpc_connection_set_peer_code_signing_requirement` — the canonical
///   public symbol (macOS 12+), and the only one present on macOS 26+;
/// - `xpc_connection_set_codesigning_requirement` — an older alias that
///   macOS 26 dropped.
///
/// Resolving only the old name made the daemon fail closed on macOS 26
/// (symbol missing → returns `-1` → the listener cancels every client
/// connection, so the helper is installed-but-unreachable). We prefer the
/// canonical name and fall back to the alias for older systems. Returns
/// the call's `OSStatus` (0 = success), or `-1` if neither symbol exists.
pub fn set_codesigning_requirement(connection: XpcConnection, requirement: *const c_char) -> i32 {
    use std::sync::OnceLock;

    type Fp = unsafe extern "C" fn(XpcConnection, *const c_char) -> i32;
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

    static SYM: OnceLock<Option<Fp>> = OnceLock::new();
    let resolved = SYM.get_or_init(|| unsafe {
        // Prefer the canonical public name; fall back to the legacy alias
        // for older systems. Whichever resolves first wins.
        for name in [
            c"xpc_connection_set_peer_code_signing_requirement".as_ptr(),
            c"xpc_connection_set_codesigning_requirement".as_ptr(),
        ] {
            let p = libc::dlsym(RTLD_DEFAULT, name);
            if !p.is_null() {
                return Some(std::mem::transmute::<*mut c_void, Fp>(p));
            }
        }
        None
    });
    match resolved {
        Some(f) => unsafe { f(connection, requirement) },
        None => -1,
    }
}

/// Addresses of the XPC type descriptors. We take the address (never
/// read the value), which is all `is_type` needs.
pub fn type_connection() -> *const u8 {
    std::ptr::addr_of!(_xpc_type_connection)
}
pub fn type_dictionary() -> *const u8 {
    std::ptr::addr_of!(_xpc_type_dictionary)
}
pub fn type_error() -> *const u8 {
    std::ptr::addr_of!(_xpc_type_error)
}

/// True if `object`'s XPC type matches the descriptor at `ty` (one of
/// the `type_*()` accessors above).
///
/// # Safety
/// `object` must be a valid XPC object (or null); `ty` must point at a
/// real `_xpc_type_*` descriptor.
pub unsafe fn is_type(object: XpcObject, ty: *const u8) -> bool {
    !object.is_null() && xpc_get_type(object) == (ty as XpcType)
}
