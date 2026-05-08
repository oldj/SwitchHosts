//! Application menu — the macOS menu bar / Windows+Linux window menu.
//!
//! Mirrors the Electron build's menu structure in
//! [src/main/ui/menu.ts] with the same submenus, accelerators, and
//! event broadcasts. Items that need a renderer listener (add_new,
//! show_preferences, show_about, toggle_comment) are routed as Tauri
//! events so the existing `useOnBroadcast` subscribers in the renderer
//! fire unchanged.

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

use crate::i18n::{menu_labels, MenuLabels};

// ---- menu item ids ---------------------------------------------------------
// Every custom item gets a stable id routed through the global
// `on_menu_event` handler in `lib.rs`.

pub const MENU_ID_ABOUT: &str = "app-about";
pub const MENU_ID_NEW: &str = "app-new";
pub const MENU_ID_PREFERENCES: &str = "app-preferences";
pub const MENU_ID_FIND: &str = "app-find";
pub const MENU_ID_COMMENT: &str = "app-comment";
pub const MENU_ID_FEEDBACK: &str = "app-feedback";
pub const MENU_ID_HOMEPAGE: &str = "app-homepage";

pub const FEEDBACK_URL: &str = "https://github.com/oldj/SwitchHosts/issues";
pub const HOMEPAGE_URL: &str = "https://switchhosts.vercel.app/home/";

/// Build and install the application menu. Called once from
/// `lib.rs::run`'s setup hook.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> Result<(), tauri::Error> {
    refresh(app)
}

/// Rebuild and reinstall the application menu after language changes.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) -> Result<(), tauri::Error> {
    let menu = build_menu(app)?;
    app.set_menu(menu)?;
    Ok(())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let labels = menu_labels(app);
    let file_menu = build_file_menu(app, &labels)?;
    let edit_menu = build_edit_menu(app, &labels)?;
    let view_menu = build_view_menu(app, &labels)?;
    let window_menu = build_window_menu(app, &labels)?;
    let help_menu = build_help_menu(app, &labels)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = build_macos_app_menu(app, &labels)?;
        Menu::with_items(
            app,
            &[
                &app_menu,
                &file_menu,
                &edit_menu,
                &view_menu,
                &window_menu,
                &help_menu,
            ],
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        Menu::with_items(
            app,
            &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
        )
    }
}

// ---- macOS app submenu (About, Hide, Quit) --------------------------------

#[cfg(target_os = "macos")]
fn build_macos_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
) -> Result<Submenu<R>, tauri::Error> {
    let about = MenuItemBuilder::with_id(MENU_ID_ABOUT, labels.about_app).build(app)?;
    let services = PredefinedMenuItem::services(app, Some(labels.services))?;
    let hide = PredefinedMenuItem::hide(app, Some(labels.hide_app))?;
    let hide_others = PredefinedMenuItem::hide_others(app, Some(labels.hide_others))?;
    let show_all = PredefinedMenuItem::show_all(app, Some(labels.show_all))?;
    let quit = PredefinedMenuItem::quit(app, Some(labels.quit_app))?;

    SubmenuBuilder::new(app, "SwitchHosts")
        .item(&about)
        .separator()
        .item(&services)
        .separator()
        .item(&hide)
        .item(&hide_others)
        .item(&show_all)
        .separator()
        .item(&quit)
        .build()
}

// ---- File ------------------------------------------------------------------

fn build_file_menu<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
) -> Result<Submenu<R>, tauri::Error> {
    let new_item = MenuItemBuilder::with_id(MENU_ID_NEW, labels.new)
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let prefs = MenuItemBuilder::with_id(MENU_ID_PREFERENCES, labels.preferences)
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let mut builder = SubmenuBuilder::new(app, labels.file);

    // On Windows/Linux put About at the top of File (Electron does this)
    #[cfg(not(target_os = "macos"))]
    {
        let about = MenuItemBuilder::with_id(MENU_ID_ABOUT, labels.about_app).build(app)?;
        builder = builder.item(&about).separator();
    }

    builder = builder.item(&new_item).separator().item(&prefs);

    #[cfg(not(target_os = "macos"))]
    {
        let quit = PredefinedMenuItem::quit(app, Some(labels.quit))?;
        builder = builder.separator().item(&quit);
    }

    #[cfg(target_os = "macos")]
    {
        let close_window = PredefinedMenuItem::close_window(app, Some(labels.close_window))?;
        builder = builder.separator().item(&close_window);
    }

    builder.build()
}

// ---- Edit ------------------------------------------------------------------

fn build_edit_menu<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
) -> Result<Submenu<R>, tauri::Error> {
    let comment = MenuItemBuilder::with_id(MENU_ID_COMMENT, labels.comment_uncomment)
        .accelerator("CmdOrCtrl+/")
        .build(app)?;
    let find = MenuItemBuilder::with_id(MENU_ID_FIND, labels.find)
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let undo = PredefinedMenuItem::undo(app, Some(labels.undo))?;
    let redo = PredefinedMenuItem::redo(app, Some(labels.redo))?;
    let cut = PredefinedMenuItem::cut(app, Some(labels.cut))?;
    let copy = PredefinedMenuItem::copy(app, Some(labels.copy))?;
    let paste = PredefinedMenuItem::paste(app, Some(labels.paste))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(labels.select_all))?;

    SubmenuBuilder::new(app, labels.edit)
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .separator()
        .item(&comment)
        .item(&find)
        .build()
}

// ---- View ------------------------------------------------------------------

fn build_view_menu<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
) -> Result<Submenu<R>, tauri::Error> {
    let builder = SubmenuBuilder::new(app, labels.view);

    #[cfg(target_os = "macos")]
    let builder = {
        let fullscreen = PredefinedMenuItem::fullscreen(app, Some(labels.fullscreen))?;
        builder.item(&fullscreen).separator()
    };

    let minimize = PredefinedMenuItem::minimize(app, Some(labels.minimize))?;
    let maximize = PredefinedMenuItem::maximize(app, Some(labels.maximize))?;
    builder.item(&minimize).item(&maximize).build()
}

// ---- Window ----------------------------------------------------------------

fn build_window_menu<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
) -> Result<Submenu<R>, tauri::Error> {
    let minimize = PredefinedMenuItem::minimize(app, Some(labels.minimize))?;
    let close_window = PredefinedMenuItem::close_window(app, Some(labels.close_window))?;
    let mut builder = SubmenuBuilder::new(app, labels.window);
    builder = builder.item(&minimize).item(&close_window);

    #[cfg(target_os = "macos")]
    {
        let maximize = PredefinedMenuItem::maximize(app, Some(labels.maximize))?;
        builder = builder.separator().item(&maximize);
    }

    builder.build()
}

// ---- Help ------------------------------------------------------------------

fn build_help_menu<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
) -> Result<Submenu<R>, tauri::Error> {
    let feedback = MenuItemBuilder::with_id(MENU_ID_FEEDBACK, labels.feedback).build(app)?;
    let homepage = MenuItemBuilder::with_id(MENU_ID_HOMEPAGE, labels.homepage).build(app)?;

    SubmenuBuilder::new(app, labels.help)
        .item(&feedback)
        .item(&homepage)
        .build()
}
