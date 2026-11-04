//! AppKit may already be observing the Tauri window (e.g. for Touch Bar).
//! Keep its Objective-C class intact; lend its content view to a separate,
//! nonactivating panel until dismissal, then return it before Tauri teardown.
use objc2::{define_class, msg_send, rc::Retained, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSBackingStoreType, NSColor, NSPanel, NSPopUpMenuWindowLevel, NSScreen, NSView, NSWindow,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_core_graphics::{CGDisplayPixelsHigh, CGMainDisplayID};
use objc2_foundation::{NSMouseInRect, NSPoint, NSRect, NSSize};
use tauri::{PhysicalPosition, Rect, Runtime, WebviewWindow};

define_class!(
    #[unsafe(super = NSPanel)]
    #[name = "SwitchHostsTrayPanel"]
    struct TrayPanel;

    impl TrayPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key(&self) -> bool { true }

        #[unsafe(method(canBecomeMainWindow))]
        fn can_become_main(&self) -> bool { false }
    }
);

// Tao derives its window handle from its current content view. Leave a view
// installed in the hidden host; its ownership of the panel ends on teardown.
define_class!(
    #[unsafe(super = NSView)]
    #[name = "SwitchHostsTrayHostView"]
    #[ivars = Retained<NSPanel>]
    struct TrayHostView;
);

fn host<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<Retained<NSWindow>> {
    MainThreadMarker::new().ok_or(std::io::Error::other("tray requires main thread"))?;
    // SAFETY: Tauri returns the live NSWindow pointer, on its owning thread.
    unsafe { Retained::retain(window.ns_window()?.cast::<NSWindow>()) }
        .ok_or_else(|| std::io::Error::other("missing native tray window").into())
}

fn associated_panel(host: &NSWindow) -> Option<Retained<NSPanel>> {
    let view = host.contentView()?.downcast::<TrayHostView>().ok()?;
    Some(view.ivars().clone())
}

pub fn get<R: Runtime>(window: &WebviewWindow<R>) -> Option<Retained<NSPanel>> {
    host(window).ok().and_then(|host| associated_panel(&host))
}

pub fn attach<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let host = host(window)?;
    let content = host
        .contentView()
        .ok_or(std::io::Error::other("missing tray content"))?;
    let style = NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel;
    let panel: Retained<TrayPanel> = unsafe {
        msg_send![TrayPanel::alloc(host.mtm()), initWithContentRect: host.frame(),
            styleMask: style, backing: NSBackingStoreType::Buffered, defer: false]
    };
    // Rust owns the panel, including across the explicit AppKit close().
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    panel.setTitle(&host.title());
    panel.setFloatingPanel(true);
    panel.setLevel(NSPopUpMenuWindowLevel);
    panel.setHidesOnDeactivate(false);
    panel.setHasShadow(true);
    panel.setOpaque(false);
    panel.setBackgroundColor(Some(&NSColor::clearColor()));
    let placeholder =
        TrayHostView::alloc(host.mtm()).set_ivars(Retained::into_super(panel.clone()));
    let placeholder: Retained<TrayHostView> =
        unsafe { msg_send![super(placeholder), initWithFrame: content.frame()] };
    // Wry made the WKWebView (or a view inside it) the keyboard responder
    // of its host. Transfer that responder along with the content hierarchy.
    let responder = host
        .firstResponder()
        .and_then(|r| r.downcast::<NSView>().ok())
        .filter(|view| view.isDescendantOf(&content));
    host.setContentView(Some(&placeholder));
    panel.setContentView(Some(&content));
    if let Some(view) = responder {
        panel.setInitialFirstResponder(Some(&view));
        panel.makeFirstResponder(Some(&view));
    }
    Ok(())
}

// Use one AppKit coordinate space throughout. Global physical pixel rectangles
// can overlap when adjacent displays have different backing scale factors.
#[derive(Clone, Copy)]
pub struct StatusItemAnchor {
    pub button: NSRect,
    pub work_area: NSRect,
}

impl StatusItemAnchor {
    fn top_left(&self, size: NSSize) -> NSPoint {
        let area = self.work_area;
        let left = area.origin.x;
        let right = left + area.size.width;
        let top = area.origin.y + area.size.height;
        let center = self.button.origin.x + self.button.size.width / 2.0;
        NSPoint::new(
            (center - size.width / 2.0).clamp(left, (right - size.width).max(left)),
            self.button
                .origin
                .y
                .clamp((area.origin.y + size.height).min(top), top),
        )
    }
}

pub fn status_item_anchor(
    icon: Rect,
    position: PhysicalPosition<f64>,
    scale: f64,
) -> Option<StatusItemAnchor> {
    let screens = NSScreen::screens(MainThreadMarker::new()?);
    // Invert the same Quartz Y flip and status-window scale used by tray-icon.
    let primary_height = CGDisplayPixelsHigh(CGMainDisplayID()) as f64;
    anchor_for_event(
        icon,
        position,
        scale,
        primary_height,
        screens.iter().map(|s| (s.frame(), s.visibleFrame())),
    )
}

fn anchor_for_event(
    icon: Rect,
    position: PhysicalPosition<f64>,
    scale: f64,
    primary_height: f64,
    mut screens: impl Iterator<Item = (NSRect, NSRect)>,
) -> Option<StatusItemAnchor> {
    let pos = position.to_logical::<f64>(scale);
    let click = NSPoint::new(pos.x, primary_height - pos.y);
    // In unflipped screen coordinates the top edge belongs to this display.
    let (_, work_area) = screens.find(|(frame, _)| NSMouseInRect(click, *frame, false))?;
    let pos = icon.position.to_logical::<f64>(scale);
    let size = icon.size.to_logical::<f64>(scale);
    let button = NSRect::new(
        NSPoint::new(pos.x, primary_height - pos.y - size.height),
        NSSize::new(size.width, size.height),
    );
    // A parked status window can lie inside another display. Only use its
    // bounds when they contain the click captured in the same event.
    let button = if NSMouseInRect(click, button, false) {
        button
    } else {
        NSRect::new(
            NSPoint::new(click.x, work_area.origin.y + work_area.size.height),
            NSSize::default(),
        )
    };
    Some(StatusItemAnchor { button, work_area })
}

pub fn show<R: Runtime>(
    window: &WebviewWindow<R>,
    anchor: Option<StatusItemAnchor>,
) -> Result<(), String> {
    let panel = get(window).ok_or("missing native tray panel")?;
    if let Some(anchor) = anchor {
        panel.setFrameTopLeftPoint(anchor.top_left(panel.frame().size));
    }
    panel.orderFrontRegardless();
    panel.makeKeyWindow();
    Ok(())
}

pub fn detach<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let host = host(window)?;
    if let Some(panel) = associated_panel(&host) {
        panel.orderOut(None);
        let content = panel.contentView();
        panel.setContentView(None);
        host.setContentView(content.as_deref());
        panel.close();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn parked_status_item_on_lower_display_uses_recorded_click_on_primary() {
        use super::*;

        let primary = NSRect::new(NSPoint::default(), NSSize::new(1728.0, 1117.0));
        let work_area = NSRect::new(NSPoint::default(), NSSize::new(1728.0, 1084.0));
        let lower = NSRect::new(NSPoint::new(0.0, -1080.0), NSSize::new(1920.0, 1080.0));
        // At 2x, this event describes the parked AppKit frame (0, -33, 34, 33)
        // on the lower screen, while the mouse-up was at the primary's top edge.
        let parked = Rect {
            position: PhysicalPosition::new(0, 2234).into(),
            size: tauri::PhysicalSize::new(68, 66).into(),
        };
        let anchor = anchor_for_event(
            parked,
            PhysicalPosition::new(2800.0, 0.0),
            2.0,
            primary.size.height,
            [(lower, lower), (primary, work_area)].into_iter(),
        )
        .unwrap();
        assert_eq!(anchor.work_area, work_area);
        assert_eq!(anchor.button.origin, NSPoint::new(1400.0, 1084.0));
        assert_eq!(anchor.button.size, NSSize::default());
    }
}
