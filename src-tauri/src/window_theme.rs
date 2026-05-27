//! Shared helpers for picking webview background colors from the
//! user's theme preference. Used by both the main window
//! (`lifecycle.rs`) and the find window (`find.rs`) so the
//! light/dark backgrounds stay in lock-step.

use tauri::webview::Color;
use tauri::Theme;

use crate::storage::AppState;

pub fn configured_theme(state: &AppState) -> Option<Theme> {
    let cfg = state.config.lock().expect("config mutex poisoned");
    match cfg.theme.as_str() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

pub fn background_color_for_theme(theme: Theme) -> Color {
    match theme {
        Theme::Dark => Color(26, 27, 30, 255),
        _ => Color(248, 249, 250, 255),
    }
}
