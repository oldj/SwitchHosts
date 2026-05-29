mod app_menu;
mod commands;
mod find;
mod hosts_apply;
mod http;
mod http_api;
mod i18n;
mod import_export;
mod lifecycle;
mod migration;
mod refresh;
mod storage;
mod tray;
mod window_theme;

use serde_json::json;
#[cfg(any(target_os = "windows", test))]
use std::path::{Path, PathBuf};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{Emitter, Listener, Manager, RunEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use storage::AppState;

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, PartialEq, Eq)]
enum ElevationHelperInvocation {
    NotHelper,
    InvalidArgs,
    Copy { src: PathBuf },
}

#[cfg(any(target_os = "windows", test))]
fn parse_elevation_helper_args<I, S>(args: I) -> ElevationHelperInvocation
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let args: Vec<String> = args.into_iter().map(Into::into).collect();
    if args.get(1).map(String::as_str) != Some(hosts_apply::elevation::ELEVATION_HELPER_ARG) {
        return ElevationHelperInvocation::NotHelper;
    }
    if args.len() != 3 {
        return ElevationHelperInvocation::InvalidArgs;
    }
    ElevationHelperInvocation::Copy {
        src: PathBuf::from(&args[2]),
    }
}

#[cfg(any(target_os = "windows", test))]
fn overwrite_file_contents(src: &Path, dst: &Path) -> std::io::Result<u64> {
    let mut input = std::fs::File::open(src)?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(dst)?;

    std::io::copy(&mut input, &mut output)
}

/// Early argv check for the Windows elevation helper. On macOS / Linux
/// this always returns false. On Windows, if the binary was spawned by
/// [`hosts_apply::elevation::elevate_copy`] with
/// `--swh-elevated-apply-hosts <src>`, we overwrite the resolved
/// Windows hosts file contents from that staged file and exit before
/// any Tauri / storage code runs. The parent waits for our exit code.
fn maybe_run_as_elevation_helper() -> bool {
    #[cfg(not(target_os = "windows"))]
    {
        false
    }

    #[cfg(target_os = "windows")]
    {
        match parse_elevation_helper_args(std::env::args()) {
            ElevationHelperInvocation::NotHelper => false,
            ElevationHelperInvocation::InvalidArgs => {
                eprintln!("[v5 elevation-helper] invalid arguments");
                std::process::exit(1);
            }
            ElevationHelperInvocation::Copy { src } => {
                let dst = match hosts_apply::write::system_hosts_path() {
                    Ok(path) => path,
                    Err(e) => {
                        eprintln!("[v5 elevation-helper] failed to resolve hosts path: {e}");
                        std::process::exit(1);
                    }
                };
                let exit_code = match overwrite_file_contents(&src, &dst) {
                    Ok(_) => 0,
                    Err(e) => {
                        eprintln!(
                            "[v5 elevation-helper] write {} -> {} failed: {e}",
                            src.display(),
                            dst.display()
                        );
                        1
                    }
                };
                std::process::exit(exit_code);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows elevation helper: when SwitchHosts is relaunched via
    // ShellExecuteExW with `runas` to perform a privileged hosts file
    // write (see `hosts_apply::elevation`), the elevated child re-enters
    // this function with a special argv shape. Detect it, do the write,
    // and exit before the v5 storage layer or the Tauri runtime starts.
    // This block is a no-op on macOS / Linux (they don't self-relaunch).
    if maybe_run_as_elevation_helper() {
        return;
    }

    let state = AppState::bootstrap().expect("failed to bootstrap SwitchHosts v5 storage layer");

    let app = tauri::Builder::default()
        // Single-instance MUST be the first plugin so a second
        // launch is intercepted before any other plugin starts up.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            lifecycle::focus_main_on_second_instance(app, args, cwd)
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(state)
        // Popup menu item clicks are routed back to the renderer as Tauri
        // events: the menu item id equals the renderer-generated
        // `_click_evt` string, so forwarding the id verbatim as an event
        // name lets the existing `agent.once(_click_evt, handler)` pattern
        // keep working without any renderer changes.
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            // Tray menu items go to the tray module.
            if id.starts_with("tray-") {
                tray::handle_menu_event(app, id);
                return;
            }
            // Application menu custom items. Items that route to the
            // renderer as a broadcast use the same `_args` envelope
            // convention; items that need Rust action (Find, URL open)
            // are dispatched inline.
            match id {
                #[cfg(target_os = "macos")]
                app_menu::MENU_ID_HIDE_APP => {
                    lifecycle::hide_app_from_menu(app);
                    return;
                }
                app_menu::MENU_ID_FIND => {
                    if let Err(e) = find::show_find_window(app) {
                        log::warn!("failed to show find window: {e}");
                    }
                    return;
                }
                app_menu::MENU_ID_ABOUT
                | app_menu::MENU_ID_NEW
                | app_menu::MENU_ID_PREFERENCES
                | app_menu::MENU_ID_COMMENT => {
                    let event_name = match id {
                        app_menu::MENU_ID_ABOUT => "show_about",
                        app_menu::MENU_ID_NEW => "add_new",
                        app_menu::MENU_ID_PREFERENCES => "show_preferences",
                        app_menu::MENU_ID_COMMENT => "toggle_comment",
                        _ => unreachable!(),
                    };
                    let _ = app.emit(event_name, json!({ "_args": [] }));
                    return;
                }
                app_menu::MENU_ID_FEEDBACK => {
                    let _ = open::that(app_menu::FEEDBACK_URL);
                    return;
                }
                app_menu::MENU_ID_HOMEPAGE => {
                    let _ = open::that(app_menu::HOMEPAGE_URL);
                    return;
                }
                app_menu::MENU_ID_QUIT_APP => {
                    lifecycle::quit_app(app);
                    return;
                }
                _ => {}
            }
            // Renderer-generated popup menu items.
            if id.starts_with("popup_menu_item_") {
                let _ = app.emit(id, json!({ "_args": [] }));
            }
        })
        .setup(|app| {
            // We build the main window programmatically (rather than
            // declaring it in tauri.conf.json) so saved geometry can be
            // baked into the builder — `set_position` on a conf-declared
            // window doesn't always take effect before the compositor
            // paints the first frame, producing a center-then-jump flash
            // on macOS. When `hide_at_launch` is on we skip creating the
            // main window entirely: there's no point loading a webview
            // process that will only be hidden, and the user's intent is
            // exactly "stay in the tray". `show_main_window`'s rebuild
            // path handles the first tray-triggered show identically to
            // the lightweight-mode reopen.
            let app_handle = app.handle().clone();
            let app_state = app.state::<AppState>();

            // Run automatic update checks from the backend so they keep
            // working while the main window is hidden to the tray. The
            // renderer's ready event gives UpdateDialog a chance to attach
            // its listeners before the first check can emit `new_version`.
            //
            // The listener is registered unconditionally and fires on the
            // first `main_window_ready` emission. Only `pages/index.tsx`
            // (the main window's React root) broadcasts that event —
            // find / tray-mini windows do not — so the trigger is:
            //
            //   - `hide_at_launch = false`: setup creates the main window
            //     and the renderer emits ready shortly after, so the
            //     check starts within the first second or two of launch.
            //   - `hide_at_launch = true`: no main window is created at
            //     setup, the renderer never loads, and the check stays
            //     **deferred** until the user explicitly shows the main
            //     window from the tray. This is intentional: a hidden-
            //     at-launch user has opted into "stay quiet in the
            //     tray", and running an unbidden network check that
            //     could pop an `new_version` event into a non-existent
            //     UpdateDialog would be both wasteful and surprising.
            //
            // Once the check has started for a session, the AtomicBool
            // swap guarantees subsequent tray-rebuild `main_window_ready`
            // emissions don't re-start it.
            let update_checker_started = Arc::new(AtomicBool::new(false));
            let update_checker_ready_app = app_handle.clone();
            let update_checker_ready_flag = update_checker_started.clone();
            app.listen("main_window_ready", move |_event| {
                if !update_checker_ready_flag.swap(true, Ordering::SeqCst) {
                    commands::start_auto_update_checker(update_checker_ready_app.clone());
                }
            });

            let hide_at_launch = app_state
                .config
                .lock()
                .map(|cfg| cfg.hide_at_launch)
                .unwrap_or(false);
            if hide_at_launch {
                // Skip creating the main window — mark hide-to-tray so
                // the exit-guard machinery recognises subsequent
                // last-window closes (e.g. dismissing a find window) as
                // "stay in tray" rather than exit. The flag is cleared
                // by `show_main_window` after a successful rebuild.
                lifecycle::enter_hidden_to_tray_state();
            } else {
                let main = lifecycle::create_main_window(&app_handle, app_state.inner())?;

                // Handlers are installed right after build, before any
                // user interaction, so no Moved/Resized events are lost.
                lifecycle::install_main_window_handlers(&main);

                let did_show_main = Arc::new(AtomicBool::new(false));

                let ready_app = app_handle.clone();
                let ready_flag = did_show_main.clone();
                app.listen("main_window_ready", move |_event| {
                    if !ready_flag.swap(true, Ordering::SeqCst) {
                        lifecycle::focus_main_on_second_instance(
                            &ready_app,
                            Vec::new(),
                            String::new(),
                        );
                    }
                });

                let fallback_app = app_handle.clone();
                let fallback_flag = did_show_main.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(5000));
                    if !fallback_flag.swap(true, Ordering::SeqCst) {
                        let app = fallback_app.clone();
                        let _ = fallback_app.run_on_main_thread(move || {
                            lifecycle::focus_main_on_second_instance(
                                &app,
                                Vec::new(),
                                String::new(),
                            );
                        });
                    }
                });
            }

            // Application menu (Phase 2.D minimal: defaults + Find).
            // The full P2.C menu lands later but we need an entry
            // point for the find window today, and `Cmd+F` is the
            // discoverable accelerator from the Electron build.
            if let Err(e) = app_menu::install(&app_handle) {
                log::warn!("failed to install app menu: {e}");
            }

            // Tray icon must exist before we honour `hide_dock_icon`,
            // otherwise hiding the Dock icon on macOS would strand the
            // user (no Dock icon, no tray to summon the window back).
            tray::install_tray(&app_handle)?;
            if let Err(e) = tray::refresh_title(&app_handle, app_state.inner()) {
                log::warn!("failed to initialize tray title: {e}");
            }

            #[cfg(target_os = "macos")]
            {
                let hide = app_state
                    .config
                    .lock()
                    .map(|cfg| cfg.hide_dock_icon)
                    .unwrap_or(false);
                if hide {
                    lifecycle::apply_dock_icon_policy(&app.handle(), true);
                }
            }

            // The tray window (P2.B.2) and a few existing dialogs
            // (e.g. SetWriteMode) broadcast `events.active_main_window`
            // when they want the main window to come forward. The
            // Electron build had a matching
            // `message.on('active_main_window', onActive)` handler in
            // `src/main/main.ts`; we mirror it via the global event
            // bus so the renderer's existing call sites keep working
            // unchanged.
            let active_main_app = app_handle.clone();
            app.listen("active_main_window", move |_event| {
                lifecycle::focus_main_on_second_instance(
                    &active_main_app,
                    Vec::new(),
                    String::new(),
                );
            });

            // Background scanner for remote-hosts auto refresh.
            // Wakes every 60s, replaces `src/main/libs/cron.ts`.
            refresh::start_background_scanner(app_handle.clone());

            // Local HTTP API on port 50761. Only started if the user
            // turned it on in the preferences pane; the config_set /
            // config_update commands also call start/stop on the fly
            // when the renderer flips the toggle.
            let (http_on, only_local) = {
                let cfg = app_state.config.lock().expect("config mutex poisoned");
                (cfg.http_api_on, cfg.http_api_only_local)
            };
            if http_on {
                if let Err(e) = http_api::start(app_handle.clone(), only_local) {
                    log::warn!("http_api startup failed: {e}");
                }
            }

            // Reconcile launch_at_login with what the OS actually reports.
            // Users may toggle login items from System Settings while the app
            // is closed; treat the OS as the source of truth so the
            // Preferences checkbox does not drift out of sync.
            let want_launch_at_login = app_state
                .config
                .lock()
                .expect("config mutex poisoned")
                .launch_at_login;
            let mut launch_at_login = want_launch_at_login;
            match app_handle.autolaunch().is_enabled() {
                Ok(actual) if actual != want_launch_at_login => {
                    launch_at_login = actual;
                    {
                        let mut cfg = app_state.config.lock().expect("config mutex poisoned");
                        cfg.launch_at_login = actual;
                    }
                    if let Err(e) = app_state.persist_config() {
                        log::warn!("failed to persist launch_at_login sync from OS: {e}");
                    }
                }
                Ok(actual) => {
                    launch_at_login = actual;
                }
                Err(e) => {
                    log::warn!("failed to query OS launch_at_login state: {e}");
                }
            }
            lifecycle::apply_launch_at_login_relaunch_policy(&app_handle, launch_at_login);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // startup critical
            commands::ping,
            commands::get_basic_data,
            commands::migration_status,
            commands::dark_mode_toggle,
            // config
            commands::config_all,
            commands::config_get,
            commands::config_set,
            commands::config_update,
            // list / tree
            commands::get_list,
            commands::get_item_from_list,
            commands::get_content_of_list,
            commands::set_list,
            commands::move_to_trashcan,
            commands::move_many_to_trashcan,
            commands::get_trashcan_list,
            commands::clear_trashcan,
            commands::delete_item_from_trashcan,
            commands::restore_item_from_trashcan,
            // hosts content
            commands::get_hosts_content,
            commands::set_hosts_content,
            commands::get_system_hosts,
            commands::get_path_of_system_hosts,
            // apply / refresh
            commands::apply_hosts_selection,
            commands::refresh_remote_hosts,
            commands::refresh_all_remote_hosts,
            commands::get_apply_history,
            commands::delete_apply_history_item,
            // cmd_after_hosts_apply history
            commands::cmd_get_history_list,
            commands::cmd_delete_history_item,
            commands::cmd_clear_history,
            // find window
            commands::find_show,
            commands::find_set_window_title,
            commands::find_by,
            commands::find_replace_one,
            commands::find_replace_all,
            commands::find_add_history,
            commands::find_get_history,
            commands::find_set_history,
            commands::find_add_replace_history,
            commands::find_get_replace_history,
            commands::find_set_replace_history,
            // window / misc
            commands::hide_main_window,
            commands::focus_main_window,
            commands::quit_app,
            commands::update_tray_title,
            commands::open_url,
            commands::show_item_in_folder,
            commands::popup_menu,
            // import / export
            commands::export_data,
            commands::import_data,
            commands::import_data_from_url,
            // updater
            commands::check_update,
            commands::download_update,
            commands::install_update,
            // data dir
            commands::get_data_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run-event hook covers three concerns that Builder's `.setup` and
    // window-level `on_window_event` can't reach:
    //   * WindowEvent::CloseRequested — globally observe every webview
    //     close. When the main window is in the lightweight-hidden
    //     state and the closing window is the last live webview, arm
    //     a short-lived guard so the imminent `ExitRequested` can be
    //     prevented. Per-window `on_window_event` runs first, so the
    //     main window's hide-to-tray flag is already set by the time
    //     this hook sees its CloseRequested.
    //   * ExitRequested — persist geometry on every exit-request path,
    //     and `prevent_exit` only when the guard above was armed by a
    //     specific close. Dock → Quit, system shutdown, etc. arrive
    //     with the same `is_will_quit == false` shape as the implicit
    //     last-window exit; the guard distinguishes them.
    //   * Reopen (macOS) — clicking the Dock icon for an app whose
    //     main window is hidden should re-show it. Tauri does not do
    //     this automatically; has_visible_windows == false means the
    //     OS didn't find any windows to bring forward.
    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent {
            ref label,
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        } => {
            lifecycle::arm_lightweight_exit_guard_if_last_window(app_handle, label);
        }
        RunEvent::ExitRequested { api, .. } => {
            lifecycle::persist_on_exit_requested(app_handle);
            let state = app_handle.state::<AppState>();
            let will_quit = state.is_will_quit.load(Ordering::SeqCst);
            let expecting = lifecycle::take_expecting_lightweight_exit();
            if expecting && !will_quit {
                api.prevent_exit();
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                lifecycle::focus_main_on_second_instance(app_handle, Vec::new(), String::new());
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elevation_helper_parser_ignores_normal_startup_args() {
        let parsed = parse_elevation_helper_args(["SwitchHosts.exe", "--some-normal-arg"]);

        assert_eq!(parsed, ElevationHelperInvocation::NotHelper);
    }

    #[test]
    fn elevation_helper_parser_rejects_legacy_src_dst_shape() {
        let parsed = parse_elevation_helper_args([
            "SwitchHosts.exe",
            hosts_apply::elevation::ELEVATION_HELPER_ARG,
            r"C:\Temp\swh_apply_1.hosts",
            r"C:\Windows\System32\drivers\etc\services",
        ]);

        assert_eq!(parsed, ElevationHelperInvocation::InvalidArgs);
    }

    #[test]
    fn elevation_helper_parser_accepts_staged_source_only() {
        let src = r"C:\Temp\swh_apply_1.hosts";
        let parsed = parse_elevation_helper_args([
            "SwitchHosts.exe",
            hosts_apply::elevation::ELEVATION_HELPER_ARG,
            src,
        ]);

        assert_eq!(
            parsed,
            ElevationHelperInvocation::Copy {
                src: PathBuf::from(src),
            }
        );
    }

    #[cfg(unix)]
    #[test]
    fn elevation_helper_content_write_preserves_existing_destination_mode() {
        use std::os::unix::fs::PermissionsExt;
        use std::time::{SystemTime, UNIX_EPOCH};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before Unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("swh_content_write_test_{stamp}"));
        std::fs::create_dir(&dir).expect("create temp test dir");

        let src = dir.join("src.hosts");
        let dst = dir.join("hosts");
        std::fs::write(&src, "replacement").expect("write source");
        std::fs::write(&dst, "original").expect("write destination");
        std::fs::set_permissions(&src, std::fs::Permissions::from_mode(0o644))
            .expect("set source mode");
        std::fs::set_permissions(&dst, std::fs::Permissions::from_mode(0o600))
            .expect("set destination mode");

        overwrite_file_contents(&src, &dst).expect("overwrite contents");

        assert_eq!(
            std::fs::read_to_string(&dst).expect("read destination"),
            "replacement"
        );
        assert_eq!(
            std::fs::metadata(&dst)
                .expect("stat destination")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );

        let _ = std::fs::remove_dir_all(dir);
    }
}
