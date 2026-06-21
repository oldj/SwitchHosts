//! Structural canaries for window setup that have no behavioural
//! equivalent without spinning up a real Tauri runtime.
//!
//! Lives in `tests/` (integration tests) on purpose: this lets
//! `include_str!` read just `src/lifecycle.rs` without sweeping in
//! the test file itself, which would otherwise satisfy a literal-
//! string `.contains` check and silently defeat the canary.

/// Without `.disable_drag_drop_handler()` Tauri's OS-level drag-drop
/// interception swallows `dragstart` inside the webview, breaking
/// the hosts tree's HTML5 DnD reordering. `WebviewWindowBuilder`
/// exposes no config inspector, so we grep the source.
#[test]
fn main_window_disables_drag_drop_handler() {
    const SOURCE: &str = include_str!("../src/lifecycle.rs");
    assert!(
        SOURCE.contains(".disable_drag_drop_handler()"),
        "create_main_window must call .disable_drag_drop_handler() on the builder"
    );
}

#[test]
fn main_window_starts_hidden_until_geometry_is_restored() {
    const SOURCE: &str = include_str!("../src/lifecycle.rs");
    assert!(
        SOURCE.contains(".visible(false)"),
        "create_main_window must keep the main window hidden until setup decides to show it"
    );
}

#[test]
fn macos_restore_uses_synchronous_native_positioning() {
    const SOURCE: &str = include_str!("../src/lifecycle.rs");
    assert!(
        SOURCE.contains("setFrameTopLeftPoint"),
        "macOS geometry restore must synchronously position NSWindow before first show"
    );
    assert!(
        !SOURCE.contains("CGDisplayPixelsHigh"),
        "macOS geometry restore must derive its native coordinate conversion from Tauri monitor data"
    );
    assert!(
        !SOURCE.contains("CGMainDisplayID"),
        "macOS geometry restore must not derive restored coordinates from the main display id"
    );
}

#[test]
fn setup_waits_for_renderer_ready_before_showing_main_window() {
    const SOURCE: &str = include_str!("../src/lib.rs");
    assert!(
        SOURCE.contains("\"main_window_ready\""),
        "setup must wait for the renderer's first-screen ready event before showing the main window"
    );
    assert!(
        SOURCE.contains("Duration::from_millis(5000)"),
        "setup must have a fallback show timer so a renderer failure cannot leave the app hidden"
    );
}

#[test]
fn setup_skips_main_window_creation_when_hide_at_launch_is_on() {
    const SOURCE: &str = include_str!("../src/lib.rs");

    // Extract the bodies of `if hide_at_launch { ... } else { ... }`
    // by brace-counting, so a future refactor that *keeps the
    // identifier* but moves `create_main_window` into the wrong branch
    // is caught — the previous string-presence check would pass either
    // way and leave the regression invisible.
    let if_body = extract_block_from(SOURCE, "if hide_at_launch")
        .expect("setup must contain an `if hide_at_launch` branch");
    let else_body = extract_block_after(SOURCE, "} else {")
        .expect("the hide_at_launch branch must have a matching `} else {`");

    assert!(
        if_body.contains("enter_hidden_to_tray_state"),
        "hide_at_launch branch must mark the main window as hidden-to-tray so the exit-guard machinery treats subsequent auxiliary-window closes as stay-in-tray"
    );
    assert!(
        !if_body.contains("create_main_window"),
        "hide_at_launch branch must NOT create the main window — the whole point is that the webview process doesn't load until the user explicitly shows it from the tray"
    );
    assert!(
        else_body.contains("create_main_window"),
        "the non-hide_at_launch branch must create the main window so it appears at launch"
    );
    assert!(
        SOURCE.contains("data_dir_recovery.is_none()"),
        "hide_at_launch must be guarded by `data_dir_recovery.is_none()` so an unavailable data directory (gone, or its pointer corrupt) forces the main window (and its recovery dialog) to appear"
    );
}

#[test]
fn data_dir_recovery_gates_fallback_side_effects() {
    const SOURCE: &str = include_str!("../src/lib.rs");
    // While the data directory is unavailable (gone, or its pointer corrupt)
    // we fall back to the default root only to show the recovery dialog. Five
    // startup side effects that would read/write/expose that fallback root
    // stay gated behind `data_dir_recovery.is_none()`: hide_at_launch (force
    // the window so the dialog shows), the tray title, the refresh scanner +
    // HTTP API, the launch_at_login config persist, and the auto-update
    // checker. Catch silently dropping any.
    let guards = SOURCE.matches("data_dir_recovery.is_none()").count();
    assert!(
        guards >= 5,
        "expected >=5 `data_dir_recovery.is_none()` guards in lib.rs setup (hide_at_launch, tray title, background services, launch_at_login persist, auto-update checker); found {guards}"
    );
    assert!(
        SOURCE.contains("start_background_scanner")
            && SOURCE.contains("refresh_title")
            && SOURCE.contains("start_auto_update_checker"),
        "the gated side effects (refresh scanner, tray title, auto-update checker) must still be present"
    );
}

#[test]
fn tray_left_click_funnels_to_main_window_during_recovery() {
    const SOURCE: &str = include_str!("../src/tray.rs");
    let body =
        extract_block_from(SOURCE, "fn handle_left_click").expect("handle_left_click must exist");
    // While the data directory is unavailable (gone, or its pointer corrupt)
    // the tray must not open the mini window (which would load and act on the
    // fallback default data); the click focuses the main window (recovery
    // dialog) instead.
    assert!(
        body.contains("data_dir_recovery"),
        "tray left-click must check data_dir_recovery to avoid bypassing the recovery dialog"
    );
    assert!(
        body.contains("show_main_window"),
        "tray left-click must be able to fall back to focusing the main window"
    );
}

#[test]
fn app_menu_data_actions_are_gated_during_recovery() {
    const SOURCE: &str = include_str!("../src/lib.rs");
    let handler = extract_block_from(SOURCE, "on_menu_event(|app, event|")
        .expect("on_menu_event handler must exist");
    // While the data directory is unavailable (gone, or its pointer corrupt),
    // the app menu must not open windows or act on the fallback default data
    // (Find / New / Preferences / Comment) — those would bypass the recovery
    // dialog. Quit/About stay ok.
    assert!(
        handler.contains("data_dir_recovery.is_some()"),
        "menu handler must detect the data-dir recovery state"
    );
    assert!(
        handler.contains("if in_recovery"),
        "menu handler must gate data-affecting actions on in_recovery"
    );
}

#[test]
fn data_mutating_commands_have_missing_dir_backstop() {
    const SOURCE: &str = include_str!("../src/commands.rs");
    // Every data-mutating command must call the unified
    // `require_data_dir_usable` backstop at its entry — before any file
    // side effect — so a future window/shortcut/invoke path can't slip a
    // write/apply through while the custom data dir is missing. Guarding at
    // the entry (not the persistence layer) is required: e.g. clear_trashcan
    // deletes entry files before it would persist. Guard against removals.
    let calls = SOURCE.matches("require_data_dir_usable()").count();
    assert!(
        calls >= 20,
        "expected >=20 require_data_dir_usable() entry guards in commands.rs (one per data-mutating command, incl. history journals); found {calls}"
    );
}

#[test]
fn macos_main_window_disables_appkit_window_restoration() {
    const SOURCE: &str = include_str!("../src/lifecycle.rs");

    assert!(
        SOURCE.contains("setRestorable: false"),
        "main windows should opt out of AppKit window restoration because SwitchHosts owns its own geometry/state restore"
    );
}

#[test]
fn launch_at_login_keeps_macos_relaunch_policy_in_sync() {
    const LIFECYCLE: &str = include_str!("../src/lifecycle.rs");
    const LIB: &str = include_str!("../src/lib.rs");
    const COMMANDS: &str = include_str!("../src/commands.rs");

    assert!(
        LIFECYCLE.contains("disableRelaunchOnLogin")
            && LIFECYCLE.contains("enableRelaunchOnLogin"),
        "macOS login-start should prevent AppKit's login restoration from launching a second copy, and rebalance that counter if launch_at_login is disabled"
    );
    assert!(
        LIB.contains("apply_launch_at_login_relaunch_policy(&app_handle, launch_at_login)")
            && COMMANDS.contains("apply_launch_at_login_relaunch_policy(app, enabled)"),
        "startup and runtime launch_at_login changes must both keep the macOS relaunch policy in sync"
    );
}

#[test]
fn login_launch_sessions_are_marked_via_autostart_argv() {
    const LIFECYCLE: &str = include_str!("../src/lifecycle.rs");
    const LIB: &str = include_str!("../src/lib.rs");

    assert!(
        LIFECYCLE.contains("pub const LOGIN_LAUNCH_ARG"),
        "lifecycle must define the login-launch argv marker shared by the autostart entry and its consumers"
    );
    assert!(
        LIB.contains("Some(vec![lifecycle::LOGIN_LAUNCH_ARG])"),
        "the autostart plugin must register the login-launch marker so OS login starts are distinguishable from user opens (#997)"
    );
    assert!(
        LIB.contains("std::env::args_os()")
            && LIB.contains("arg.to_str() == Some(lifecycle::LOGIN_LAUNCH_ARG)"),
        "setup must detect the login-launch marker in this process's argv (args_os so non-Unicode argv cannot panic)"
    );
    assert!(
        LIFECYCLE.contains("fn ensure_launch_agent_carries_login_launch_arg")
            && LIB.contains("ensure_launch_agent_carries_login_launch_arg(&app_handle)"),
        "existing users' marker-less LaunchAgent plists must be migrated at startup or the #997 protections never engage for them"
    );
}

#[test]
fn login_launch_grace_window_only_arms_for_hidden_login_sessions() {
    const LIB: &str = include_str!("../src/lib.rs");

    // The grace window must be armed inside the hide_at_launch branch,
    // gated on the login-launch marker — and nowhere else. Arming it in
    // a manual session would reintroduce the "Dock click does nothing"
    // failure that got the earlier blanket time-suppression design
    // rejected; the marker gate is what makes a time window acceptable.
    let if_body = extract_block_from(LIB, "if hide_at_launch")
        .expect("setup must contain an `if hide_at_launch` branch");
    let arm_block = extract_block_from(if_body, "if launched_at_login_session")
        .expect("the hide_at_launch branch must gate grace-window arming on the login-launch session marker");
    assert!(
        arm_block.contains("begin_login_launch_show_suppression"),
        "a hidden login-launched session must arm the login-launch grace window (#997)"
    );
    assert_eq!(
        LIB.matches("begin_login_launch_show_suppression").count(),
        1,
        "the grace window must be armed only from the hidden login-launch path — any other call site risks suppressing real user actions"
    );
}

#[test]
fn second_instance_ignores_duplicate_login_launch_instances() {
    const LIFECYCLE: &str = include_str!("../src/lifecycle.rs");

    let focus_body = extract_block_from(LIFECYCLE, "pub fn focus_main_on_second_instance")
        .expect("lifecycle must define focus_main_on_second_instance");
    assert!(
        focus_body.contains("LOGIN_LAUNCH_ARG"),
        "a duplicate instance carrying the login-launch marker is the login machinery double-starting the app (#997), not a user show request"
    );
    assert!(
        focus_body.contains("show_main_window(app)"),
        "an unmarked second launch is a real user action and must still focus the main window immediately"
    );
    assert!(
        !focus_body.contains("login_launch_show_suppressed"),
        "the second-instance path must not consult the time-based grace window — an unmarked manual relaunch during it must keep working on every platform"
    );
}

#[test]
fn dock_reopen_shows_main_window_unless_in_login_grace_window() {
    const LIFECYCLE: &str = include_str!("../src/lifecycle.rs");
    const LIB: &str = include_str!("../src/lib.rs");

    let reopen_body = extract_block_from(LIFECYCLE, "pub fn show_main_on_reopen")
        .expect("lifecycle must define show_main_on_reopen");
    assert!(
        reopen_body.contains("login_launch_show_suppressed"),
        "macOS reopen must be gated on the login-launch grace window — loginwindow's post-login pings arrive as the same event as a Dock click (#997)"
    );
    assert!(
        reopen_body.contains("show_main_window(app)"),
        "outside the grace window a reopen is a real Dock click and must show the main window"
    );
    assert!(
        LIB.contains("lifecycle::show_main_on_reopen(app_handle)"),
        "the RunEvent::Reopen hook must route through the gated reopen path"
    );

    // Explicit-intent paths must bypass the gate entirely and clear it,
    // so a user summoning the window from the tray is never blocked and
    // ends the grace window for good.
    let show_body = extract_block_from(LIFECYCLE, "pub fn show_main_window<")
        .expect("lifecycle must define show_main_window");
    assert!(
        show_body.contains("clear_login_launch_show_suppression"),
        "show_main_window must clear the login-launch grace window — any explicit show ends it permanently"
    );
    let active_block = extract_block_from(LIB, "app.listen(\"active_main_window\"")
        .expect("setup must listen for active_main_window");
    assert!(
        active_block.contains("show_main_window") && !active_block.contains("show_main_on_reopen"),
        "tray / dialog activation requests are explicit user intent and must not pass through the reopen gate"
    );
}

/// Return the slice of `source` between the `{` at the end of `marker`
/// and its matching `}`, using brace counting that ignores nesting.
/// `marker` must end with `{`; returns `None` if the marker isn't
/// present or the braces don't balance.
fn extract_block_after<'a>(source: &'a str, marker: &str) -> Option<&'a str> {
    assert!(
        marker.ends_with('{'),
        "extract_block_after marker must end with `{{`"
    );
    extract_block_from(source, marker)
}

/// Like `extract_block_after`, but `anchor` need not end with `{`:
/// locate `anchor`, then return the brace-balanced block starting at
/// the next `{`. Handy for pulling a function body out of its
/// signature (which may span several lines of parameters).
fn extract_block_from<'a>(source: &'a str, anchor: &str) -> Option<&'a str> {
    let anchor_pos = source.find(anchor)?;
    let start = anchor_pos + source[anchor_pos..].find('{')? + 1;
    let mut depth: i32 = 1;
    let mut byte_pos = start;
    for ch in source[start..].chars() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&source[start..byte_pos]);
                }
            }
            _ => {}
        }
        byte_pos += ch.len_utf8();
    }
    None
}

#[test]
fn hide_main_window_command_destroys_webview_under_lightweight_mode() {
    // On Windows/Linux the main window is `decorations(false)` and the
    // title-bar close button lives in the renderer (TopBar), routing
    // through the `hide_main_window` command rather than the OS close
    // path macOS gets for free. So the command itself must honour
    // lightweight_mode — regressing it to a plain `hide()` would
    // silently keep the WebView2 / WebKitGTK process resident on those
    // platforms (the macOS-only manual test wouldn't catch it).
    const SOURCE: &str = include_str!("../src/commands.rs");
    let body = extract_block_from(SOURCE, "pub async fn hide_main_window")
        .expect("hide_main_window command must exist");
    assert!(
        body.contains("lightweight_mode"),
        "hide_main_window must read lightweight_mode so the renderer close button respects it"
    );
    // Assert close() lives specifically in the `if lightweight {` branch
    // — not just somewhere in the function body. Swapping the branches
    // (hide under lightweight, close otherwise) would still leave a
    // `window.close()` in the body and pass a whole-function check, yet
    // silently break lightweight mode on Windows/Linux — and macOS never
    // exercises this command (it closes via the NSWindow button), so the
    // manual test wouldn't catch it.
    let lightweight_branch = extract_block_from(SOURCE, "if lightweight {")
        .expect("hide_main_window must branch on `if lightweight {`");
    assert!(
        lightweight_branch.contains("window.close()"),
        "the lightweight branch of hide_main_window must close() (destroy) the window, not hide() it"
    );
}

#[test]
fn lightweight_close_enters_hidden_to_tray_state() {
    // The CloseRequested lightweight branch must record the hide-to-tray
    // state so later auxiliary-window closes stay in the tray, and must
    // NOT prevent_close (the webview has to actually be destroyed).
    //
    // Extract just the `if lightweight { ... }` block rather than
    // scanning the whole file: the same
    // `MAIN_WINDOW_LIGHTWEIGHT_HIDDEN.store(true)` also lives in
    // `enter_hidden_to_tray_state()`, so a whole-file `contains` would
    // still pass even if the close branch's store were deleted.
    const SOURCE: &str = include_str!("../src/lifecycle.rs");
    let branch = extract_block_from(SOURCE, "if lightweight {")
        .expect("CloseRequested must have an `if lightweight {` branch");
    assert!(
        branch.contains("MAIN_WINDOW_LIGHTWEIGHT_HIDDEN.store(true"),
        "the lightweight close branch must set the hide-to-tray flag itself"
    );
    assert!(
        !branch.contains("prevent_close"),
        "the lightweight close branch must NOT prevent_close — the webview has to actually be destroyed"
    );
}

#[test]
fn exit_request_is_guarded_by_lightweight_exit_flag() {
    // ExitRequested must prevent_exit only when a specific close armed
    // the short-lived guard. Tying it to a long-lived flag alone (or to
    // is_will_quit alone) would block Dock → Quit and system shutdown,
    // which share the `code: None` / `is_will_quit == false` shape.
    const SOURCE: &str = include_str!("../src/lib.rs");
    assert!(
        SOURCE.contains("arm_lightweight_exit_guard_if_last_window"),
        "a CloseRequested run-event must arm the lightweight exit guard"
    );
    assert!(
        SOURCE.contains("take_expecting_lightweight_exit") && SOURCE.contains("prevent_exit"),
        "ExitRequested must consume the guard before deciding to prevent_exit"
    );
}

#[test]
fn tray_window_suppresses_focus_loss_right_after_show() {
    // Windows/Linux dismiss the tray popover from its `Focused(false)`
    // event. A freshly shown window flickers focus while the compositor
    // settles; now that dismissal closes (destroys) the window, an
    // unguarded flicker tears it down the instant it opens, looping
    // forever. The suppression window — and stamping it *before*
    // show()/set_focus() — is what keeps the popover openable.
    const SOURCE: &str = include_str!("../src/tray.rs");
    assert!(
        SOURCE.contains("TRAY_FOCUS_LOSS_SUPPRESS_AFTER_SHOW_MS")
            && SOURCE.contains("LAST_TRAY_SHOW_MS"),
        "tray window must keep a post-show focus-loss suppression window"
    );

    // The show timestamp must be stamped before show()/set_focus() so a
    // synchronously-delivered focus loss is already inside the window.
    // Anchor on `<` to avoid matching `show_tray_window_from_tray_click`,
    // which shares the `fn show_tray_window` prefix and appears earlier.
    let show_body =
        extract_block_from(SOURCE, "fn show_tray_window<").expect("show_tray_window must exist");
    let stamp = show_body
        .find("LAST_TRAY_SHOW_MS.store")
        .expect("show_tray_window must stamp LAST_TRAY_SHOW_MS");
    let show_call = show_body
        .find("window.show()")
        .expect("show_tray_window must call window.show()");
    assert!(
        stamp < show_call,
        "LAST_TRAY_SHOW_MS must be stamped before window.show() so the suppression window covers the whole show/focus phase"
    );

    // The Focused(false) handler must actually consult the suppression
    // window and early-return before close() — otherwise the constant
    // and the stamp above would be dead code and a post-show flicker
    // would still destroy the window the instant it opens.
    let handler = extract_block_from(SOURCE, "WindowEvent::Focused(false) = event {")
        .expect("tray window must handle Focused(false) on Windows/Linux");
    let suppress_check = handler
        .find("saturating_sub(last_show) < TRAY_FOCUS_LOSS_SUPPRESS_AFTER_SHOW_MS")
        .expect(
            "the Focused(false) handler must compare elapsed time against the suppression window",
        );
    let close_call = handler
        .find(".close()")
        .expect("the Focused(false) handler must close the window on dismissal");
    assert!(
        suppress_check < close_call,
        "the suppression check must run (and early-return) before close(), or a post-show focus flicker would tear the window down the instant it opens"
    );
}

#[test]
fn find_window_waits_for_renderer_ready_before_showing() {
    const RUST_SOURCE: &str = include_str!("../src/find.rs");
    const FIND_PAGE_SOURCE: &str = include_str!("../../src/renderer/pages/find.tsx");

    assert!(
        RUST_SOURCE.contains("FIND_WINDOW_READY_EVENT"),
        "find window should have a renderer-ready event gate before first show"
    );
    assert!(
        RUST_SOURCE.contains("FIND_GATE"),
        "find window should track its pending-ready state in a per-window gate so close-then-reopen can abandon a stale listener"
    );
    assert!(
        RUST_SOURCE.contains("fn abandon"),
        "FindGate should expose abandon() so a superseded gate cannot show a newer window"
    );
    assert!(
        RUST_SOURCE.contains("app.listen(FIND_WINDOW_READY_EVENT"),
        "find window should wait for the renderer-ready event before first show"
    );
    assert!(
        RUST_SOURCE.contains("app.unlisten(id)"),
        "find window ready listener should be removed after the window is shown or abandoned"
    );
    assert!(
        RUST_SOURCE.contains("FIND_WINDOW_READY_FALLBACK_MS"),
        "find window ready gate should keep a fallback so the window cannot stay hidden forever"
    );
    assert!(
        FIND_PAGE_SOURCE.contains("events.find_window_ready"),
        "find page should emit a ready event after applying its theme"
    );
}

#[test]
fn find_window_uses_transparent_macos_titlebar() {
    const SOURCE: &str = include_str!("../src/find.rs");
    assert!(
        SOURCE.contains("TitleBarStyle::Transparent"),
        "find window should use a transparent macOS titlebar so the themed window background shows through"
    );
}

#[test]
fn find_window_hides_native_menu_on_windows_and_linux() {
    const SOURCE: &str = include_str!("../src/find.rs");
    assert!(
        SOURCE.contains("fn hide_find_window_menu"),
        "find window should keep menu hiding in a dedicated helper"
    );
    assert!(
        SOURCE.contains("not(target_os = \"macos\")") && SOURCE.contains("window.hide_menu()"),
        "find window should hide its native menu bar on Windows/Linux"
    );
}

#[test]
fn quit_on_close_quits_app_from_native_close() {
    // macOS native close button routes through CloseRequested. When the
    // user opts into quit-on-close, that branch must terminate the app
    // (via quit_app) and must NOT prevent_close — the app is exiting.
    const SOURCE: &str = include_str!("../src/lifecycle.rs");
    let branch = extract_block_from(SOURCE, "if quit_on_close {")
        .expect("CloseRequested must have an `if quit_on_close {` branch");
    assert!(
        branch.contains("quit_app"),
        "the quit_on_close close branch must terminate the app via quit_app"
    );
    assert!(
        !branch.contains("prevent_close"),
        "the quit_on_close branch must NOT prevent_close — the app is exiting"
    );
}

#[test]
fn hide_main_window_quits_app_under_quit_on_close() {
    // On Windows/Linux the frameless title-bar close button routes through
    // the hide_main_window command rather than the OS close path, so it
    // must honour quit_on_close too — otherwise the option would silently
    // do nothing on the platforms it primarily targets.
    const SOURCE: &str = include_str!("../src/commands.rs");
    let body = extract_block_from(SOURCE, "pub async fn hide_main_window")
        .expect("hide_main_window command must exist");
    assert!(
        body.contains("quit_on_close"),
        "hide_main_window must read quit_on_close so the renderer close button can quit the app"
    );
}
