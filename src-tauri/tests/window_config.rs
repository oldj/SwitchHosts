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
