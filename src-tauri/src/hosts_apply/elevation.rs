//! Privileged write to the system hosts file.
//!
//! Strategy:
//!
//! 1. Write the new content to a temp file (no privilege required).
//! 2. Run the platform-specific elevation helper to copy the temp
//!    file over `/etc/hosts` (or the Windows equivalent).
//! 3. The destination's existing mode and ownership are preserved
//!    automatically by the underlying copy primitive (POSIX `cp`
//!    truncates and writes the existing inode; Windows `copy`
//!    writes through the existing handle).
//!
//! The OS-native elevation prompt collects credentials, so the v5
//! Tauri build never asks the user to type a password into our own
//! UI. The renderer's old `SudoPasswordInput` modal was removed in
//! the Tauri port — `no_access` failures surface through the standard
//! error notification instead.
//!
//! Per-platform helpers:
//! - macOS: Security.framework `AuthorizationExecuteWithPrivileges`
//!   with a process-lifetime cached `AuthorizationRef` (single prompt)
//! - Linux: `pkexec /bin/cp` (P2.E.4)
//! - Windows: `ShellExecuteExW` with `runas` verb (self-relaunch)

use std::path::{Path, PathBuf};

use super::error::HostsApplyError;

/// Write `content` to `target` using OS-native elevation. The caller
/// is responsible for falling back here only after a direct write
/// has failed with a permission error.
pub fn write_with_elevation(target: &Path, content: &str) -> Result<(), HostsApplyError> {
    let tmp_path = stage_temp_file(content)?;
    let result = elevate_copy(&tmp_path, target);
    // Best-effort cleanup; ignore failures because the temp directory
    // is OS-managed and the file is small.
    let _ = std::fs::remove_file(&tmp_path);
    result
}

fn stage_temp_file(content: &str) -> Result<PathBuf, HostsApplyError> {
    let mut path = std::env::temp_dir();
    let stamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
    path.push(format!("swh_apply_{stamp}.hosts"));
    std::fs::write(&path, content).map_err(|e| HostsApplyError::Io {
        message: format!("staging temp file failed: {e}"),
    })?;
    Ok(path)
}

// ---- macOS: Security.framework with cached authorization --------------------
//
// Instead of spawning `osascript` on every write (which prompts for a
// password each time), we use the Security.framework C API directly:
//
//   1. `AuthorizationCreate` obtains an `AuthorizationRef` and shows
//      the OS password dialog on first call.
//   2. The ref is cached in a process-global static so subsequent
//      writes reuse it without re-prompting.
//   3. `AuthorizationExecuteWithPrivileges` runs `/bin/cp` and
//      `/bin/chmod` as root using the cached ref.
//   4. The ref is freed via `AuthorizationFree` on `Drop` (app exit).
//
// `AuthorizationExecuteWithPrivileges` has been deprecated since macOS
// 10.7 but remains functional through macOS 15 (Sequoia). Apple's
// recommended replacement (`SMJobBless` / `SMAppService`) requires a
// separate privileged helper daemon — massive overhead for copying one
// file. Homebrew, Sparkle, and other major macOS tools still use AEWP.

#[cfg(target_os = "macos")]
mod security_ffi {
    use std::ffi::c_void;

    pub type AuthorizationRef = *mut c_void;
    pub type OSStatus = i32;

    pub const ERR_AUTHORIZATION_SUCCESS: OSStatus = 0;
    pub const ERR_AUTHORIZATION_CANCELED: OSStatus = -60006;
    pub const ERR_AUTHORIZATION_INVALID_REF: OSStatus = -60002;
    pub const ERR_AUTHORIZATION_DENIED: OSStatus = -60005;

    pub const K_AUTH_FLAG_INTERACTION_ALLOWED: u32 = 1 << 0;
    pub const K_AUTH_FLAG_EXTEND_RIGHTS: u32 = 1 << 1;
    pub const K_AUTH_FLAG_PREAUTHORIZE: u32 = 1 << 4;

    #[repr(C)]
    pub struct AuthorizationItem {
        pub name: *const u8,
        pub value_length: usize,
        pub value: *mut c_void,
        pub flags: u32,
    }

    #[repr(C)]
    pub struct AuthorizationRights {
        pub count: u32,
        pub items: *mut AuthorizationItem,
    }

    extern "C" {
        pub fn AuthorizationCreate(
            rights: *const AuthorizationRights,
            environment: *const c_void,
            flags: u32,
            authorization: *mut AuthorizationRef,
        ) -> OSStatus;

        pub fn AuthorizationFree(authorization: AuthorizationRef, flags: u32) -> OSStatus;

        pub fn AuthorizationExecuteWithPrivileges(
            authorization: AuthorizationRef,
            path_to_tool: *const u8,
            options: u32,
            arguments: *const *const u8,
            communications_pipe: *mut *mut c_void,
        ) -> OSStatus;
    }
}

#[cfg(target_os = "macos")]
struct CachedAuth(security_ffi::AuthorizationRef);

// SAFETY: AuthorizationRef is a process-scoped opaque pointer. The
// Security.framework serialises access internally, so it is safe to
// send across threads.
#[cfg(target_os = "macos")]
unsafe impl Send for CachedAuth {}

#[cfg(target_os = "macos")]
impl Drop for CachedAuth {
    fn drop(&mut self) {
        unsafe {
            security_ffi::AuthorizationFree(self.0, 0);
        }
    }
}

#[cfg(target_os = "macos")]
static CACHED_AUTH: std::sync::Mutex<Option<CachedAuth>> = std::sync::Mutex::new(None);

/// Serialises `elevate_copy` calls so that only one thread at a time
/// can use (or invalidate) the cached `AuthorizationRef`. Without
/// this, a concurrent caller could hold a raw `AuthorizationRef`
/// pointer while another thread frees it via `invalidate_cached_auth`.
#[cfg(target_os = "macos")]
static ELEVATE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Obtain a cached `AuthorizationRef`, creating one (with an OS
/// password prompt) on first call.
#[cfg(target_os = "macos")]
fn get_or_create_auth() -> Result<security_ffi::AuthorizationRef, HostsApplyError> {
    let mut guard = CACHED_AUTH.lock().expect("auth mutex poisoned");

    if let Some(ref cached) = *guard {
        return Ok(cached.0);
    }

    let right_name = b"system.privilege.admin\0";
    let mut item = security_ffi::AuthorizationItem {
        name: right_name.as_ptr(),
        value_length: 0,
        value: std::ptr::null_mut(),
        flags: 0,
    };
    let mut rights = security_ffi::AuthorizationRights {
        count: 1,
        items: &mut item,
    };

    let flags = security_ffi::K_AUTH_FLAG_INTERACTION_ALLOWED
        | security_ffi::K_AUTH_FLAG_EXTEND_RIGHTS
        | security_ffi::K_AUTH_FLAG_PREAUTHORIZE;

    let mut auth_ref: security_ffi::AuthorizationRef = std::ptr::null_mut();
    let status = unsafe {
        security_ffi::AuthorizationCreate(&mut rights, std::ptr::null(), flags, &mut auth_ref)
    };

    match status {
        security_ffi::ERR_AUTHORIZATION_SUCCESS => {
            *guard = Some(CachedAuth(auth_ref));
            Ok(auth_ref)
        }
        security_ffi::ERR_AUTHORIZATION_CANCELED => Err(HostsApplyError::Cancelled),
        other => Err(HostsApplyError::Io {
            message: format!("AuthorizationCreate failed: OSStatus {other}"),
        }),
    }
}

/// Clear the cached authorization so the next call to
/// `get_or_create_auth` will prompt again.
#[cfg(target_os = "macos")]
fn invalidate_cached_auth() {
    let mut guard = CACHED_AUTH.lock().expect("auth mutex poisoned");
    *guard = None; // Drop calls AuthorizationFree
}

/// Internal error for the macOS elevation path. Carries the raw
/// `OSStatus` when `AuthorizationExecuteWithPrivileges` fails, so
/// the retry logic in `elevate_copy` can match on the numeric code
/// instead of parsing error message strings.
#[cfg(target_os = "macos")]
enum MacElevateError {
    /// AEWP returned a non-zero OSStatus.
    AuthExec(security_ffi::OSStatus, String),
    /// Everything else (I/O, encoding, child exit code).
    Other(HostsApplyError),
}

#[cfg(target_os = "macos")]
impl From<HostsApplyError> for MacElevateError {
    fn from(e: HostsApplyError) -> Self {
        MacElevateError::Other(e)
    }
}

/// Execute `/bin/cp src dst && /bin/chmod 644 dst` as root using a
/// previously obtained `AuthorizationRef`.
#[cfg(target_os = "macos")]
fn execute_privileged_copy(
    auth_ref: security_ffi::AuthorizationRef,
    src: &Path,
    dst: &Path,
) -> Result<(), MacElevateError> {
    let src_cstr = std::ffi::CString::new(src.to_str().ok_or_else(|| HostsApplyError::Io {
        message: "src path is not valid UTF-8".into(),
    })?)
    .map_err(|e| HostsApplyError::Io {
        message: format!("CString from src: {e}"),
    })?;
    let dst_cstr = std::ffi::CString::new(dst.to_str().ok_or_else(|| HostsApplyError::Io {
        message: "dst path is not valid UTF-8".into(),
    })?)
    .map_err(|e| HostsApplyError::Io {
        message: format!("CString from dst: {e}"),
    })?;

    // --- /bin/cp src dst ---
    let cp_args: [*const u8; 3] = [
        src_cstr.as_ptr() as *const u8,
        dst_cstr.as_ptr() as *const u8,
        std::ptr::null(),
    ];

    let exit = unsafe { run_privileged(auth_ref, b"/bin/cp\0".as_ptr(), cp_args.as_ptr()) }?;
    if exit != 0 {
        return Err(HostsApplyError::Io {
            message: format!("/bin/cp exited with status {exit}"),
        }
        .into());
    }

    // --- /bin/chmod 644 dst ---
    let chmod_args: [*const u8; 3] = [
        b"644\0".as_ptr(),
        dst_cstr.as_ptr() as *const u8,
        std::ptr::null(),
    ];

    let exit = unsafe { run_privileged(auth_ref, b"/bin/chmod\0".as_ptr(), chmod_args.as_ptr()) }?;
    if exit != 0 {
        return Err(HostsApplyError::Io {
            message: format!("/bin/chmod exited with status {exit}"),
        }
        .into());
    }

    Ok(())
}

/// Run a tool via `AuthorizationExecuteWithPrivileges`, wait for the
/// child to finish, and return its exit status.
///
/// Uses the `communicationsPipe` (child's stdout) to drain output
/// until EOF before calling `wait()`. This ensures we reap the child
/// that AEWP just spawned, not an unrelated child process.
#[cfg(target_os = "macos")]
unsafe fn run_privileged(
    auth_ref: security_ffi::AuthorizationRef,
    tool: *const u8,
    args: *const *const u8,
) -> Result<i32, MacElevateError> {
    let mut pipe: *mut libc::FILE = std::ptr::null_mut();

    let status = security_ffi::AuthorizationExecuteWithPrivileges(
        auth_ref,
        tool,
        0,
        args,
        &mut pipe as *mut *mut libc::FILE as *mut *mut std::ffi::c_void,
    );
    if status != security_ffi::ERR_AUTHORIZATION_SUCCESS {
        let tool_name = std::ffi::CStr::from_ptr(tool as *const i8).to_string_lossy();
        return Err(MacElevateError::AuthExec(
            status,
            format!("AEWP({tool_name}): OSStatus {status}"),
        ));
    }

    // Drain the pipe until EOF — this blocks until the child exits,
    // guaranteeing the subsequent wait() reaps the correct process.
    if !pipe.is_null() {
        let mut buf = [0u8; 256];
        while libc::fread(
            buf.as_mut_ptr() as *mut std::ffi::c_void,
            1,
            buf.len(),
            pipe,
        ) > 0
        {}
        libc::fclose(pipe);
    }

    let mut wstatus: i32 = 0;
    let pid = libc::wait(&mut wstatus);
    if pid < 0 {
        return Ok(-1);
    }
    if libc::WIFEXITED(wstatus) {
        Ok(libc::WEXITSTATUS(wstatus))
    } else {
        Ok(-1)
    }
}

#[cfg(target_os = "macos")]
fn elevate_copy(src: &Path, dst: &Path) -> Result<(), HostsApplyError> {
    // Serialise all elevation attempts so that no thread can free a
    // cached AuthorizationRef while another thread is still using it.
    let _lock = ELEVATE_LOCK.lock().expect("elevate lock poisoned");

    let auth_ref = get_or_create_auth()?;

    match execute_privileged_copy(auth_ref, src, dst) {
        Ok(()) => Ok(()),
        Err(MacElevateError::AuthExec(status, msg)) if is_auth_stale(status) => {
            // Cached authorization was invalidated (timeout, revocation).
            // Clear it and retry once — the retry will re-prompt the user.
            log::info!("{msg} — re-prompting");
            invalidate_cached_auth();
            let auth_ref = get_or_create_auth()?;
            execute_privileged_copy(auth_ref, src, dst).map_err(mac_elevate_to_hosts_error)
        }
        Err(e) => Err(mac_elevate_to_hosts_error(e)),
    }
}

#[cfg(target_os = "macos")]
fn mac_elevate_to_hosts_error(e: MacElevateError) -> HostsApplyError {
    match e {
        MacElevateError::AuthExec(_, msg) => HostsApplyError::Io { message: msg },
        MacElevateError::Other(e) => e,
    }
}

/// Returns `true` when the OSStatus indicates the cached
/// `AuthorizationRef` is no longer valid and a new one should be
/// obtained (errAuthorizationInvalidRef or errAuthorizationDenied
/// which can occur on timeout).
#[cfg(target_os = "macos")]
fn is_auth_stale(status: security_ffi::OSStatus) -> bool {
    status == security_ffi::ERR_AUTHORIZATION_INVALID_REF
        || status == security_ffi::ERR_AUTHORIZATION_DENIED
}

// ---- Linux: pkexec ---------------------------------------------------------

#[cfg(target_os = "linux")]
fn elevate_copy(src: &Path, dst: &Path) -> Result<(), HostsApplyError> {
    use std::process::Command;

    // pkexec runs the given binary as root after the user
    // authenticates via the desktop environment's polkit agent
    // (polkit-gnome-authentication-agent-1, lxpolkit, kde-polkit
    // and friends). All modern Linux desktops ship one out of the
    // box, so the prompt appears as a graphical dialog without us
    // having to do anything special.
    //
    // We invoke `/bin/cp` directly — no shell, no escaping —  so
    // paths with spaces or other shell metacharacters in the temp
    // dir can't break the command line. POSIX `cp` opens an
    // existing destination with `O_WRONLY|O_TRUNC` and writes
    // content into the existing inode, so the destination's mode
    // and ownership (root:root 644 for /etc/hosts on every distro
    // we ship for) are preserved through the copy.
    let output = Command::new("/usr/bin/pkexec")
        .arg("/bin/cp")
        .arg(src)
        .arg(dst)
        .output()
        .map_err(|e| HostsApplyError::Io {
            message: format!("failed to launch pkexec: {e}"),
        })?;

    if output.status.success() {
        return Ok(());
    }

    // pkexec(1) exit codes:
    //   0   the operation was successful
    //   126 authentication failed (bad password) OR user dismissed
    //       the authentication dialog — both map to Cancelled
    //   127 not authorized — polkit policy refused the action
    //   anything else — exit code from the invoked program (cp)
    let code = output.status.code();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let stderr_trim = stderr.trim();
    match code {
        Some(126) => Err(HostsApplyError::Cancelled),
        Some(127) => Err(HostsApplyError::NoAccess {
            message: if stderr_trim.is_empty() {
                "polkit refused the action".to_string()
            } else {
                stderr_trim.to_string()
            },
        }),
        _ => Err(HostsApplyError::Io {
            message: format!(
                "pkexec exit {}: {}",
                code.map(|c| c.to_string()).unwrap_or_else(|| "?".into()),
                stderr_trim
            ),
        }),
    }
}

// ---- Windows: ShellExecuteExW with runas verb (self-relaunch) -------------
//
// We trigger UAC by relaunching *our own binary* with a magic
// `--swh-elevated-apply-hosts <src> <dst>` argv shape. The early arg
// check at the top of `crate::run` catches that shape in the elevated
// child and performs a plain `std::fs::copy(src, dst)` (which under
// the hood is `CopyFileW`, preserving the destination's NTFS ACL), then
// exits.
//
// Why self-relaunch instead of `cmd /c copy /Y "src" "dst"`:
//
//   - `cmd.exe` parses its command line with `%VAR%` expansion turned
//     on unconditionally. NTFS allows `%` in file names, and Windows
//     temp directories live under `%TEMP%` which can in principle
//     resolve to a path containing literal `%`. Going through cmd
//     would corrupt such a path with a phantom variable expansion.
//   - Spawning our own binary makes Windows parse the args via
//     `CommandLineToArgvW`, which does NOT expand `%VAR%`. The
//     elevated child sees the literal paths as `argv[2]` / `argv[3]`.
//   - Avoids a brief flash of an elevated cmd.exe console window.
//
// Path quoting in `lpParameters`: NTFS forbids `"` in file names, so
// wrapping each path in double quotes is enough for the destination
// and the temp file. The temp file name is hex digits + underscores
// only, and the system hosts path never ends in `\`, so the trailing
// `"` is never preceded by a backslash (which would otherwise be
// escaped to a literal `"` by CommandLineToArgvW).

#[cfg(target_os = "windows")]
fn elevate_copy(src: &Path, dst: &Path) -> Result<(), HostsApplyError> {
    use std::ffi::{OsStr, OsString};
    use std::iter;
    use std::mem;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_CANCELLED, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, WaitForSingleObject, INFINITE,
    };
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS,
        SHELLEXECUTEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    fn to_wide(os: &OsStr) -> Vec<u16> {
        os.encode_wide().chain(iter::once(0)).collect()
    }

    // Resolve our own binary path. `current_exe` returns the
    // SwitchHosts.exe location both in dev (`target\debug\...`) and
    // in the bundled installer.
    let exe = std::env::current_exe().map_err(|e| HostsApplyError::Io {
        message: format!("current_exe failed: {e}"),
    })?;

    // Build the parameter string before spawning the worker thread.
    // OsString concatenation preserves the platform-native encoding,
    // so non-ASCII path components round-trip cleanly through the
    // subsequent UTF-16 conversion.
    let mut params = OsString::new();
    params.push("--swh-elevated-apply-hosts \"");
    params.push(src.as_os_str());
    params.push("\" \"");
    params.push(dst.as_os_str());
    params.push("\"");

    let verb = to_wide(OsStr::new("runas"));
    let file = to_wide(exe.as_os_str());
    let params_w = to_wide(&params);

    // Captured into the worker for use in the failure-path error
    // message — we don't want to keep the &Path borrow alive across
    // the thread boundary.
    let src_display = src.to_string_lossy().into_owned();
    let dst_display = dst.to_string_lossy().into_owned();

    // ShellExecuteExW must be called from a thread that has been
    // initialised as a single-threaded apartment (STA). The Tokio
    // worker threads our async commands run on do not carry COM
    // state, so we hop onto a fresh OS thread that we initialise
    // ourselves. The thread is short-lived (one elevated copy +
    // wait + cleanup) and the join blocks the calling task,
    // matching the synchronous semantics elsewhere in the apply
    // pipeline.
    let outcome = std::thread::spawn(move || -> Result<(), HostsApplyError> {
        unsafe {
            // CoInitializeEx returns:
            //   S_OK            (0)        — first init on this thread
            //   S_FALSE         (1)        — already inited in same mode
            //   RPC_E_CHANGED_MODE (negative) — already inited in MTA
            //
            // S_OK and S_FALSE both increment the per-thread COM
            // refcount and require a matching CoUninitialize. We
            // gate cleanup on `hr >= 0` so we only release a refcount
            // we actually took. RPC_E_CHANGED_MODE means the existing
            // initialisation is fine for our purposes (the OS still
            // dispatches the verb), and we leave its refcount alone.
            let hr = CoInitializeEx(ptr::null(), COINIT_APARTMENTTHREADED as u32);
            let we_inited = hr >= 0;

            // Cleanup helper closures so every error path drops the
            // process handle and the COM refcount in the right order.
            let mut info: SHELLEXECUTEINFOW = mem::zeroed();
            info.cbSize = mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
            info.lpVerb = verb.as_ptr();
            info.lpFile = file.as_ptr();
            info.lpParameters = params_w.as_ptr();
            info.nShow = SW_HIDE;

            let success = ShellExecuteExW(&mut info);
            if success == 0 {
                let last_err = GetLastError();
                if we_inited {
                    CoUninitialize();
                }
                if last_err == ERROR_CANCELLED {
                    return Err(HostsApplyError::Cancelled);
                }
                return Err(HostsApplyError::Io {
                    message: format!(
                        "ShellExecuteExW failed: GetLastError={last_err}; src={src_display}, dst={dst_display}"
                    ),
                });
            }

            // SEE_MASK_NOCLOSEPROCESS guarantees `hProcess` is set
            // when the call succeeds. We defensively guard against a
            // null handle anyway, then synchronously wait for the
            // elevated cmd to terminate.
            let process = info.hProcess;
            if process.is_null() {
                if we_inited {
                    CoUninitialize();
                }
                return Err(HostsApplyError::Io {
                    message: "ShellExecuteExW returned a null process handle".to_string(),
                });
            }

            let wait = WaitForSingleObject(process, INFINITE);
            if wait != WAIT_OBJECT_0 {
                CloseHandle(process);
                if we_inited {
                    CoUninitialize();
                }
                return Err(HostsApplyError::Io {
                    message: format!("WaitForSingleObject returned {wait}"),
                });
            }

            let mut exit_code: u32 = 0;
            let got_exit = GetExitCodeProcess(process, &mut exit_code as *mut u32);
            CloseHandle(process);
            if we_inited {
                CoUninitialize();
            }
            if got_exit == 0 {
                return Err(HostsApplyError::Io {
                    message: "GetExitCodeProcess failed".to_string(),
                });
            }
            // `cmd /c copy` returns 0 on success, 1 on failure.
            // Non-zero is treated as a generic Io failure; the user
            // sees a "fail" code in the renderer rather than a
            // misleading "no_access" branch.
            if exit_code == 0 {
                Ok(())
            } else {
                Err(HostsApplyError::Io {
                    message: format!(
                        "elevated copy failed: cmd /c copy exit code {exit_code}; src={src_display}, dst={dst_display}"
                    ),
                })
            }
        }
    })
    .join();

    match outcome {
        Ok(result) => result,
        Err(_panic) => Err(HostsApplyError::Io {
            message: "elevation worker thread panicked".to_string(),
        }),
    }
}
