//! Opt-in native test, with its own main-thread event loop (no libtest worker).
//! Uses the production lifecycle module, a local blank page and a separate app
//! identifier. Never starts SwitchHosts storage, helpers, menus or hosts writes.

#[cfg(target_os = "macos")]
#[path = "../src/tray/window.rs"]
mod tray_window;

#[cfg(target_os = "macos")]
mod native {
    use super::tray_window;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WindowEvent};
    use tauri_nspanel::{
        objc2::{msg_send, runtime::AnyObject, ClassType},
        objc2_app_kit::{NSPanel, NSWindowCollectionBehavior, NSWindowStyleMask},
        ManagerExt, PanelLevel,
    };

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
        check(
            app.get_webview_panel(tray_window::TRAY_WINDOW_LABEL)
                .is_err(),
            "old panel still registered",
        )?;
        check(
            tray_window::show(app).is_err(),
            "showing a missing panel must fail",
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
        let native_window = window.ns_window()? as *mut AnyObject;
        let panel = app
            .get_webview_panel(tray_window::TRAY_WINDOW_LABEL)
            .map_err(|_| "new panel was not registered")?;
        let ns_panel = panel.as_panel();
        check(!window.is_visible()?, "new tray must start hidden")?;
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
            ns_panel.level() == PanelLevel::PopUpMenu.value() as isize,
            &format!(
                "incorrect tray window level: expected {}, got {}",
                PanelLevel::PopUpMenu.value(),
                ns_panel.level()
            ),
        )?;
        check(
            panel.can_become_key_window() && !panel.can_become_main_window(),
            "incorrect key/main window policy",
        )?;
        check(
            panel.is_floating_panel() && !panel.hides_on_deactivate(),
            "incorrect floating/deactivation policy",
        )?;
        // Do not keep an extra panel retain across teardown: that could mask
        // lifecycle bugs in the production close path.
        drop(panel);

        // Full-screen interaction and focus return require a separate app and
        // a settled desktop session; the isolated app's launch activation is
        // not evidence of tray-triggered activation. Test native visibility
        // and configuration here, and keep that interaction in the manual matrix.
        tray_window::show(app)?;
        check(window.is_visible()?, "tray did not become visible")?;
        tray_window::show(app)?;
        let current_window = app
            .get_webview_window(tray_window::TRAY_WINDOW_LABEL)
            .ok_or("repeated show removed the registered tray window")?;
        check(
            current_window.is_visible()?,
            "repeated show hid the tray window",
        )?;
        check(
            current_window.ns_window()? as *mut AnyObject == native_window,
            "show must reuse the current window",
        )?;
        drop(current_window);

        tray_window::close(app, &window)?;
        check(
            app.get_webview_panel(tray_window::TRAY_WINDOW_LABEL)
                .is_err(),
            "close did not unregister the panel",
        )?;
        // Tauri processes close asynchronously. Before returning to its event
        // loop the original NSWindow class must already have been restored.
        let still_panel: bool =
            unsafe { msg_send![native_window, isKindOfClass: NSPanel::class()] };
        check(
            !still_panel,
            "close did not restore NSWindow before destruction",
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
            .plugin(tauri_nspanel::init())
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
                    app.exit(0);
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
