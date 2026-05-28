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

#[cfg(test)]
mod tests {
    use super::*;

    // Lock the Mantine-matched window backgrounds. Both the main window
    // (lifecycle.rs) and the find window (find.rs) paint the builder
    // with these before the renderer loads — a drift here reintroduces
    // the white flash on first paint / lightweight-mode rebuild.
    #[test]
    fn dark_theme_maps_to_mantine_dark_surface() {
        assert_eq!(
            background_color_for_theme(Theme::Dark),
            Color(26, 27, 30, 255)
        );
    }

    #[test]
    fn non_dark_theme_maps_to_mantine_light_surface() {
        // `Theme::Light` and the `system` / unknown fallback both
        // resolve to the light surface through the `_` arm.
        assert_eq!(
            background_color_for_theme(Theme::Light),
            Color(248, 249, 250, 255)
        );
    }
}
