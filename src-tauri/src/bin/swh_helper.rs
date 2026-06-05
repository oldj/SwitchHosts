//! `swh_helper` — the SwitchHosts privileged helper daemon (macOS).
//!
//! Installed once via `SMAppService.daemon` and run as `root` by
//! launchd, this tiny binary performs the system `/etc/hosts` writes
//! that would otherwise require a per-write admin authorization prompt.
//! It links none of the app's heavy machinery (no Tauri, no reqwest, no
//! storage) — only the shared [`switchhosts_lib::helper_proto`] contract
//! — keeping the privileged attack surface minimal.
//!
//! Lifecycle: launchd starts this binary as `root` on demand (the
//! daemon plist declares the `net.oldj.switchhosts.helper` Mach
//! service). [`helper_proto::daemon::run`] brings up the XPC listener,
//! pins each client to the genuine SwitchHosts app's code signature, and
//! never returns.

#[cfg(target_os = "macos")]
fn main() {
    // `run()` diverges (parks on `dispatch_main`); it never returns.
    switchhosts_lib::helper_proto::daemon::run()
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("swh_helper is only supported on macOS");
    std::process::exit(1);
}
