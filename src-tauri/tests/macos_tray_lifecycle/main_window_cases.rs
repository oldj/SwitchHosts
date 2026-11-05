//! Exercise production main-window show paths on the fixture event loop.
//! The worker waits off the main thread; native objects stay on the main thread.

use super::macos_placement;
use objc2::{rc::Retained, MainThreadMarker};
use objc2_app_kit::{NSEvent, NSScreen, NSWindow};
use objc2_foundation::{NSMouseInRect, NSRect};
use std::{sync::mpsc, time::Duration};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow};

fn on_main<T: Send + 'static>(app: &AppHandle, action: impl FnOnce() -> T + Send + 'static) -> T {
    let (tx, rx) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || tx.send(action()).unwrap())
        .unwrap();
    rx.recv_timeout(Duration::from_secs(10))
        .expect("main-thread test task stalled")
}

fn native(window: &WebviewWindow) -> Retained<NSWindow> {
    assert!(MainThreadMarker::new().is_some());
    unsafe { Retained::retain(window.ns_window().unwrap().cast::<NSWindow>()) }.unwrap()
}

fn assert_on_screen(app: &AppHandle, window: &WebviewWindow, screen: NSRect) {
    let window = window.clone();
    on_main(app, move || {
        let window = native(&window);
        assert!(window.isVisible() && !window.isMiniaturized());
        assert_eq!(
            window.screen().unwrap().frame(),
            screen,
            "main used wrong display"
        );
    });
}

fn fixture(
    app: &AppHandle,
    label: &'static str,
    area: NSRect,
) -> (WebviewWindow, switchhosts_lib::NativeMainReadyGate) {
    let target_app = app.clone();
    on_main(app, move || {
        let window = tauri::WebviewWindowBuilder::new(
            &target_app,
            label,
            WebviewUrl::App("index.html".into()),
        )
        .position(100.0, 100.0)
        .inner_size(500.0, 300.0)
        .visible(false)
        .build()
        .unwrap();
        // An early native move alone is overwritten by Tauri's queued saved
        // position. The real ready gate must correct it immediately before show.
        macos_placement::move_to_screen(&window, area).unwrap();
        let gate =
            switchhosts_lib::install_main_ready_gate_for_native_test(&target_app, &window, area);
        (window, gate)
    })
}

fn cases(app: &AppHandle) {
    let displays = on_main(app, || {
        NSScreen::screens(MainThreadMarker::new().unwrap())
            .iter()
            .map(|s| (s.frame(), s.visibleFrame()))
            .collect::<Vec<_>>()
    });
    let primary = displays[0];
    let target = *displays.get(1).unwrap_or(&primary);
    if displays.len() == 1 {
        println!("SKIP: cross-display assertions need two displays; ready-gate checks still run");
    }

    let (ready, _gate) = fixture(app, "ready-main", target.1);
    std::thread::sleep(Duration::from_millis(150));
    assert!(
        !ready.is_visible().unwrap(),
        "main showed before renderer readiness"
    );
    app.emit("main_window_ready", ()).unwrap();
    std::thread::sleep(Duration::from_millis(150));
    assert_on_screen(app, &ready, target.0);
    println!("PASS: first ready-gated show overrides queued saved position");

    // Later ready events must not re-show a window the user has hidden.
    ready.hide().unwrap();
    app.emit("main_window_ready", ()).unwrap();
    std::thread::sleep(Duration::from_millis(100));
    assert!(
        !ready.is_visible().unwrap(),
        "duplicate ready event reopened hidden main"
    );

    let (retargeted, gate) = fixture(app, "retargeted-main", primary.1);
    gate.retarget(Some(target.1));
    // A normal show/reopen with no requested display must not erase the
    // most recent explicit tray request while the renderer is still loading.
    gate.retarget(None);
    std::thread::sleep(Duration::from_millis(150));
    app.emit("main_window_ready", ()).unwrap();
    std::thread::sleep(Duration::from_millis(150));
    assert_on_screen(app, &retargeted, target.0);
    println!("PASS: pending rebuild uses latest explicit screen request");

    let (abandoned, gate) = fixture(app, "abandoned-main", target.1);
    gate.abandon(app);
    app.emit("main_window_ready", ()).unwrap();
    let (fallback, _gate) = fixture(app, "fallback-main", target.1);
    std::thread::sleep(Duration::from_millis(5300));
    assert!(
        !abandoned.is_visible().unwrap(),
        "abandoned gate showed its old window"
    );
    assert!(
        !ready.is_visible().unwrap(),
        "ready fallback reopened hidden main"
    );
    assert_on_screen(app, &fallback, target.0);
    println!("PASS: timeout fallback keeps target; abandoned/consumed gates stay inactive");

    let main = app.get_webview_window("main").unwrap();
    let main_for_task = main.clone();
    on_main(app, move || {
        macos_placement::move_to_screen(&main_for_task, primary.1).unwrap();
        main_for_task.show().unwrap();
        native(&main_for_task).miniaturize(None);
    });
    std::thread::sleep(Duration::from_millis(800));
    let main_for_task = main.clone();
    on_main(
        app,
        move || assert!(native(&main_for_task).isMiniaturized()),
    );
    switchhosts_lib::show_main_on_screen_for_native_test(app, Some(target.1));
    std::thread::sleep(Duration::from_millis(800));
    assert_on_screen(app, &main, target.0);
    println!("PASS: tray restores minimized main on requested display");

    let main_for_task = main.clone();
    let frame = on_main(app, move || native(&main_for_task).frame());
    switchhosts_lib::show_main_on_screen_for_native_test(app, None);
    let main_for_task = main.clone();
    on_main(app, move || {
        assert_eq!(native(&main_for_task).frame(), frame)
    });
    println!("PASS: show without a tray target preserves existing placement");

    // Leave the actual cursor untouched. Pick a screen that does not contain
    // it, modelling keyboard selection after moving away from the tray menu.
    let menu_target = on_main(app, || {
        let point = NSEvent::mouseLocation();
        NSScreen::screens(MainThreadMarker::new().unwrap())
            .iter()
            .find(|s| !NSMouseInRect(point, s.frame(), false))
            .map(|s| (s.frame(), s.visibleFrame()))
    });
    if let Some((screen, area)) = menu_target {
        switchhosts_lib::show_main_from_menu_for_native_test(app, area);
        std::thread::sleep(Duration::from_millis(100));
        assert_on_screen(app, &main, screen);
        println!("PASS: tray menu uses captured screen, not current cursor display");
    }
}

pub fn run(app: AppHandle) {
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| cases(&app)));
        if result.is_err() {
            eprintln!("FAIL: native main-window regression checks");
        }
        app.exit(if result.is_ok() { 0 } else { 1 });
    });
}
