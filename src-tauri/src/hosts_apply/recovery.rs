//! Session-wide state for an apply that could not be saved or compensated.
//! Kept outside webviews so destroying/recreating the tray does not lose it.
use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;

use super::write;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum RecoveryView {
    Applied { list: Vec<Value> },
    Unknown,
}

struct Pending {
    view: RecoveryView,
    expected_content: String,
}

#[derive(Default)]
struct RecoveryState {
    pending: Option<Pending>,
    before_apply: Option<Pending>,
    requested: bool,
}

#[derive(Default)]
pub struct ApplicationRecovery(Mutex<RecoveryState>);

impl ApplicationRecovery {
    /// Record the unacknowledged write before returning it to the renderer.
    /// Even if its subsequent compensation request never arrives, every window
    /// must keep showing recovery until an explicit acknowledgement succeeds.
    pub fn begin(&self) {
        let mut state = self.0.lock().unwrap();
        state.before_apply = state.pending.take();
        state.pending = Some(Self::unknown());
    }

    fn unknown() -> Pending {
        Pending {
            view: RecoveryView::Unknown,
            expected_content: String::new(),
        }
    }

    pub fn record(&self, list: Vec<Value>, expected_content: String) {
        let mut state = self.0.lock().unwrap();
        state.before_apply = None;
        state.pending = Some(Pending {
            view: RecoveryView::Applied { list },
            expected_content,
        });
    }

    /// The request survives a destroyed webview. Only the main renderer
    /// consumes it after loading, so event delivery is just a wake-up hint.
    pub fn request(&self) -> bool {
        let mut state = self.0.lock().unwrap();
        state.requested = state.pending.is_some();
        state.requested
    }

    pub fn take_request(&self) -> bool {
        let mut state = self.0.lock().unwrap();
        std::mem::take(&mut state.requested) && state.pending.is_some()
    }

    pub fn is_pending(&self) -> bool {
        self.0.lock().unwrap().pending.is_some()
    }

    pub fn snapshot(&self, on_change: impl FnOnce()) -> Option<RecoveryView> {
        self.inspect_and_notify(write::system_hosts_matches, on_change)
    }

    fn inspect_and_notify(
        &self,
        matches: impl FnOnce(&str) -> bool,
        on_change: impl FnOnce(),
    ) -> Option<RecoveryView> {
        let (view, changed) = self.inspect(matches);
        // Publish after releasing the mutex; listeners may read the state.
        if changed {
            on_change();
        }
        view
    }

    fn inspect(&self, matches: impl FnOnce(&str) -> bool) -> (Option<RecoveryView>, bool) {
        let mut state = self.0.lock().unwrap();
        let Some(pending) = state.pending.as_mut() else {
            return (None, false);
        };
        // A read error is also unknown. Never infer that an old apply is still
        // current merely because compensation failed or could not read the file.
        let changed = matches!(pending.view, RecoveryView::Applied { .. })
            && !matches(&pending.expected_content);
        if changed {
            pending.view = RecoveryView::Unknown;
        }
        (Some(pending.view.clone()), changed)
    }

    pub fn finish(&self, expected_content: &str) -> Option<RecoveryView> {
        let current = write::system_hosts_matches(expected_content);
        self.finish_with(current)
    }

    /// A successful compensation restores the recovery state from before
    /// this apply, which may itself still need explicit reconciliation.
    pub fn restored(
        &self,
        previous_content: &str,
        on_change: impl FnOnce(),
    ) -> Option<RecoveryView> {
        self.restored_with(write::system_hosts_matches(previous_content));
        self.snapshot(on_change)
    }

    fn restored_with(&self, current: bool) {
        let mut state = self.0.lock().unwrap();
        let previous = state.before_apply.take();
        state.pending = if current {
            previous
        } else {
            Some(Self::unknown())
        };
    }

    fn finish_with(&self, current: bool) -> Option<RecoveryView> {
        let mut state = self.0.lock().unwrap();
        state.before_apply = None;
        state.pending = if current { None } else { Some(Self::unknown()) };
        state.pending.as_ref().map(|p| p.view.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn recovery_request_survives_absent_window_and_is_consumed_once() {
        let recovery = ApplicationRecovery::default();
        assert!(!recovery.request());
        assert!(!recovery.take_request());
        recovery.begin();
        assert!(recovery.request());
        assert!(recovery.request());
        // A recreated main window and its wake-up event can both try to drain.
        assert!(recovery.take_request());
        assert!(!recovery.take_request());
        assert!(recovery.is_pending());
        recovery.request();
        recovery.finish_with(true);
        assert!(!recovery.take_request());
        assert!(!recovery.is_pending());
    }

    #[test]
    fn first_reader_publishes_unknown_transition_exactly_once() {
        use std::cell::Cell;
        let recovery = ApplicationRecovery::default();
        recovery.record(vec![json!({"id":"a", "on":true})], "applied".into());
        let notifications = Cell::new(0);
        // The tray may observe a mismatch before a command reads basic data.
        let title_view = recovery.inspect_and_notify(
            |_| false,
            || {
                notifications.set(notifications.get() + 1);
                // Notifications run without holding the recovery mutex.
                assert!(recovery.is_pending());
            },
        );
        assert_eq!(title_view, Some(RecoveryView::Unknown));
        let command_view = recovery.inspect_and_notify(
            |_| false,
            || {
                notifications.set(notifications.get() + 1);
            },
        );
        assert_eq!(command_view, title_view);
        assert_eq!(notifications.get(), 1);
    }

    #[test]
    fn unacknowledged_apply_survives_queries_until_verified_finish() {
        let recovery = ApplicationRecovery::default();
        recovery.begin();
        for _window in 0..3 {
            assert_eq!(
                recovery.inspect(|_| true),
                (Some(RecoveryView::Unknown), false)
            );
        }
        assert_eq!(recovery.finish_with(false), Some(RecoveryView::Unknown));
        assert_eq!(recovery.finish_with(true), None);
    }

    #[test]
    fn verified_compensation_restores_the_previous_recovery_state() {
        let recovery = ApplicationRecovery::default();
        recovery.begin();
        recovery.restored_with(true);
        assert_eq!(recovery.inspect(|_| true), (None, false));

        let list = vec![json!({"id":"a", "on":true})];
        recovery.record(list.clone(), "earlier applied content".into());
        recovery.begin();
        recovery.restored_with(true);
        assert_eq!(
            recovery.inspect(|s| s == "earlier applied content"),
            (Some(RecoveryView::Applied { list }), false)
        );

        recovery.begin();
        recovery.restored_with(false);
        assert_eq!(
            recovery.inspect(|_| true),
            (Some(RecoveryView::Unknown), false)
        );
    }

    #[test]
    fn independent_window_reads_preserve_the_full_ordered_snapshot() {
        let recovery = ApplicationRecovery::default();
        let list = vec![json!({"id":"b", "on":true}), json!({"id":"a", "on":true})];
        recovery.record(list.clone(), "b then a".into());
        for _window in 0..3 {
            assert_eq!(
                recovery.inspect(|content| content == "b then a"),
                (Some(RecoveryView::Applied { list: list.clone() }), false)
            );
        }
    }

    #[test]
    fn changed_or_unreadable_content_becomes_unknown_until_explicit_reapply() {
        let recovery = ApplicationRecovery::default();
        recovery.record(vec![json!({"id":"a", "on":true})], "applied".into());
        assert_eq!(
            recovery.inspect(|_| false),
            (Some(RecoveryView::Unknown), true)
        );
        assert_eq!(
            recovery.inspect(|_| true),
            (Some(RecoveryView::Unknown), false)
        );
        assert_eq!(recovery.finish_with(false), Some(RecoveryView::Unknown));
        assert_eq!(recovery.finish_with(true), None);
        assert_eq!(recovery.inspect(|_| false), (None, false));
    }
}
