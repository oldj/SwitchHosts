//! Window lifecycle plumbing for the v5 main window.
//!
//! Phase 2.A scope:
//!
//! - Persist main window geometry into `internal/state.json` and
//!   restore it on the next launch.
//! - Treat the close button as "hide", the menu Quit / Cmd+Q as
//!   "exit", coordinated through `AppState::is_will_quit`.
//! - Honour `hide_dock_icon` once at startup on macOS.
//!
//! Tray and find window plumbing land in P2.B / P2.D and will reuse
//! the same persistence helpers.

use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    webview::WebviewWindowBuilder, AppHandle, LogicalPosition, LogicalSize, Manager, Monitor,
    Runtime, WebviewUrl, WebviewWindow, WindowEvent,
};

use crate::storage::{
    state::{StateFile, WindowGeometry},
    AppState, StorageError,
};

#[cfg(target_os = "macos")]
use objc2::{msg_send, runtime::AnyObject, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSPoint, NSSize};

/// Minimum interval between two geometry persists driven by
/// Moved/Resized events, in milliseconds. macOS fires these events
/// continuously during a drag (60 Hz), so we coalesce to at most
/// 5 writes per second. CloseRequested / quit_app / ExitRequested
/// all bypass this throttle to guarantee the final position lands.
const GEOMETRY_PERSIST_THROTTLE_MS: u64 = 200;

pub const MAIN_WINDOW_LABEL: &str = "main";

// ---- main-window event handlers --------------------------------------------

/// Install all of the v5 main-window handlers:
///
/// - Moved / Resized: throttled geometry persist so a drag on macOS
///   doesn't hammer state.json at 60 Hz.
/// - CloseRequested: unthrottled persist followed by hide-instead-of-close
///   unless `is_will_quit` has been flipped by `quit_app`.
pub fn install_main_window_handlers<R: Runtime>(window: &WebviewWindow<R>) {
    let window_clone = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let app = window_clone.app_handle().clone();
            let app_state = app.state::<AppState>();
            maybe_persist_window_geometry(&window_clone, app_state.inner());
        }
        WindowEvent::CloseRequested { api, .. } => {
            let app = window_clone.app_handle().clone();
            let app_state = app.state::<AppState>();

            // Unthrottled persist so the final position lands even
            // if the last drag event was within the throttle window.
            persist_window_geometry(&window_clone, app_state.inner());

            if app_state.is_will_quit.load(Ordering::SeqCst) {
                // Real quit path — let Tauri close the window normally.
                return;
            }

            // Default close-button behaviour: hide instead of close.
            api.prevent_close();
            let _ = window_clone.hide();
        }
        _ => {}
    });
}

// ---- geometry persistence --------------------------------------------------

/// Snapshot the window's current outer position + inner size into
/// `internal/state.json`. Failures are logged and swallowed because
/// losing window geometry is annoying but never user-data damaging.
///
/// The caller is responsible for rate-limiting; see
/// `maybe_persist_window_geometry` for the throttled variant used by
/// Moved/Resized handlers.
pub fn persist_window_geometry<R: Runtime>(window: &WebviewWindow<R>, app_state: &AppState) {
    let geometry = match read_geometry(window) {
        Ok(g) => g,
        Err(e) => {
            log::warn!("failed to read main window geometry: {e}");
            return;
        }
    };

    let mut state_file = StateFile::load(&app_state.paths.state_file);
    state_file.window.main = Some(geometry);
    if let Err(e) = state_file.save(&app_state.paths.state_file) {
        log::warn!("failed to persist main window geometry: {e}");
        return;
    }

    // Stamp the last-persist marker so the throttle in
    // `maybe_persist_window_geometry` skips near-duplicates for the
    // next 200 ms.
    app_state
        .last_geometry_persist_ms
        .store(now_ms(), Ordering::Relaxed);
}

/// Throttled wrapper for the Moved/Resized hot path. At most one
/// write every `GEOMETRY_PERSIST_THROTTLE_MS` milliseconds. The
/// CloseRequested / ExitRequested / quit_app paths all bypass this
/// by calling `persist_window_geometry` directly, so the user's final
/// position before exit always lands on disk.
fn maybe_persist_window_geometry<R: Runtime>(window: &WebviewWindow<R>, app_state: &AppState) {
    let now = now_ms();
    let last = app_state.last_geometry_persist_ms.load(Ordering::Relaxed);
    if now.saturating_sub(last) < GEOMETRY_PERSIST_THROTTLE_MS {
        return;
    }
    persist_window_geometry(window, app_state);
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<WindowGeometry, String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let maximized = window.is_maximized().unwrap_or(false);

    let logical_pos: LogicalPosition<f64> = pos.to_logical(scale);
    let logical_size: LogicalSize<f64> = size.to_logical(scale);

    Ok(WindowGeometry {
        x: logical_pos.x.round() as i32,
        y: logical_pos.y.round() as i32,
        width: logical_size.width.round().max(1.0) as u32,
        height: logical_size.height.round().max(1.0) as u32,
        maximized,
    })
}

// ---- main window creation --------------------------------------------------

/// Create the main window programmatically, starting it hidden so any
/// saved geometry can be applied before the compositor gets a visible
/// first frame. We deliberately *don't* declare the main window in
/// `tauri.conf.json` — doing it there means the window is created with
/// the conf-level defaults (centered, default size), and a subsequent
/// `set_position` call from `setup` can't avoid a one-frame flash
/// between the default position and the restored position.
///
/// Called once from `lib.rs::run` inside the Builder's setup hook.
/// Returns the freshly-created main window; the caller installs
/// event handlers on it.
pub fn create_main_window<R: Runtime>(
    app: &AppHandle<R>,
    app_state: &AppState,
) -> Result<WebviewWindow<R>, StorageError> {
    let state = StateFile::load(&app_state.paths.state_file);
    let saved = state.window.main;

    let monitors = app.available_monitors().unwrap_or_default();
    let saved_on_screen = saved
        .as_ref()
        .map(|g| geometry_is_visible_on_monitors(&monitors, g))
        .unwrap_or(false);

    let builder = WebviewWindowBuilder::new(
        app,
        MAIN_WINDOW_LABEL,
        WebviewUrl::App("/".into()),
    )
    .title("SwitchHosts")
    .min_inner_size(300.0, 200.0)
    .resizable(true)
    .visible(false)
    // Without this Tauri's OS-level drag-drop handler swallows
    // dragstart inside the webview, breaking the hosts tree's
    // HTML5 DnD reordering on the frontend.
    .disable_drag_drop_handler();

    #[cfg(target_os = "macos")]
    let mut builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(12.0, 18.0));
    #[cfg(not(target_os = "macos"))]
    let mut builder = builder.decorations(false).shadow(true);

    if saved_on_screen {
        let geom = saved.as_ref().unwrap();
        builder = builder
            .position(geom.x as f64, geom.y as f64)
            .inner_size(geom.width as f64, geom.height as f64);
    } else {
        if saved.is_some() {
            log::info!(
                "saved main window geometry is off-screen — falling back to centered default"
            );
        }
        builder = builder.inner_size(800.0, 480.0).center();
    }

    let window = builder
        .build()
        .map_err(|e| StorageError::Io {
            path: MAIN_WINDOW_LABEL.to_string(),
            reason: e.to_string(),
        })?;

    if let Some(geom) = saved {
        if saved_on_screen {
            apply_restored_geometry_before_show(&window, &geom, &monitors);
            if geom.maximized {
                let _ = window.maximize();
            }
        }
    }

    Ok(window)
}

/// Apply restored geometry while the main window is still hidden.
/// On macOS, Tauri's public `set_position` path queues an async
/// `setFrameTopLeftPoint:` call; `show()` can then win the race and
/// paint one frame on the default screen. Calling AppKit synchronously
/// here keeps the first visible frame on the restored display.
#[cfg(target_os = "macos")]
fn apply_restored_geometry_before_show<R: Runtime>(
    window: &WebviewWindow<R>,
    geom: &WindowGeometry,
    monitors: &[Monitor],
) {
    if MainThreadMarker::new().is_none() {
        log::warn!("cannot synchronously restore main window geometry off the main thread");
        apply_restored_geometry_fallback(window, geom);
        return;
    }

    let ns_window = match window.ns_window() {
        Ok(ptr) => ptr as *mut AnyObject,
        Err(e) => {
            log::warn!("failed to get native main window handle for geometry restore: {e}");
            apply_restored_geometry_fallback(window, geom);
            return;
        }
    };

    let Some((x, y)) =
        macos_top_left_coordinates_from_monitors(geom.x as f64, geom.y as f64, monitors)
    else {
        log::warn!("cannot synchronously restore main window geometry without monitor bounds");
        apply_restored_geometry_fallback(window, geom);
        return;
    };

    let size = NSSize::new(geom.width as f64, geom.height as f64);
    let point = NSPoint::new(x, y);
    unsafe {
        let _: () = msg_send![ns_window, setContentSize: size];
        let _: () = msg_send![ns_window, setFrameTopLeftPoint: point];
    }
}

#[cfg(not(target_os = "macos"))]
fn apply_restored_geometry_before_show<R: Runtime>(
    window: &WebviewWindow<R>,
    geom: &WindowGeometry,
    _monitors: &[Monitor],
) {
    apply_restored_geometry_fallback(window, geom);
}

fn apply_restored_geometry_fallback<R: Runtime>(window: &WebviewWindow<R>, geom: &WindowGeometry) {
    let _ = window.set_size(LogicalSize::new(geom.width as f64, geom.height as f64));
    let _ = window.set_position(LogicalPosition::new(geom.x as f64, geom.y as f64));
}

/// Bounds in the same top-left coordinate space that Tauri/tao's
/// `outer_position` and `set_position` use on macOS. This is not
/// exactly the same as AppKit `NSScreen::frame` points on Retina
/// displays, so keep native restore math tied to this helper.
#[derive(Clone, Copy, Debug, PartialEq)]
struct TauriMonitorBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn tauri_monitor_bounds(monitor: &Monitor) -> Option<TauriMonitorBounds> {
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    tauri_monitor_bounds_from_physical(pos.x, pos.y, size.width, size.height, scale)
}

fn tauri_monitor_bounds_from_physical(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
) -> Option<TauriMonitorBounds> {
    if !scale.is_finite() || scale <= 0.0 {
        return None;
    }

    Some(TauriMonitorBounds {
        x: x as f64 / scale,
        y: y as f64 / scale,
        width: width as f64 / scale,
        height: height as f64 / scale,
    })
}

fn geometry_overlaps_monitor_bounds(bounds: TauriMonitorBounds, geom: &WindowGeometry) -> bool {
    let overlaps_x = (geom.x as f64) < bounds.x + bounds.width
        && ((geom.x as f64) + geom.width as f64) > bounds.x;
    let overlaps_y = (geom.y as f64) < bounds.y + bounds.height
        && ((geom.y as f64) + geom.height as f64) > bounds.y;
    overlaps_x && overlaps_y
}

#[cfg(any(target_os = "macos", test))]
fn primary_tauri_screen_height_from_bounds(bounds: &[TauriMonitorBounds]) -> Option<f64> {
    bounds
        .iter()
        .copied()
        .find(|b| b.x <= 0.0 && 0.0 < b.x + b.width && b.y <= 0.0 && 0.0 < b.y + b.height)
        .map(|b| b.height)
}

#[cfg(target_os = "macos")]
fn primary_tauri_screen_height(monitors: &[Monitor]) -> Option<f64> {
    let bounds = monitors
        .iter()
        .filter_map(tauri_monitor_bounds)
        .collect::<Vec<_>>();
    primary_tauri_screen_height_from_bounds(&bounds)
}

#[cfg(any(target_os = "macos", test))]
fn macos_top_left_coordinates_from_tauri_height(
    x: f64,
    y: f64,
    primary_tauri_height: f64,
) -> (f64, f64) {
    (x, primary_tauri_height - y)
}

#[cfg(target_os = "macos")]
fn macos_top_left_coordinates_from_monitors(
    x: f64,
    y: f64,
    monitors: &[Monitor],
) -> Option<(f64, f64)> {
    primary_tauri_screen_height(monitors)
        .map(|height| macos_top_left_coordinates_from_tauri_height(x, y, height))
}

/// Conservative on-screen check: any monitor whose Tauri-coordinate
/// bounds overlap the saved geometry counts as "visible". Multi-
/// monitor disconnects / DPI changes between launches are the main
/// reason this matters — we don't want to restore a window onto a
/// monitor that's no longer plugged in.
fn geometry_is_visible_on_monitors(monitors: &[Monitor], geom: &WindowGeometry) -> bool {
    monitors
        .iter()
        .filter_map(tauri_monitor_bounds)
        .any(|bounds| geometry_overlaps_monitor_bounds(bounds, geom))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bounds(x: f64, y: f64, width: f64, height: f64) -> TauriMonitorBounds {
        TauriMonitorBounds {
            x,
            y,
            width,
            height,
        }
    }

    fn geometry(x: i32, y: i32, width: u32, height: u32) -> WindowGeometry {
        WindowGeometry {
            x,
            y,
            width,
            height,
            maximized: false,
        }
    }

    #[test]
    fn retina_monitor_bounds_match_tauri_position_units() {
        // tao's macOS MonitorHandle::size() is built from
        // CGDisplay::pixels_wide/high as logical units, then converted
        // to PhysicalSize with the monitor scale factor. After Tauri
        // callers convert it back with that same scale factor, the
        // value matches tao's top-left position height.
        let primary = tauri_monitor_bounds_from_physical(0, 0, 5760, 3600, 2.0)
            .expect("valid monitor scale");

        assert_eq!(primary, bounds(0.0, 0.0, 2880.0, 1800.0));
        assert_eq!(
            primary_tauri_screen_height_from_bounds(&[primary]),
            Some(1800.0)
        );
        assert_eq!(
            macos_top_left_coordinates_from_tauri_height(40.0, 1020.0, primary.height),
            (40.0, 780.0)
        );
    }

    #[test]
    fn macos_restore_keeps_negative_global_y_for_monitor_above_primary() {
        let primary = bounds(0.0, 0.0, 1440.0, 900.0);
        let above = bounds(0.0, -700.0, 1440.0, 700.0);
        let geom = geometry(100, -120, 800, 500);

        assert!(geometry_overlaps_monitor_bounds(above, &geom));
        assert_eq!(
            primary_tauri_screen_height_from_bounds(&[above, primary]),
            Some(900.0)
        );
        assert_eq!(
            macos_top_left_coordinates_from_tauri_height(100.0, -120.0, primary.height),
            (100.0, 1020.0)
        );
    }

    #[test]
    fn macos_restore_keeps_positive_global_y_for_monitor_below_primary() {
        let primary = bounds(0.0, 0.0, 1440.0, 900.0);
        let below = bounds(0.0, 900.0, 1440.0, 700.0);
        let geom = geometry(100, 950, 800, 500);

        assert!(geometry_overlaps_monitor_bounds(below, &geom));
        assert_eq!(
            primary_tauri_screen_height_from_bounds(&[below, primary]),
            Some(900.0)
        );
        assert_eq!(
            macos_top_left_coordinates_from_tauri_height(100.0, 950.0, primary.height),
            (100.0, -50.0)
        );
    }

    #[test]
    fn primary_height_is_none_when_no_monitor_contains_global_origin() {
        let detached = bounds(2000.0, 1000.0, 1440.0, 900.0);

        assert_eq!(primary_tauri_screen_height_from_bounds(&[detached]), None);
    }
}

// ---- macOS dock icon -------------------------------------------------------

/// Honour `hide_dock_icon`. Only meaningful on macOS — switches the
/// app between `Regular` (Dock icon visible, full menu bar) and
/// `Accessory` (no Dock icon, tray-only). Safe to call at runtime
/// because P2.B installed a tray icon as a permanent way to summon
/// the window back.
#[cfg(target_os = "macos")]
pub fn apply_dock_icon_policy<R: Runtime>(app: &AppHandle<R>, hide: bool) {
    let policy = if hide {
        tauri::ActivationPolicy::Accessory
    } else {
        tauri::ActivationPolicy::Regular
    };
    if let Err(e) = app.set_activation_policy(policy) {
        log::warn!("failed to set activation policy: {e}");
    }
}

// ---- single instance handler -----------------------------------------------

/// Callback registered with `tauri-plugin-single-instance`. A second
/// invocation of SwitchHosts focuses the existing main window instead
/// of creating a duplicate.
pub fn focus_main_on_second_instance<R: Runtime>(app: &AppHandle<R>, _args: Vec<String>, _cwd: String) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// ---- run-event hook for Cmd+Q / system shutdown ---------------------------

/// Hook registered with `app.run` so that geometry is persisted on
/// every exit-request path, even the ones that bypass our explicit
/// quit_app command (Cmd+Q on macOS, log-off / shutdown sequences).
pub fn persist_on_exit_requested<R: Runtime>(app: &AppHandle<R>) {
    let app_state = app.state::<AppState>();
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        persist_window_geometry(&window, app_state.inner());
    }
}
