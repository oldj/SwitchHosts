//! Position an explicitly tray-invoked main window in AppKit coordinates.
//! Kept independent of storage so the native window test can exercise it.

use objc2::{rc::Retained, MainThreadMarker};
use objc2_app_kit::{NSScreen, NSWindow, NSWindowStyleMask};
use objc2_foundation::{NSMouseInRect, NSPoint, NSRect, NSSize};
use tauri::{Runtime, WebviewWindow};

pub fn move_to_screen<R: Runtime>(
    window: &WebviewWindow<R>,
    work_area: NSRect,
) -> tauri::Result<()> {
    let mtm = MainThreadMarker::new().ok_or(std::io::Error::other(
        "window placement requires main thread",
    ))?;
    // Work areas change as the menu bar/Dock appear during activation. Find
    // the screen containing the captured area's center, then use its current
    // work area. An exact visibleFrame match would drop valid delayed shows.
    let screens = NSScreen::screens(mtm);
    let center = NSPoint::new(
        work_area.origin.x + work_area.size.width / 2.0,
        work_area.origin.y + work_area.size.height / 2.0,
    );
    let Some(target) = screens
        .iter()
        .find(|s| NSMouseInRect(center, s.frame(), false))
    else {
        return Ok(());
    };
    // SAFETY: the live Tauri NSWindow is accessed on its owning thread.
    let native = unsafe { Retained::retain(window.ns_window()?.cast::<NSWindow>()) }
        .ok_or(std::io::Error::other("missing native main window"))?;
    if native.styleMask().contains(NSWindowStyleMask::FullScreen)
        || native.screen().as_deref() == Some(&target)
    {
        // Preserve an existing same-screen placement, including zoomed windows.
        // A fullscreen window belongs to its own Space; do not resize/move it.
        return Ok(());
    }
    native.setFrame_display(
        centered_frame(native.frame().size, target.visibleFrame()),
        false,
    );
    Ok(())
}

fn centered_frame(size: NSSize, area: NSRect) -> NSRect {
    let size = NSSize::new(
        size.width.min(area.size.width),
        size.height.min(area.size.height),
    );
    NSRect::new(
        NSPoint::new(
            area.origin.x + (area.size.width - size.width) / 2.0,
            area.origin.y + (area.size.height - size.height) / 2.0,
        ),
        size,
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn centers_on_displays_above_and_left_of_primary() {
        use super::*;

        for area in [
            NSRect::new(NSPoint::new(-467.0, 1117.0), NSSize::new(1920.0, 1080.0)),
            NSRect::new(NSPoint::new(-1087.0, 315.0), NSSize::new(1087.0, 802.0)),
        ] {
            let frame = centered_frame(NSSize::new(800.0, 480.0), area);
            assert_eq!(frame.size, NSSize::new(800.0, 480.0));
            assert_eq!(
                frame.origin.x + 400.0,
                area.origin.x + area.size.width / 2.0
            );
            assert_eq!(
                frame.origin.y + 240.0,
                area.origin.y + area.size.height / 2.0
            );
        }
    }

    #[test]
    fn fits_large_window_inside_smaller_work_area() {
        use super::*;

        let area = NSRect::new(NSPoint::new(1920.0, -800.0), NSSize::new(800.0, 600.0));
        assert_eq!(centered_frame(NSSize::new(1600.0, 900.0), area), area);
        let frame = centered_frame(NSSize::new(500.0, 900.0), area);
        assert_eq!(frame.origin, NSPoint::new(2070.0, -800.0));
        assert_eq!(frame.size, NSSize::new(500.0, 600.0));
    }
}
