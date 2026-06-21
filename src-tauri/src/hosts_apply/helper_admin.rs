//! Install / status / uninstall of the privileged helper daemon
//! (`swh_helper`) via `SMAppService` (macOS 13+).
//!
//! The single admin-authorization prompt the user ever sees for routine
//! hosts writes happens here, at [`register`]. Once registered, launchd
//! keeps the daemon available and all future `/etc/hosts` writes go
//! through it silently (see `hosts_apply::helper_client`).
//!
//! Capability gating:
//! - The `SMAppService` class exists iff the OS is macOS 13+, so its
//!   presence is our version gate — no version-string parsing needed.
//! - [`is_signable_build`] checks our own code signature against the
//!   Team-ID-pinned requirement. A dev / ad-hoc / wrong-team build can't
//!   install a daemon the OS would trust, so we report `NotSupported`
//!   and the apply path falls back to AEWP instead of futilely
//!   prompting.
//!
//! Everything off the happy path degrades to `NotSupported` / the AEWP
//! fallback — never a hard error that would block applying hosts.

/// Installed-state of the privileged helper, as surfaced to the
/// renderer. `installed_outdated` is produced once the live version
/// handshake lands (Stage 3); `status()` here reports registration
/// state only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HelperStatus {
    /// Non-macOS, macOS < 13, or not a Developer-ID build by our team —
    /// the silent helper can't be used; the AEWP path applies.
    NotSupported,
    /// Supported but the daemon isn't registered yet.
    NotInstalled,
    /// Registered but the user must approve it in System Settings →
    /// General → Login Items before launchd will run it.
    RequiresApproval,
    /// Registered, enabled, and version-current — writes go silently
    /// through the daemon.
    InstalledCurrent,
    /// Registered and enabled but reporting an older protocol/version —
    /// needs a re-register to pick up the new helper.
    InstalledOutdated,
    /// SMAppService reports it enabled, but it doesn't answer the XPC
    /// handshake (missing/mis-signed binary, launchd failed to start it,
    /// or a hung daemon). The user should reinstall; the apply path uses
    /// AEWP meanwhile. Distinct from `InstalledCurrent` so the UI doesn't
    /// falsely claim a healthy install.
    InstalledUnreachable,
}

impl HelperStatus {
    /// Stable string code for the renderer (`agent.ts` / Preferences).
    pub fn as_code(self) -> &'static str {
        match self {
            HelperStatus::NotSupported => "not_supported",
            HelperStatus::NotInstalled => "not_installed",
            HelperStatus::RequiresApproval => "requires_approval",
            HelperStatus::InstalledCurrent => "installed_current",
            HelperStatus::InstalledOutdated => "installed_outdated",
            HelperStatus::InstalledUnreachable => "installed_unreachable",
        }
    }
}

/// Failure registering / unregistering the helper. Intentionally coarse:
/// the apply path treats any failure as "helper unavailable" and falls
/// back to AEWP, and the Preferences UI just shows the message.
#[derive(Debug, thiserror::Error)]
pub enum HelperError {
    #[error("privileged helper is not supported on this build/OS")]
    NotSupported,
    #[error("{0}")]
    Failed(String),
}

/// Current helper status. Never fails — unknown / unsupported maps to
/// [`HelperStatus::NotSupported`] or [`HelperStatus::NotInstalled`].
pub fn status() -> HelperStatus {
    #[cfg(target_os = "macos")]
    {
        imp::status()
    }
    #[cfg(not(target_os = "macos"))]
    {
        HelperStatus::NotSupported
    }
}

/// Register (install) the daemon. Triggers the one-time admin auth
/// prompt. Returns the resulting [`HelperStatus`] on success.
pub fn register() -> Result<HelperStatus, HelperError> {
    #[cfg(target_os = "macos")]
    {
        imp::register()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(HelperError::NotSupported)
    }
}

/// Unregister (uninstall) the daemon. The supported "remove the helper"
/// path — dragging the app to the Trash does NOT unregister a daemon.
pub fn unregister() -> Result<(), HelperError> {
    #[cfg(target_os = "macos")]
    {
        imp::unregister()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(HelperError::NotSupported)
    }
}

/// Force a clean re-register: unregister (ignoring errors) then
/// register. A bare [`register`] on an already-registered service may
/// not refresh a stale / unreachable daemon, so the Preferences repair
/// action for an outdated / unreachable helper uses this.
pub fn repair() -> Result<HelperStatus, HelperError> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Mutex;
        use std::time::{Duration, Instant};

        // Reinstall churns unregister+register, which can wedge the
        // Background Task Management database (launchd falls out of sync with
        // BTM and refuses to materialize the job). Two guards stop that under
        // rapid clicks / near-simultaneous `helper_repair` invokes:
        //
        // - REPAIR_RUNNING — mutual exclusion. Only one repair runs at a
        //   time; a caller arriving while another is in flight bails with the
        //   current status. This holds even when a single repair runs longer
        //   than COOLDOWN (a hung-daemon probe can take up to the 8s XPC
        //   timeout), which a time window alone cannot cover.
        // - LAST_REPAIR — rate limit. After a repair finishes, the next is
        //   held off for COOLDOWN so a failing reinstall can't be hammered.
        const COOLDOWN: Duration = Duration::from_secs(5);
        static REPAIR_RUNNING: AtomicBool = AtomicBool::new(false);
        static LAST_REPAIR: Mutex<Option<Instant>> = Mutex::new(None);

        // Claim the in-flight slot. `swap` returns the prior value: `true`
        // means another repair already owns it — bail without disturbing it.
        // On `false` we own it and must release it on EVERY exit path,
        // including a panic inside `imp::repair()`, so release via RAII.
        if REPAIR_RUNNING.swap(true, Ordering::SeqCst) {
            return Ok(imp::status());
        }
        struct InFlight;
        impl Drop for InFlight {
            fn drop(&mut self) {
                REPAIR_RUNNING.store(false, Ordering::SeqCst);
            }
        }
        let _in_flight = InFlight;

        // Rate-limit window, keyed on the previous repair's completion time.
        if let Ok(guard) = LAST_REPAIR.lock() {
            if let Some(t) = *guard {
                if t.elapsed() < COOLDOWN {
                    return Ok(imp::status());
                }
            }
        }

        let result = imp::repair();

        if let Ok(mut guard) = LAST_REPAIR.lock() {
            *guard = Some(Instant::now());
        }
        result
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(HelperError::NotSupported)
    }
}

/// Whether this running build is signed such that the OS would trust a
/// daemon it installs (Developer ID under our team). Used by the apply
/// path to decide whether to attempt the helper at all.
pub fn is_signable_build() -> bool {
    #[cfg(target_os = "macos")]
    {
        imp::is_signable_build()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::CStr;
    use std::os::raw::c_char;
    use std::ptr;

    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};

    use super::{HelperError, HelperStatus};
    use crate::helper_proto;

    // SMAppServiceStatus (NSInteger).
    const SM_STATUS_NOT_REGISTERED: isize = 0;
    const SM_STATUS_ENABLED: isize = 1;
    const SM_STATUS_REQUIRES_APPROVAL: isize = 2;
    const SM_STATUS_NOT_FOUND: isize = 3;

    /// The daemon plist filename shipped at
    /// `Contents/Library/LaunchDaemons/<this>`. `SMAppService` resolves
    /// it relative to that directory.
    const DAEMON_PLIST_NAME: &CStr = c"net.oldj.switchhosts.helper.plist";

    /// `SMAppService` exists only on macOS 13+, so a successful class
    /// lookup is our version gate.
    fn smappservice_class() -> Option<&'static AnyClass> {
        AnyClass::get(c"SMAppService")
    }

    /// `[SMAppService daemonServiceWithPlistName:]` — an autoreleased
    /// instance, used immediately within the calling function.
    unsafe fn daemon_service(cls: &AnyClass) -> *mut AnyObject {
        let ns_name: *mut AnyObject =
            msg_send![class_nsstring(), stringWithUTF8String: DAEMON_PLIST_NAME.as_ptr()];
        msg_send![cls, daemonServiceWithPlistName: ns_name]
    }

    fn class_nsstring() -> &'static AnyClass {
        AnyClass::get(c"NSString").expect("NSString always exists")
    }

    pub fn status() -> HelperStatus {
        // Wrap the ObjC calls in an autorelease pool: these run on tokio
        // worker threads which have no ambient pool, so autoreleased
        // NSString/NSError objects would otherwise leak and log warnings.
        objc2::rc::autoreleasepool(|_| {
            let Some(cls) = smappservice_class() else {
                return HelperStatus::NotSupported;
            };
            if !is_signable_build() {
                return HelperStatus::NotSupported;
            }
            unsafe {
                let service = daemon_service(cls);
                if service.is_null() {
                    return HelperStatus::NotInstalled;
                }
                let raw: isize = msg_send![service, status];
                match raw {
                    SM_STATUS_ENABLED => enabled_status(),
                    SM_STATUS_REQUIRES_APPROVAL => HelperStatus::RequiresApproval,
                    SM_STATUS_NOT_REGISTERED | SM_STATUS_NOT_FOUND => HelperStatus::NotInstalled,
                    _ => HelperStatus::NotInstalled,
                }
            }
        })
    }

    /// SMAppService reports the daemon enabled — confirm it's actually
    /// reachable and version-current via a live XPC handshake (which also
    /// demand-starts it via launchd). A different protocol version is
    /// `Outdated` (needs re-register); no reply at all is `Unreachable`
    /// (broken install — the UI should prompt a reinstall rather than
    /// falsely report a healthy "Installed").
    fn enabled_status() -> HelperStatus {
        match crate::hosts_apply::helper_client::probe_version() {
            Some(v) if v == helper_proto::PROTOCOL_VERSION as u64 => HelperStatus::InstalledCurrent,
            Some(_) => HelperStatus::InstalledOutdated,
            None => HelperStatus::InstalledUnreachable,
        }
    }

    pub fn register() -> Result<HelperStatus, HelperError> {
        // Bump the probe generation so the post-register `status()` probe
        // isn't blocked by a stuck pre-register probe (see helper_client).
        crate::hosts_apply::helper_client::reset_probe_gate();
        objc2::rc::autoreleasepool(|_| {
            let Some(cls) = smappservice_class() else {
                return Err(HelperError::NotSupported);
            };
            if !is_signable_build() {
                return Err(HelperError::NotSupported);
            }
            unsafe {
                let service = daemon_service(cls);
                if service.is_null() {
                    return Err(HelperError::Failed("nil SMAppService instance".into()));
                }
                let mut err: *mut AnyObject = ptr::null_mut();
                let ok: bool = msg_send![service, registerAndReturnError: &mut err];
                if !ok {
                    return Err(HelperError::Failed(ns_error_message(err)));
                }
            }
            Ok(status())
        })
    }

    pub fn unregister() -> Result<(), HelperError> {
        // Bump the probe generation so a later status probe isn't blocked
        // by a probe outstanding against the now-removed daemon.
        crate::hosts_apply::helper_client::reset_probe_gate();
        objc2::rc::autoreleasepool(|_| {
            let Some(cls) = smappservice_class() else {
                return Err(HelperError::NotSupported);
            };
            unsafe {
                let service = daemon_service(cls);
                if service.is_null() {
                    return Ok(()); // nothing registered → nothing to remove
                }
                // `unregisterAndReturnError:` is the synchronous Swift
                // `unregister() throws`. Guard with respondsToSelector so an
                // OS that lacks it degrades to best-effort rather than a
                // hard unrecognized-selector crash.
                let sel = objc2::sel!(unregisterAndReturnError:);
                let responds: bool = msg_send![service, respondsToSelector: sel];
                if !responds {
                    log::warn!("SMAppService lacks unregisterAndReturnError:; skipping");
                    return Ok(());
                }
                let mut err: *mut AnyObject = ptr::null_mut();
                let ok: bool = msg_send![service, unregisterAndReturnError: &mut err];
                if !ok {
                    return Err(HelperError::Failed(ns_error_message(err)));
                }
            }
            Ok(())
        })
    }

    pub fn repair() -> Result<HelperStatus, HelperError> {
        // Best-effort unregister to clear any stale launchd registration,
        // then a fresh register. Ignore the unregister result (it may not
        // be registered, or unregister may be a no-op) — the register is
        // what must succeed.
        let _ = unregister();
        register()
    }

    unsafe fn ns_error_message(err: *mut AnyObject) -> String {
        if err.is_null() {
            return "unknown error".into();
        }
        let desc: *mut AnyObject = msg_send![err, localizedDescription];
        if desc.is_null() {
            return "unknown error".into();
        }
        let utf8: *const c_char = msg_send![desc, UTF8String];
        if utf8.is_null() {
            return "unknown error".into();
        }
        CStr::from_ptr(utf8).to_string_lossy().into_owned()
    }

    // ---- SecCode self-signature check --------------------------------------

    mod sec_ffi {
        use std::ffi::c_void;

        pub type SecCodeRef = *mut c_void;
        pub type SecRequirementRef = *mut c_void;
        pub type CFStringRef = *const c_void;
        pub type OSStatus = i32;

        pub const ERR_SECURITY_SUCCESS: OSStatus = 0;
        pub const SEC_CS_DEFAULT_FLAGS: u32 = 0;

        extern "C" {
            pub fn SecCodeCopySelf(flags: u32, self_: *mut SecCodeRef) -> OSStatus;
            pub fn SecRequirementCreateWithString(
                text: CFStringRef,
                flags: u32,
                requirement: *mut SecRequirementRef,
            ) -> OSStatus;
            pub fn SecCodeCheckValidity(
                code: SecCodeRef,
                flags: u32,
                requirement: SecRequirementRef,
            ) -> OSStatus;
            pub fn CFRelease(cf: *const c_void);
        }
    }

    /// Validate our own static code signature against the Team-ID-pinned
    /// requirement. Returns false for unsigned / ad-hoc / wrong-team
    /// builds (the dev case) so we never attempt a registration the OS
    /// would refuse anyway.
    pub fn is_signable_build() -> bool {
        use sec_ffi::*;
        objc2::rc::autoreleasepool(|_| unsafe {
            let mut code: SecCodeRef = ptr::null_mut();
            if SecCodeCopySelf(SEC_CS_DEFAULT_FLAGS, &mut code) != ERR_SECURITY_SUCCESS {
                return false;
            }

            // Build a CFStringRef via a toll-free-bridged NSString.
            let req = helper_proto::app_designated_requirement();
            let c = match std::ffi::CString::new(req) {
                Ok(c) => c,
                Err(_) => {
                    CFRelease(code);
                    return false;
                }
            };
            let ns: *mut AnyObject = msg_send![class_nsstring(), stringWithUTF8String: c.as_ptr()];
            let cf_str = ns as CFStringRef;

            let mut requirement: SecRequirementRef = ptr::null_mut();
            let r = SecRequirementCreateWithString(cf_str, SEC_CS_DEFAULT_FLAGS, &mut requirement);
            if r != ERR_SECURITY_SUCCESS {
                CFRelease(code);
                return false;
            }

            let valid = SecCodeCheckValidity(code, SEC_CS_DEFAULT_FLAGS, requirement)
                == ERR_SECURITY_SUCCESS;

            CFRelease(requirement);
            CFRelease(code);
            valid
        })
    }
}
