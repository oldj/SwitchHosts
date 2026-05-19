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
