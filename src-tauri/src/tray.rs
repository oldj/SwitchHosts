//! System tray for the v5 main app.
//!
//! Phase 2.B.1 scope:
//!
//! - Tray icon present on every platform. macOS uses the template
//!   variant so the OS recolours it for light/dark menu bars.
//! - Right-click (or any-click on Linux) opens a context menu with a
//!   main-window item, a disabled version label, an optional macOS-only
//!   Dock toggle, and a quit item.
//! - Left-click on macOS/Windows shows the main window directly. The
//!   tray mini-window (`/tray` route) is deferred to P2.B.2.
//! - `update_tray_title` command (in commands.rs) walks the manifest
//!   and sets the tray title text on macOS, mirroring Electron's
//!   `show_title_on_tray` behaviour.
//!
//! Tray menu ids start with `tray-` so the global `on_menu_event`
//! handler in `lib.rs` can route them in the same dispatch table as
//! `popup_menu_item_*` events.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::image::Image;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::WebviewWindowBuilder;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, Rect as TauriRect, Runtime, WebviewUrl,
};

use crate::i18n::menu_labels;
use crate::lifecycle;
use crate::storage::{manifest::Manifest, AppState, StorageError};

pub const TRAY_ID: &str = "main-tray";
pub const TRAY_WINDOW_LABEL: &str = "tray";

const TRAY_WINDOW_WIDTH: f64 = 300.0;
const TRAY_WINDOW_HEIGHT: f64 = 600.0;

/// Click-toggle dedupe window, in milliseconds.
///
/// Some platforms can deliver a tray-window auto-hide before the tray
/// icon's click handler when the user clicks the icon while the mini
/// window is open. Without this dedupe, the auto-hide path hides the
/// window and the click handler immediately shows it again — turning a
/// "click to dismiss" into a no-op flicker. Recording the auto-hide
/// timestamp and skipping `show` when the click arrives within this
/// window gives us toggle semantics.
const TRAY_TOGGLE_DEDUPE_MS: u64 = 300;

/// macOS can deliver the status-item mouse-down to our global
/// click-outside monitor after the tray click handler has already
/// scheduled or shown the mini window. Suppress global auto-hide for a
/// very short window after an icon-triggered show so the opening click
/// can't immediately dismiss the window it just requested, while still
/// allowing an intentional outside click right after opening to close it.
#[cfg(target_os = "macos")]
const TRAY_GLOBAL_HIDE_SUPPRESS_AFTER_ICON_CLICK_MS: u64 = 150;

/// Windows/Linux dismiss the tray mini window from its `Focused(false)`
/// event. A freshly shown window briefly loses then regains focus while
/// the compositor settles — and because the triggering click lands on
/// the tray icon rather than the window, that settle can deliver a
/// spurious focus-loss the instant the window appears. When dismissal
/// only hid the window this was self-correcting (the next click re-
/// showed it), but now that dismissal *closes* (destroys) the window it
/// would tear the window down the moment it opens, looping forever.
/// Ignore focus loss for a short window after an icon-triggered show.
/// Mirrors macOS's `TRAY_GLOBAL_HIDE_SUPPRESS_AFTER_ICON_CLICK_MS`.
#[cfg(not(target_os = "macos"))]
const TRAY_FOCUS_LOSS_SUPPRESS_AFTER_SHOW_MS: u64 = 250;

/// Wall-clock millis of the last auto-hide of the tray window. 0 means
/// "never". `AtomicU64` keeps it lock-free and safe to read/write from
/// any thread.
static LAST_TRAY_AUTO_HIDE_MS: AtomicU64 = AtomicU64::new(0);

/// Wall-clock millis of the last tray-icon click that requested a
/// mini-window show. Used only to dedupe macOS global-monitor events
/// from the same physical click.
#[cfg(target_os = "macos")]
static LAST_TRAY_ICON_SHOW_CLICK_MS: AtomicU64 = AtomicU64::new(0);

/// Wall-clock millis of the last tray mini-window show on Windows/Linux.
/// Drives the post-show focus-loss suppression described on
/// `TRAY_FOCUS_LOSS_SUPPRESS_AFTER_SHOW_MS`.
#[cfg(not(target_os = "macos"))]
static LAST_TRAY_SHOW_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub const MENU_ID_SHOW_MAIN: &str = "tray-show-main";
pub const MENU_ID_VERSION: &str = "tray-version";
#[cfg(target_os = "macos")]
pub const MENU_ID_TOGGLE_DOCK: &str = "tray-toggle-dock";
pub const MENU_ID_QUIT: &str = "tray-quit";

const TRAY_MAC_ICON: &[u8] = include_bytes!("../icons/tray-mac.png");
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

const VERSION_LABEL: &str = env!("SWH_VERSION_LABEL");

/// Build and install the system tray. Called once from `lib.rs::run`
/// inside the Builder's setup hook, after the main window exists.
pub fn install_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), tauri::Error> {
    let icon = load_icon();
    let menu = build_menu(app)?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("SwitchHosts");

    // Linux GTK status icons don't deliver discrete click events the
    // way macOS / Windows do — the only reliable interaction surface
    // is the menu. So we let the menu open on every click on Linux,
    // and use the click handler for "left click → show main window
    // or mini window" on the other two platforms.
    #[cfg(not(target_os = "linux"))]
    let builder = builder
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                rect,
                ..
            } = event
            {
                handle_left_click(tray.app_handle(), position, rect);
            }
        });

    builder.build(app)?;

    #[cfg(target_os = "macos")]
    install_dismiss_monitors(app);

    Ok(())
}

fn handle_left_click<R: Runtime + 'static>(
    app: &AppHandle<R>,
    cursor: PhysicalPosition<f64>,
    icon_rect: TauriRect,
) {
    let mini_enabled = {
        let state = app.state::<AppState>();
        state
            .config
            .lock()
            .map(|cfg| cfg.tray_mini_window)
            .unwrap_or(false)
    };
    if mini_enabled {
        // Toggle semantics: a click on the icon while the mini window
        // is open should dismiss it. Tray icon clicks and auto-hide
        // paths can interleave differently across platforms, so handle
        // both:
        //
        //   (a) the tray window is still visible here; hide it
        //       explicitly.
        //   (b) an auto-hide path already hid it and stamped
        //       LAST_TRAY_AUTO_HIDE_MS; skip re-showing so the
        //       dismissal sticks.
        if let Some(window) = app.get_webview_window(TRAY_WINDOW_LABEL) {
            if window.is_visible().unwrap_or(false) {
                // Destroy rather than hide so the webview process is
                // released; `show_tray_window` lazy-recreates the window
                // on the next icon click.
                let _ = window.close();
                return;
            }
        }
        let last_hide = LAST_TRAY_AUTO_HIDE_MS.load(Ordering::Relaxed);
        if last_hide != 0 && now_ms().saturating_sub(last_hide) < TRAY_TOGGLE_DEDUPE_MS {
            return;
        }
        show_tray_window_from_tray_click(app, cursor, icon_rect);
    } else {
        show_main_window(app);
    }
}

fn show_tray_window_from_tray_click<R: Runtime + 'static>(
    app: &AppHandle<R>,
    cursor: PhysicalPosition<f64>,
    icon_rect: TauriRect,
) {
    #[cfg(target_os = "macos")]
    {
        LAST_TRAY_ICON_SHOW_CLICK_MS.store(now_ms(), Ordering::Relaxed);
        let app_for_show = app.clone();
        if let Err(e) = app.run_on_main_thread(move || {
            if let Err(e) = show_tray_window(&app_for_show, cursor, icon_rect) {
                log::warn!("failed to show mini window: {e}");
            }
        }) {
            log::warn!("failed to schedule mini window show: {e}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Err(e) = show_tray_window(app, cursor, icon_rect) {
            log::warn!("failed to show mini window: {e}");
        }
    }
}

fn load_icon() -> Image<'static> {
    let bytes = if cfg!(target_os = "macos") {
        TRAY_MAC_ICON
    } else {
        TRAY_ICON
    };
    Image::from_bytes(bytes).expect("tray icon bytes are bundled at compile time")
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let labels = menu_labels(app);
    let show_main =
        MenuItemBuilder::with_id(MENU_ID_SHOW_MAIN, labels.show_main_window).build(app)?;
    let version = MenuItemBuilder::with_id(MENU_ID_VERSION, VERSION_LABEL)
        .enabled(false)
        .build(app)?;
    let quit = MenuItemBuilder::with_id(MENU_ID_QUIT, labels.quit).build(app)?;

    let menu_builder = MenuBuilder::new(app)
        .item(&show_main)
        .item(&version)
        .separator();

    #[cfg(target_os = "macos")]
    let menu_builder = {
        let hide_dock = read_hide_dock_icon(app);
        let label = if hide_dock {
            labels.show_dock_icon
        } else {
            labels.hide_dock_icon
        };
        let toggle = MenuItemBuilder::with_id(MENU_ID_TOGGLE_DOCK, label).build(app)?;
        menu_builder.item(&toggle).separator()
    };

    menu_builder.item(&quit).build()
}

#[cfg(target_os = "macos")]
fn read_hide_dock_icon<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<AppState>();
    state
        .config
        .lock()
        .map(|cfg| cfg.hide_dock_icon)
        .unwrap_or(false)
}

// ---- menu event dispatch ---------------------------------------------------

/// Called from the global `on_menu_event` handler in `lib.rs` when an
/// id starts with `tray-`. Returns `true` if the id was handled here.
pub fn handle_menu_event<R: Runtime + 'static>(app: &AppHandle<R>, id: &str) -> bool {
    match id {
        MENU_ID_SHOW_MAIN => {
            show_main_window(app);
            true
        }
        MENU_ID_QUIT => {
            quit_app(app);
            true
        }
        #[cfg(target_os = "macos")]
        MENU_ID_TOGGLE_DOCK => {
            toggle_dock_icon(app);
            true
        }
        // The version label is disabled, but the OS still surfaces a
        // click event for it on some platforms — swallow it silently.
        MENU_ID_VERSION => true,
        _ => false,
    }
}

fn show_main_window<R: Runtime + 'static>(app: &AppHandle<R>) {
    lifecycle::show_main_window(app);
}

fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    lifecycle::quit_app(app);
}

#[cfg(target_os = "macos")]
fn toggle_dock_icon<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    // Serialize with `commit_config_patch` writers — without this guard
    // a concurrent Preferences toggle racing this tray click can both
    // observe the same `cfg`, flip it, and clobber each other's save.
    let _commit_guard = match state.config_write_lock.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let new_value = {
        let mut cfg = match state.config.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        cfg.hide_dock_icon = !cfg.hide_dock_icon;
        cfg.hide_dock_icon
    };
    if let Err(e) = state.persist_config() {
        log::warn!("failed to persist hide_dock_icon: {e}");
    }
    lifecycle::apply_dock_icon_policy(app, new_value);
    refresh_menu(app);
    if let Err(e) = app.emit(
        "config_updated",
        json!({ "_args": [{ "hide_dock_icon": new_value }] }),
    ) {
        log::warn!("failed to emit hide_dock_icon config update: {e}");
    }
}

/// Rebuild and reattach the tray menu. Cheap — only a few items.
/// Called whenever an item label depends on config that just changed.
pub fn refresh_menu<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                log::warn!("failed to set tray menu: {e}");
            }
        }
        Err(e) => {
            log::warn!("failed to rebuild tray menu: {e}");
        }
    }
}

// ---- title --------------------------------------------------------------

/// Compute and apply the tray title from the current manifest + config.
pub fn refresh_title<R: Runtime>(app: &AppHandle<R>, state: &AppState) -> Result<(), StorageError> {
    let show = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.show_title_on_tray
    };
    let manifest = Manifest::load(&state.paths)?;
    let title = compute_tray_title(&manifest.root, show);
    set_tray_title(app, title.as_deref());
    Ok(())
}

/// Compute the tray title text from the manifest list, mirroring
/// `src/main/actions/updateTrayTitle.ts`. Returns `None` when
/// `show_title_on_tray` is false (caller should clear the title).
pub fn compute_tray_title(list: &[serde_json::Value], show: bool) -> Option<String> {
    if !show {
        return None;
    }
    let mut titles: Vec<String> = Vec::new();
    collect_on_titles(list, &mut titles);
    let mut joined = titles.join(",");
    if joined.chars().count() > 20 {
        let truncated: String = joined.chars().take(17).collect();
        joined = format!("{truncated}...");
    }
    Some(joined)
}

fn collect_on_titles(nodes: &[serde_json::Value], out: &mut Vec<String>) {
    for node in nodes {
        let on = node
            .get("on")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        if on {
            if let Some(title) = node.get("title").and_then(serde_json::Value::as_str) {
                out.push(title.to_string());
            }
        }
        if let Some(children) = node.get("children").and_then(serde_json::Value::as_array) {
            collect_on_titles(children, out);
        }
    }
}

fn title_for_tray_api(title: Option<&str>) -> &str {
    title.unwrap_or("")
}

/// Apply a freshly-computed title to the tray icon. Safe to call from
/// anywhere — does nothing if the tray hasn't been installed yet.
pub fn set_tray_title<R: Runtime>(app: &AppHandle<R>, title: Option<&str>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let title = title_for_tray_api(title);
        if let Err(e) = tray.set_title(Some(title)) {
            log::warn!("failed to set tray title: {e}");
        }
    }
}

// ---- mini window (`/tray` route) ------------------------------------------

/// Show the mini tray window. Lazy-creates the window on first call,
/// computes a position next to the tray icon, and brings it forward.
/// Subsequent calls reuse the existing webview.
fn show_tray_window<R: Runtime>(
    app: &AppHandle<R>,
    cursor: PhysicalPosition<f64>,
    icon_rect: TauriRect,
) -> Result<(), String> {
    let window = match app.get_webview_window(TRAY_WINDOW_LABEL) {
        Some(w) => w,
        None => create_tray_window(app).map_err(|e| e.to_string())?,
    };

    if let Some(physical_pos) = compute_position(app, cursor, icon_rect) {
        window
            .set_position(physical_pos)
            .map_err(|e| e.to_string())?;
    }

    // On macOS, avoid Tauri's `set_focus()` because it unconditionally
    // activates the whole app and can surface the main window. If the
    // app is inactive, though, the tray window must activate the app or
    // it remains a painted-but-not-interactive window that disappears
    // as soon as the pointer leaves the status item. Activate only in
    // that inactive case, then make the tray window key.
    #[cfg(target_os = "macos")]
    {
        use objc2::{class, msg_send, runtime::AnyObject};
        let ns_window = window.ns_window().map_err(|e| e.to_string())? as *mut AnyObject;
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let app_is_active: bool = msg_send![ns_app, isActive];
            if !app_is_active {
                let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
            }
            let _: () = msg_send![ns_window, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Stamp the show *before* show()/set_focus() so the suppression
        // window already covers the whole display+focus phase. If the
        // compositor delivers a transient Focused(false) synchronously
        // during these calls (or before the post-call store lands), the
        // handler would otherwise still read a stale timestamp — 0 on the
        // first show — fall through the suppression check, and destroy the
        // window the instant it appears.
        LAST_TRAY_SHOW_MS.store(now_ms(), Ordering::Relaxed);
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn create_tray_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    // The renderer's HashRouter mounts /tray at `#/tray`. WebviewUrl::App
    // joins its argument into the app base URL via `Url::join`, which
    // treats `#/tray` as setting the fragment — so the resulting webview
    // URL is `<base>/#/tray`, exactly what HashRouter expects.
    let url = WebviewUrl::App("#/tray".into());
    let window = WebviewWindowBuilder::new(app, TRAY_WINDOW_LABEL, url)
        .title("SwitchHosts Tray")
        .inner_size(TRAY_WINDOW_WIDTH, TRAY_WINDOW_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .visible(false)
        .shadow(true)
        .build()?;

    #[cfg(not(target_os = "macos"))]
    {
        let window_for_handler = window.clone();
        window.on_window_event(move |event| {
            // Close (destroy) on focus loss so the popover behaves like
            // a real tray mini-window: click outside → it disappears
            // and its webview process is released.
            if let tauri::WindowEvent::Focused(false) = event {
                // Ignore the focus flicker that fires right after an
                // icon-triggered show (see
                // TRAY_FOCUS_LOSS_SUPPRESS_AFTER_SHOW_MS) — closing here
                // would destroy the window the instant it opens and loop.
                let last_show = LAST_TRAY_SHOW_MS.load(Ordering::Relaxed);
                if last_show != 0
                    && now_ms().saturating_sub(last_show) < TRAY_FOCUS_LOSS_SUPPRESS_AFTER_SHOW_MS
                {
                    return;
                }
                // Only stamp the auto-hide timestamp + call close when the
                // window is still visible -- otherwise this is the trailing
                // blur from a close we already performed in
                // handle_left_click, and re-stamping would freeze the next
                // click out of show via the dedupe window.
                if window_for_handler.is_visible().unwrap_or(false) {
                    LAST_TRAY_AUTO_HIDE_MS.store(now_ms(), Ordering::Relaxed);
                    let _ = window_for_handler.close();
                }
            }
        });
    }

    Ok(window)
}

/// Compute the mini window's position so it sits flush against the
/// tray icon, clamped inside the active monitor's work area.
///
/// All math runs in **physical pixels**:
///
/// 1. We can't use `app.monitor_from_point(cursor.x, cursor.y)` on
///    macOS — under the hood tao calls `CGRectContainsPoint` against
///    `CGDisplayBounds`, which is in **logical** Cocoa points, but
///    `cursor` and `icon_rect` from the tray-icon crate are already
///    multiplied by the status item window's `backingScaleFactor`.
///    On any Retina mac the cursor coords are ~2× too large, so the
///    lookup misses every display and falls back to the primary
///    monitor — which made the mini window pop up on the wrong screen
///    when the user clicked the tray icon on a secondary display.
///    Instead we iterate `available_monitors()` and pick the one whose
///    own physical `(position, size)` rect (in the same Tauri-physical
///    coord frame as `cursor`) contains the cursor.
///
/// 2. We pass `set_position` a `PhysicalPosition` rather than a
///    `LogicalPosition` so Tauri doesn't apply yet another scale
///    conversion using the window's *current* monitor.
///
/// macOS / Windows: tray icon physical rect is reliable, so we anchor
/// the window to the icon centre on the X axis and either above or
/// below it on the Y axis depending on which half of the screen the
/// icon lives in. Linux GTK status icons don't deliver useful rects,
/// but we're not in this code path on Linux today (Linux uses the
/// menu only).
///
/// Returns `None` if no monitor information is available; the caller
/// should fall back to whatever position the window already had.
fn compute_position<R: Runtime>(
    app: &AppHandle<R>,
    cursor: PhysicalPosition<f64>,
    icon_rect: TauriRect,
) -> Option<PhysicalPosition<f64>> {
    let monitor = pick_monitor_for_cursor(app, cursor, icon_rect)?;

    let scale = monitor.scale_factor();
    let work_area = monitor.work_area();
    let work_x = work_area.position.x as f64;
    let work_y = work_area.position.y as f64;
    let work_w = work_area.size.width as f64;
    let work_h = work_area.size.height as f64;

    let icon_phys_pos = icon_rect.position.to_physical::<f64>(scale);
    let icon_phys_size = icon_rect.size.to_physical::<f64>(scale);
    let icon_x = icon_phys_pos.x;
    let icon_y = icon_phys_pos.y;
    let icon_w = icon_phys_size.width;
    let icon_h = icon_phys_size.height;

    // The 300×600 design size is in logical units; scale to this
    // monitor's physical pixels so the math below stays consistent.
    let win_w = TRAY_WINDOW_WIDTH * scale;
    let win_h = TRAY_WINDOW_HEIGHT * scale;

    // X: centre under the icon
    let mut x = icon_x + icon_w / 2.0 - win_w / 2.0;
    if x < work_x {
        x = work_x;
    }
    if x + win_w > work_x + work_w {
        x = work_x + work_w - win_w;
    }

    // Y: below the icon if the icon is in the top half of the screen
    // (macOS menu bar at top), otherwise above (Windows taskbar at
    // bottom is the common case).
    let icon_centre_y = icon_y + icon_h / 2.0;
    let monitor_centre_y = work_y + work_h / 2.0;
    let mut y = if icon_centre_y < monitor_centre_y {
        icon_y + icon_h
    } else {
        icon_y - win_h - 2.0 * scale
    };
    if y < work_y {
        y = work_y;
    }
    if y + win_h > work_y + work_h {
        y = work_y + work_h - win_h;
    }

    Some(PhysicalPosition::new(x, y))
}

/// Find the monitor that contains the tray click. We can't use
/// `app.monitor_from_point` on macOS (it expects logical Quartz points
/// but the tray-icon crate hands us physical pixels), so we iterate
/// `available_monitors()` ourselves and check the cursor against each
/// monitor's full bounds. If the cursor doesn't land inside any
/// monitor (it can sit a hair outside on the menu bar's very top
/// edge), we fall back to the icon-centre, then the primary monitor.
fn pick_monitor_for_cursor<R: Runtime>(
    app: &AppHandle<R>,
    cursor: PhysicalPosition<f64>,
    icon_rect: TauriRect,
) -> Option<Monitor> {
    let monitors = app.available_monitors().ok()?;

    let contains = |m: &Monitor, x: f64, y: f64| {
        let pos = m.position();
        let size = m.size();
        let mx = pos.x as f64;
        let my = pos.y as f64;
        let mw = size.width as f64;
        let mh = size.height as f64;
        x >= mx && x < mx + mw && y >= my && y < my + mh
    };

    if let Some(m) = monitors.iter().find(|m| contains(m, cursor.x, cursor.y)) {
        return Some(m.clone());
    }

    // The icon rect from tray-icon is already physical, in the same
    // coord frame as the monitors. Centre of the icon is a safer probe
    // than the cursor when the click lands on the very top edge.
    let icon_phys_pos = icon_rect.position.to_physical::<f64>(1.0);
    let icon_phys_size = icon_rect.size.to_physical::<f64>(1.0);
    let icon_cx = icon_phys_pos.x + icon_phys_size.width / 2.0;
    let icon_cy = icon_phys_pos.y + icon_phys_size.height / 2.0;
    if let Some(m) = monitors.iter().find(|m| contains(m, icon_cx, icon_cy)) {
        return Some(m.clone());
    }

    app.primary_monitor().ok().flatten()
}

// ---- macOS click-outside dismiss ------------------------------------------
//
// Tauri's `Focused(false)` event is unreliable as a click-outside signal
// for the tray window when the main window is also visible: the tray
// often never actually becomes the key window in that case (Cocoa keeps
// key on the previously-key window of the same app, or set_focus races
// with status-item activation), so resignKey notifications never fire
// and the existing focus-loss handler stays inert.
//
// Instead, register `NSEvent` global + local mouse-down monitors and
// dismiss the tray ourselves whenever a click lands outside its bounds.
// This bypasses the focus path entirely and works regardless of which
// window currently holds key status.
//
// Both monitors are installed once at app boot and live for the app's
// lifetime; their handlers no-op when the tray window isn't visible.

#[cfg(target_os = "macos")]
fn install_dismiss_monitors<R: Runtime>(app: &AppHandle<R>) {
    use std::sync::OnceLock;

    use block2::RcBlock;
    use objc2::{class, msg_send, runtime::AnyObject};

    static INSTALLED: OnceLock<()> = OnceLock::new();
    if INSTALLED.set(()).is_err() {
        return;
    }

    // NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown |
    // NSEventMaskOtherMouseDown — covers all mouse buttons.
    const MASK: u64 = (1 << 1) | (1 << 3) | (1 << 5);

    // Global monitor: clicks anywhere outside our app — other apps,
    // the desktop, the menu bar (incl. the tray icon itself).
    let app_for_global = app.clone();
    let global_block = RcBlock::new(move |_event: *mut AnyObject| {
        hide_tray_if_visible_unless_recent_icon_show(&app_for_global);
    });

    // Local monitor: clicks inside our app — fires for the tray window
    // too, so check the click's NSWindow against the tray's and only
    // dismiss when the click landed on a different window (e.g. the
    // main window).
    let app_for_local = app.clone();
    let local_block = RcBlock::new(move |event: *mut AnyObject| -> *mut AnyObject {
        unsafe {
            let click_window: *mut AnyObject = msg_send![event, window];
            let tray_ns = app_for_local
                .get_webview_window(TRAY_WINDOW_LABEL)
                .and_then(|w| w.ns_window().ok())
                .unwrap_or(std::ptr::null_mut());
            let click_ptr = click_window as *mut std::ffi::c_void;
            if !click_ptr.is_null() && click_ptr != tray_ns {
                hide_tray_if_visible(&app_for_local);
            }
        }
        // Returning the event passes it through to its target unchanged;
        // returning nil here would swallow the click.
        event
    });

    unsafe {
        let cls = class!(NSEvent);
        let _: *mut AnyObject = msg_send![
            cls,
            addGlobalMonitorForEventsMatchingMask: MASK,
            handler: &*global_block,
        ];
        let _: *mut AnyObject = msg_send![
            cls,
            addLocalMonitorForEventsMatchingMask: MASK,
            handler: &*local_block,
        ];
    }

    // Cocoa keeps the monitors alive but only borrows the blocks; if we
    // drop them the next click crashes the app. Leak them — install
    // runs once per process, so this is bounded.
    std::mem::forget(global_block);
    std::mem::forget(local_block);
}

#[cfg(target_os = "macos")]
fn hide_tray_if_visible_unless_recent_icon_show<R: Runtime>(app: &AppHandle<R>) {
    let last_icon_show = LAST_TRAY_ICON_SHOW_CLICK_MS.load(Ordering::Relaxed);
    if last_icon_show != 0
        && now_ms().saturating_sub(last_icon_show) < TRAY_GLOBAL_HIDE_SUPPRESS_AFTER_ICON_CLICK_MS
    {
        return;
    }
    hide_tray_if_visible(app);
}

#[cfg(target_os = "macos")]
fn hide_tray_if_visible<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tray) = app.get_webview_window(TRAY_WINDOW_LABEL) {
        if tray.is_visible().unwrap_or(false) {
            LAST_TRAY_AUTO_HIDE_MS.store(now_ms(), Ordering::Relaxed);
            // Destroy rather than hide so the webview process is
            // released; the next tray click recreates it via
            // `show_tray_window`.
            let _ = tray.close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compute_tray_title_returns_none_when_hidden() {
        let list = vec![json!({
            "title": "Development",
            "on": true,
        })];

        assert_eq!(compute_tray_title(&list, false), None);
    }

    #[test]
    fn compute_tray_title_collects_enabled_titles_including_nested_nodes() {
        let list = vec![
            json!({
                "title": "Dev",
                "on": true,
            }),
            json!({
                "title": "Folder",
                "on": false,
                "children": [
                    {
                        "title": "Alpha",
                        "on": true,
                    },
                    {
                        "title": "Beta",
                        "on": false,
                    }
                ],
            }),
            json!({
                "title": "API",
                "on": true,
            }),
        ];

        assert_eq!(
            compute_tray_title(&list, true).as_deref(),
            Some("Dev,Alpha,API")
        );
    }

    #[test]
    fn compute_tray_title_truncates_long_titles_to_twenty_chars() {
        let list = vec![json!({
            "title": "123456789012345678901",
            "on": true,
        })];

        assert_eq!(
            compute_tray_title(&list, true).as_deref(),
            Some("12345678901234567...")
        );
    }

    #[test]
    fn title_for_tray_api_clears_missing_title_with_empty_string() {
        assert_eq!(title_for_tray_api(None), "");
        assert_eq!(title_for_tray_api(Some("Development")), "Development");
    }
}
