//! Native tray window lifecycle shared by the app and the macOS runtime test.
//! Call these functions on the main thread. Keeping them independent of app
//! storage lets the test use a blank WebView without touching hosts or config.

use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Runtime, WebviewUrl};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt as PanelManagerExt, PanelLevel, StyleMask,
    WebviewWindowExt,
};

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(TrayPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

pub const TRAY_WINDOW_LABEL: &str = "tray";
pub const TRAY_WINDOW_WIDTH: f64 = 300.0;
pub const TRAY_WINDOW_HEIGHT: f64 = 600.0;

pub fn create<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
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
        .accept_first_mouse(true)
        .visible(false)
        .shadow(true)
        .build()?;

    #[cfg(target_os = "macos")]
    if let Err(error) = configure_tray_panel(&window) {
        let _ = close(app, &window);
        return Err(error);
    }

    Ok(window)
}

#[cfg(target_os = "macos")]
pub fn show<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let panel = app
        .get_webview_panel(TRAY_WINDOW_LABEL)
        .map_err(|_| "tray NSPanel is not registered".to_string())?;
    panel.show_and_make_key();
    Ok(())
}

#[cfg(target_os = "macos")]
fn configure_tray_panel<R: Runtime>(window: &tauri::WebviewWindow<R>) -> Result<(), tauri::Error> {
    let panel = window.to_panel::<TrayPanel<R>>()?;

    // Borderless preserves the existing transparent popover appearance;
    // NonactivatingPanel is the key behavior that lets the webview receive
    // input without bringing the whole Regular app (and its home Space) to
    // the foreground.
    panel
        .set_style_mask(
            StyleMask::empty()
                .borderless()
                .nonactivating_panel()
                .value(),
        )
        .map_err(std::io::Error::other)?;
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .full_screen_auxiliary()
            .transient()
            .ignores_cycle()
            .value(),
    );
    // AppKit's setFloatingPanel(true) resets the level to Floating (3).
    // Apply it before the explicit PopUpMenu level (101), or that level is lost.
    panel.set_floating_panel(true);
    // A tray popover belongs above ordinary floating windows, but should not
    // cover protected system UI such as the screen saver or lock screen.
    panel.set_level(PanelLevel::PopUpMenu.value());
    panel.set_hides_on_deactivate(false);

    Ok(())
}

pub fn close<R: Runtime>(
    _app: &AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        // `to_window` removes the retained panel handle and restores the
        // original NSWindow class before Tauri destroys it. This preserves
        // the lazy-create/release behavior and avoids retaining one closed
        // panel per tray click.
        if let Ok(panel) = _app.get_webview_panel(TRAY_WINDOW_LABEL) {
            if let Some(window) = panel.to_window() {
                return window.close();
            }
        }
    }

    window.close()
}
