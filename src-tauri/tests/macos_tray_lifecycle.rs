//! Opt-in native test, with its own main-thread event loop (no libtest worker).
//! Uses the production lifecycle module, a local blank page and a separate app
//! identifier. Never starts SwitchHosts storage, helpers, menus or hosts writes.

#[cfg(target_os = "macos")]
#[path = "../src/tray/window.rs"]
mod tray_window;

#[cfg(target_os = "macos")]
#[path = "../src/lifecycle/macos_placement.rs"]
mod macos_placement;

#[cfg(target_os = "macos")]
#[path = "macos_tray_lifecycle/main_window_cases.rs"]
mod macos_main_window_cases;

#[cfg(target_os = "macos")]
mod native {
    use super::macos_placement;
    use super::tray_window;
    use objc2::{msg_send, rc::Retained, ClassType, MainThreadOnly};
    use objc2_app_kit::{
        NSPanel, NSPopUpMenuWindowLevel, NSScreen, NSView, NSWindow, NSWindowCollectionBehavior,
        NSWindowStyleMask,
    };
    use objc2_core_graphics::{CGDisplayPixelsHigh, CGMainDisplayID};
    use objc2_foundation::{ns_string, NSObject, NSPoint, NSRect, NSSize};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WindowEvent};

    type TestResult = Result<(), Box<dyn std::error::Error>>;
    const CYCLES: usize = 10;

    fn check(condition: bool, message: &str) -> TestResult {
        if condition {
            Ok(())
        } else {
            Err(message.into())
        }
    }

    fn start_cycle(app: &AppHandle, destroyed: Arc<AtomicBool>, cycle: usize) -> TestResult {
        check(
            app.get_webview_window(tray_window::TRAY_WINDOW_LABEL)
                .is_none(),
            "old Tauri window still registered",
        )?;
        // First five cycles exercise dismissal of the last window (lightweight
        // mode); the next five keep a separate main window alive.
        if cycle == CYCLES / 2 {
            tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .visible(false)
                .build()?;
        }
        // Exercise minimum, content-fitting and capped heights through the real
        // creation/NSPanel path, including recreation with a different list.
        let row_count = [2, 11, 40][cycle % 3];
        let list = vec![serde_json::json!({"type": "local"}); row_count];
        let height = tray_window::initial_height(&list);
        let window = tray_window::create(app, height)?;
        let size = window
            .inner_size()?
            .to_logical::<f64>(window.scale_factor()?);
        check(
            (size.width - 300.0).abs() < 1.0 && (size.height - height).abs() < 1.0,
            "native tray size differs from its content-based initial size",
        )?;
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                destroyed.store(true, Ordering::SeqCst);
            }
        });
        let host = unsafe { Retained::retain(window.ns_window()?.cast::<NSWindow>()) }
            .ok_or("missing Tauri host")?;
        let reclassed: bool = unsafe { msg_send![&*host, isKindOfClass: NSPanel::class()] };
        check(
            !reclassed,
            "Tauri window was reclassified while AppKit may be observing it",
        )?;
        let ns_panel = tray_window::panel::get(&window).ok_or("missing native panel")?;
        let content = ns_panel
            .contentView()
            .ok_or("panel has no webview content")?;
        check(
            content.window().as_deref() == Some(&ns_panel),
            "content is attached to the wrong window",
        )?;
        check(
            !tray_window::is_visible(&window),
            "new tray must start hidden",
        )?;
        check(
            ns_panel
                .styleMask()
                .contains(NSWindowStyleMask::NonactivatingPanel),
            "missing nonactivating style",
        )?;
        check(
            ns_panel.collectionBehavior().contains(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary,
            ),
            "missing fullscreen Space behavior",
        )?;
        check(
            ns_panel.level() == NSPopUpMenuWindowLevel,
            &format!(
                "incorrect tray window level: expected {}, got {}",
                NSPopUpMenuWindowLevel,
                ns_panel.level()
            ),
        )?;
        check(
            ns_panel.canBecomeKeyWindow() && !ns_panel.canBecomeMainWindow(),
            "incorrect key/main window policy",
        )?;
        check(
            ns_panel.isFloatingPanel() && !ns_panel.hidesOnDeactivate(),
            "incorrect floating/deactivation policy",
        )?;
        drop(ns_panel);

        // Full-screen interaction and focus return require a separate app and
        // a settled desktop session; the isolated app's launch activation is
        // not evidence of tray-triggered activation. Test native visibility
        // and configuration here, and keep that interaction in the manual matrix.
        // Exercise the same physical event coordinates as a click near the
        // right edge of each attached display (including negative origins).
        let screens = NSScreen::screens(host.mtm());
        let primary_height = CGDisplayPixelsHigh(CGMainDisplayID()) as f64;
        let screen = screens.objectAtIndex(cycle % screens.len());
        let area = screen.visibleFrame();
        if let Some(main) = app.get_webview_window("main") {
            let native_main = unsafe { Retained::retain(main.ns_window()?.cast::<NSWindow>()) }
                .ok_or("missing native main window")?;
            // Put the hidden main on a different attached display first, as
            // happens when reopening a remembered/previously hidden window.
            let other = screens.objectAtIndex((cycle + 1) % screens.len());
            let other_area = other.visibleFrame();
            native_main.setFrame_display(
                NSRect::new(
                    NSPoint::new(other_area.origin.x + 30.0, other_area.origin.y + 30.0),
                    NSSize::new(500.0, 300.0),
                ),
                false,
            );
            // The menu bar/Dock may have changed since the tray click.
            let captured_area = NSRect::new(
                area.origin,
                NSSize::new(area.size.width, area.size.height - 20.0),
            );
            macos_placement::move_to_screen(&main, captured_area)?;
            check(
                native_main.screen().as_deref() == Some(&screen),
                "main stayed on previous display",
            )?;
            check(
                !main.is_visible()?,
                "placement showed the main before its ready gate",
            )?;
            let frame = native_main.frame();
            check(
                frame.size == NSSize::new(500.0, 300.0),
                "cross-screen move changed normal window size",
            )?;
            // Move away from center; a repeat invocation on this display
            // must keep the user's placement rather than center every time.
            native_main.setFrameOrigin(NSPoint::new(area.origin.x + 20.0, area.origin.y + 20.0));
            let placed = native_main.frame();
            macos_placement::move_to_screen(&main, area)?;
            check(
                native_main.frame() == placed,
                "same-screen invocation moved the main window",
            )?;
            let missing = NSRect::new(NSPoint::new(999999.0, 999999.0), area.size);
            macos_placement::move_to_screen(&main, missing)?;
            check(
                native_main.frame() == placed,
                "disconnected display moved the main window",
            )?;
        }
        let screen_top = screen.frame().origin.y + screen.frame().size.height;
        let scale = screen.backingScaleFactor();
        let icon = tauri::Rect {
            position: tauri::LogicalPosition::new(
                area.origin.x + area.size.width - 22.0,
                primary_height - screen_top,
            )
            .to_physical::<i32>(scale)
            .into(),
            size: tauri::LogicalSize::new(22.0, 24.0)
                .to_physical::<u32>(scale)
                .into(),
        };
        // Supply the event position without moving the system cursor.
        let click_x = area.origin.x + area.size.width - 11.0;
        let click = tauri::LogicalPosition::new(click_x, primary_height - screen_top + 12.0)
            .to_physical::<f64>(scale);
        let anchor = tray_window::panel::status_item_anchor(icon, click, scale)
            .ok_or("missing click anchor")?;
        check(
            anchor.work_area == area && anchor.button.size.width == 22.0,
            "valid button bounds were lost or the event was assigned to the wrong display",
        )?;
        let parked_icon = tauri::Rect {
            position: tauri::PhysicalPosition::new(i32::MAX, i32::MAX).into(),
            ..icon
        };
        let fallback = tray_window::panel::status_item_anchor(parked_icon, click, scale)
            .ok_or("missing fallback anchor")?;
        check(
            fallback.work_area == area && fallback.button.origin.x == click_x,
            "offscreen icon did not fall back to the clicked display",
        )?;
        let top = (screen_top - 24.0).min(area.origin.y + area.size.height);
        tray_window::panel::show(&window, Some(anchor))?;
        check(
            tray_window::is_visible(&window),
            "tray did not become visible",
        )?;
        let first_panel =
            tray_window::panel::get(&window).ok_or("missing panel after first show")?;
        tray_window::panel::show(&window, Some(anchor))?;
        let panel = tray_window::panel::get(&window).ok_or("missing visible panel")?;
        check(
            Retained::as_ptr(&first_panel) == Retained::as_ptr(&panel),
            "repeated show replaced the visible panel",
        )?;
        drop(first_panel);
        let responder = panel
            .firstResponder()
            .and_then(|r| r.downcast::<NSView>().ok());
        check(
            responder.is_some_and(|r| r.isDescendantOf(&content) && *r != *content),
            "keyboard focus did not follow the WebView into the visible panel",
        )?;
        let current_window = app
            .get_webview_window(tray_window::TRAY_WINDOW_LABEL)
            .ok_or("repeated show removed the registered tray window")?;
        check(
            tray_window::is_visible(&current_window),
            "repeated show hid the tray window",
        )?;
        drop(current_window);

        // AppKit can keep a KVO registration across dismissal. Register on
        // the actual visible panel, then remove it after production teardown.
        let observed = content.window().ok_or("missing presentation window")?;
        let frame = observed.frame();
        check(
            (frame.origin.x + frame.size.width - (area.origin.x + area.size.width)).abs() < 1.0
                && (frame.origin.y + frame.size.height - top).abs() < 1.0
                && (frame.size.height - height).abs() < 1.0,
            "visible panel has incorrect placement or height",
        )?;
        check(
            !window.is_visible()?,
            "Tauri host must remain hidden while the panel is visible",
        )?;
        let observer = NSObject::new();
        let key = ns_string!("title");
        let context = std::ptr::null_mut::<std::ffi::c_void>();
        unsafe {
            let _: () = msg_send![&*observed, addObserver: &*observer, forKeyPath: key, options: 0usize, context: context];
        }
        tray_window::close(&window)?;
        unsafe {
            let _: () = msg_send![&*observed, removeObserver: &*observer, forKeyPath: key, context: context];
        }
        check(
            tray_window::panel::get(&window).is_none(),
            "close did not release the panel association",
        )?;
        check(
            host.contentView().as_ref().map(Retained::as_ptr) == Some(Retained::as_ptr(&content)),
            "close did not return the webview content to Tauri",
        )?;
        Ok(())
    }

    pub fn run() {
        // Fail deterministically if window creation, destruction or the event
        // loop stalls; a hung runner must never look like a passing test.
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(30));
            eprintln!("FAIL: tray lifecycle test timed out after 30 seconds");
            std::process::exit(1);
        });
        let app = tauri::Builder::default()
            .build(tauri::generate_context!(
                "tests/fixtures/tray/tauri.conf.json"
            ))
            .expect("create isolated native test app");
        let mut completed = 0;
        let mut waiting = false;
        let mut finished = false;
        let destroyed = Arc::new(AtomicBool::new(false));
        app.run(move |app, event| {
            if finished {
                return;
            }
            if let RunEvent::ExitRequested {
                code: None, api, ..
            } = &event
            {
                // The production app remains resident when its last tray
                // window closes. Reproduce that event-loop behavior here.
                api.prevent_exit();
            }
            if !matches!(event, RunEvent::Ready | RunEvent::MainEventsCleared) {
                return;
            }
            if waiting {
                if !destroyed.load(Ordering::SeqCst)
                    || app
                        .get_webview_window(tray_window::TRAY_WINDOW_LABEL)
                        .is_some()
                {
                    return;
                }
                completed += 1;
                println!("PASS: tray cycle {completed}/{CYCLES}: destroyed and unregistered");
                if completed == CYCLES {
                    if app.get_webview_window("main").is_none() {
                        eprintln!("FAIL: closing tray also removed main window");
                        std::process::exit(1);
                    }
                    finished = true;
                    super::macos_main_window_cases::run(app.clone());
                    return;
                }
                destroyed.store(false, Ordering::SeqCst);
            }
            if let Err(error) = start_cycle(app, destroyed.clone(), completed) {
                eprintln!("FAIL: tray cycle {}: {error}", completed + 1);
                std::process::exit(1);
            }
            waiting = true;
        });
    }
}

#[cfg(target_os = "macos")]
fn main() {
    native::run();
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("macos_tray_lifecycle requires macOS; no native test was run");
}
