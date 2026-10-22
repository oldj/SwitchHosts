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

#[derive(Debug, Serialize)]
pub struct FinishResult {
    /// Whether the caller's apply was confirmed before reconciling newer content.
    pub confirmed: bool,
    pub superseded: bool,
    pub application_recovery: Option<RecoveryView>,
}

struct Pending {
    view: RecoveryView,
    expected_content: String,
}

#[derive(Default)]
struct RecoveryState {
    generation: u64,
    pending: Option<Pending>,
    before_apply: Option<Pending>,
    requested: bool,
}

#[derive(Default)]
pub struct ApplicationRecovery {
    state: Mutex<RecoveryState>,
    apply_lock: tokio::sync::Mutex<()>,
}

impl ApplicationRecovery {
    /// Backend callers keep this guard through snapshot, apply and commit (or
    /// compensation). Renderer applies use the same lock in track_apply_with_generation.
    pub(crate) async fn lock_apply(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.apply_lock.lock().await
    }

    #[cfg(test)]
    pub async fn track_apply<T, E>(
        &self,
        apply: impl std::future::Future<Output = Result<T, E>>,
    ) -> Result<T, E> {
        self.track_apply_with_generation(apply)
            .await
            .map(|(value, _)| value)
    }

    /// Cover the write and post-apply work with one pending state. Capture its
    /// generation under the same lock so a delayed renderer can only persist,
    /// acknowledge or compensate this application, even if a newer write has
    /// identical content.
    pub(crate) async fn track_apply_with_generation<T, E>(
        &self,
        apply: impl std::future::Future<Output = Result<T, E>>,
    ) -> Result<(T, u64), E> {
        let _serial = self.lock_apply().await;
        self.begin();
        let result = apply.await;
        if result.is_err() {
            // No successful apply to acknowledge. Restore the prior view;
            // the caller revalidates it before publishing the error.
            self.apply_failed();
        }
        result.map(|value| (value, self.generation()))
    }

    pub(crate) fn generation(&self) -> u64 {
        self.state.lock().unwrap().generation
    }

    pub(crate) async fn lock_generation(
        &self,
        generation: u64,
    ) -> Option<tokio::sync::MutexGuard<'_, ()>> {
        let guard = self.lock_apply().await;
        (self.generation() == generation).then_some(guard)
    }

    pub(crate) fn apply_failed(&self) {
        let mut state = self.state.lock().unwrap();
        state.generation += 1;
        state.pending = state.before_apply.take();
    }

    /// Save the previous view before any write or snapshot can change it.
    pub fn begin(&self) {
        let mut state = self.state.lock().unwrap();
        state.generation += 1;
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
        let mut state = self.state.lock().unwrap();
        state.generation += 1;
        state.before_apply = None;
        state.pending = Some(Pending {
            view: RecoveryView::Applied { list },
            expected_content,
        });
    }

    /// The request survives a destroyed webview. Only the main renderer
    /// consumes it after loading, so event delivery is just a wake-up hint.
    pub fn request(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        state.requested = state.pending.is_some();
        state.requested
    }

    pub fn take_request(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        std::mem::take(&mut state.requested) && state.pending.is_some()
    }

    pub fn is_pending(&self) -> bool {
        self.state.lock().unwrap().pending.is_some()
    }

    /// A storage failure needs a recovery entry point, but must not replace
    /// another apply's snapshot or compensation state.
    pub(crate) fn require_reconciliation(&self) {
        let mut state = self.state.lock().unwrap();
        if state.pending.is_none() {
            state.generation += 1;
            state.pending = Some(Self::unknown());
        }
    }

    pub fn snapshot(&self, on_change: impl FnOnce()) -> Option<RecoveryView> {
        self.inspect_and_notify(write::system_hosts_matches, on_change)
    }

    pub(crate) fn inspect_and_notify(
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
        let mut state = self.state.lock().unwrap();
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

    pub async fn finish(
        &self,
        expected_content: &str,
        preserved_bytes: Option<&[u8]>,
        generation: u64,
        reconcile: impl std::future::Future<Output = Option<RecoveryView>>,
    ) -> FinishResult {
        self.finish_generation_and_reconcile(
            generation,
            || write::system_hosts_matches_snapshot(expected_content, preserved_bytes),
            reconcile,
        )
        .await
    }

    #[cfg(test)]
    pub(super) async fn finish_and_reconcile(
        &self,
        verify: impl FnOnce() -> bool,
        reconcile: impl std::future::Future<Output = Option<RecoveryView>>,
    ) -> FinishResult {
        self.finish_generation_and_reconcile(self.generation(), verify, reconcile)
            .await
    }

    pub(super) async fn finish_generation_and_reconcile(
        &self,
        generation: u64,
        verify: impl FnOnce() -> bool,
        reconcile: impl std::future::Future<Output = Option<RecoveryView>>,
    ) -> FinishResult {
        let mut result = {
            let _serial = self.lock_apply().await;
            let mut state = self.state.lock().unwrap();
            if state.generation != generation {
                FinishResult {
                    confirmed: false,
                    superseded: true,
                    application_recovery: state
                        .pending
                        .as_ref()
                        .map(|pending| pending.view.clone()),
                }
            } else {
                let confirmed = verify();
                state.generation += 1;
                state.before_apply = None;
                state.pending = if confirmed {
                    None
                } else {
                    Some(Self::unknown())
                };
                FinishResult {
                    confirmed,
                    superseded: false,
                    application_recovery: state
                        .pending
                        .as_ref()
                        .map(|pending| pending.view.clone()),
                }
            }
        };
        if result.confirmed {
            result.application_recovery = reconcile.await;
        }
        result
    }

    #[cfg(test)]
    async fn finish_checked(&self, verify: impl FnOnce() -> bool) -> Option<RecoveryView> {
        // A delayed acknowledgement from another window must not clear the
        // pending state of a native write whose post-apply work is still running.
        let _serial = self.lock_apply().await;
        self.finish_with(verify())
    }

    /// A successful compensation restores the recovery state from before
    /// this apply, which may itself still need explicit reconciliation.
    pub fn restored(
        &self,
        previous_content: &str,
        previous_bytes: Option<&[u8]>,
        on_change: impl FnOnce(),
    ) -> Option<RecoveryView> {
        self.restored_with(write::system_hosts_matches_snapshot(
            previous_content,
            previous_bytes,
        ));
        self.snapshot(on_change)
    }

    pub(crate) fn restored_with(&self, current: bool) {
        let mut state = self.state.lock().unwrap();
        state.generation += 1;
        let previous = state.before_apply.take();
        state.pending = if current {
            previous
        } else {
            Some(Self::unknown())
        };
    }

    pub(crate) fn finish_with(&self, current: bool) -> Option<RecoveryView> {
        let mut state = self.state.lock().unwrap();
        state.generation += 1;
        state.before_apply = None;
        state.pending = if current { None } else { Some(Self::unknown()) };
        state.pending.as_ref().map(|p| p.view.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn stale_finish_and_compensation_cannot_take_ownership_of_identical_newer_content() {
        let recovery = ApplicationRecovery::default();
        let (_, old) = recovery
            .track_apply_with_generation(async { Ok::<_, ()>(()) })
            .await
            .unwrap();
        let (_, newer) = recovery
            .track_apply_with_generation(async { Ok::<_, ()>(()) })
            .await
            .unwrap();
        assert_ne!(old, newer);
        // Even if both operations wrote identical bytes, the earlier request
        // must not verify/clear the newer pending state or run its reconciliation.
        let finished = recovery
            .finish_generation_and_reconcile(
                old,
                || panic!("stale acknowledgement must not inspect another apply's file"),
                async { panic!("stale acknowledgement must not reconcile") },
            )
            .await;
        assert!(finished.superseded);
        assert!(!finished.confirmed);
        assert!(recovery.is_pending());
        assert!(recovery.lock_generation(old).await.is_none());
        assert!(recovery.lock_generation(newer).await.is_some());
        recovery
            .finish_generation_and_reconcile(newer, || true, async { None })
            .await;
        let stale = recovery
            .finish_generation_and_reconcile(old, || false, async { None })
            .await;
        assert!(stale.superseded);
        assert!(stale.application_recovery.is_none());
        assert!(!recovery.is_pending());
    }

    #[tokio::test]
    async fn stale_finish_waits_for_newer_write_then_leaves_its_recovery_untouched() {
        use std::sync::Arc;
        let recovery = Arc::new(ApplicationRecovery::default());
        let old = recovery.generation(); // read-only preservation
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (resume_tx, resume_rx) = tokio::sync::oneshot::channel();
        let writer = recovery.clone();
        let writing = tokio::spawn(async move {
            writer
                .track_apply_with_generation(async {
                    entered_tx.send(()).unwrap();
                    resume_rx.await.unwrap();
                    Ok::<_, ()>(())
                })
                .await
                .unwrap()
        });
        entered_rx.await.unwrap();
        let mut finish =
            Box::pin(recovery.finish_generation_and_reconcile(old, || true, async { None }));
        assert!(matches!(
            std::future::Future::poll(
                finish.as_mut(),
                &mut std::task::Context::from_waker(std::task::Waker::noop())
            ),
            std::task::Poll::Pending
        ));
        resume_tx.send(()).unwrap();
        writing.await.unwrap();
        assert!(finish.await.superseded);
        assert!(recovery.is_pending());
    }

    #[tokio::test]
    async fn pending_precedes_pipeline_reads_and_preserves_compensation_snapshot() {
        let recovery = ApplicationRecovery::default();
        let list = vec![json!({"id":"b", "on":true}), json!({"id":"a", "on":true})];
        recovery.record(list.clone(), "old applied content".into());
        let result: Result<(), ()> = recovery
            .track_apply(async {
                // Matches the real pipeline: system file has just changed, then
                // tray refresh runs before the post-apply command completes.
                assert_eq!(
                    recovery.inspect(|_| false),
                    (Some(RecoveryView::Unknown), false)
                );
                Ok(())
            })
            .await;
        assert!(result.is_ok());
        // Metadata save fails but compensation restores the pre-write file.
        recovery.restored_with(true);
        assert_eq!(
            recovery.inspect(|s| s == "old applied content"),
            (Some(RecoveryView::Applied { list }), false)
        );
    }

    #[tokio::test]
    async fn failed_or_cancelled_apply_restores_prior_recovery() {
        let recovery = ApplicationRecovery::default();
        let result: Result<(), ()> = recovery.track_apply(async { Err(()) }).await;
        assert!(result.is_err());
        assert!(!recovery.is_pending());
        let list = vec![json!({"id":"a", "on":true})];
        recovery.record(list.clone(), "original".into());
        let result: Result<(), ()> = recovery.track_apply(async { Err(()) }).await;
        assert!(result.is_err());
        assert_eq!(
            recovery.inspect(|s| s == "original"),
            (Some(RecoveryView::Applied { list }), false)
        );
    }

    #[tokio::test]
    async fn recreated_window_cannot_overtake_an_old_post_apply_command() {
        use std::sync::Arc;
        let recovery = Arc::new(ApplicationRecovery::default());
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel();
        let old_state = recovery.clone();
        let old = tokio::spawn(async move {
            old_state
                .track_apply(async {
                    entered_tx.send(()).unwrap();
                    release_rx.await.unwrap(); // slow post-apply command
                    Ok::<_, ()>(())
                })
                .await
        });
        entered_rx.await.unwrap();
        assert!(recovery.is_pending()); // already visible to a recreated window
        let mut replacement = Box::pin(recovery.track_apply(async { Ok::<_, ()>(()) }));
        // Poll deterministically: the new explicit recovery must wait.
        assert!(matches!(
            std::future::Future::poll(
                replacement.as_mut(),
                &mut std::task::Context::from_waker(std::task::Waker::noop()),
            ),
            std::task::Poll::Pending
        ));
        release_tx.send(()).unwrap();
        assert!(old.await.unwrap().is_ok());
        assert!(replacement.await.is_ok());
        assert_eq!(recovery.finish_with(true), None);
        assert!(!recovery.is_pending());
    }

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

    #[tokio::test]
    async fn acknowledgement_waits_for_native_apply_before_verifying_and_clearing_recovery() {
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        let recovery = Arc::new(ApplicationRecovery::default());
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel();
        let writing = recovery.clone();
        let apply = tokio::spawn(async move {
            writing
                .track_apply(async {
                    entered_tx.send(()).unwrap();
                    release_rx.await.unwrap();
                    Ok::<_, ()>(())
                })
                .await
        });
        entered_rx.await.unwrap();
        let verified = AtomicBool::new(false);
        let mut acknowledgement = Box::pin(recovery.finish_checked(|| {
            verified.store(true, Ordering::SeqCst);
            true
        }));
        assert!(matches!(
            std::future::Future::poll(
                acknowledgement.as_mut(),
                &mut std::task::Context::from_waker(std::task::Waker::noop()),
            ),
            std::task::Poll::Pending
        ));
        assert!(!verified.load(Ordering::SeqCst));
        assert!(recovery.is_pending());
        release_tx.send(()).unwrap();
        apply.await.unwrap().unwrap();
        assert_eq!(acknowledgement.await, None);
        assert!(verified.load(Ordering::SeqCst));
        assert!(!recovery.is_pending());
    }

    #[tokio::test]
    async fn confirmed_apply_stays_successful_when_followup_sync_needs_recovery() {
        let recovery = ApplicationRecovery::default();
        recovery.begin();
        let result = recovery
            .finish_and_reconcile(|| true, async { recovery.finish_with(false) })
            .await;
        assert!(result.confirmed);
        assert_eq!(result.application_recovery, Some(RecoveryView::Unknown));
        let result = recovery
            .finish_and_reconcile(|| false, async {
                panic!("unconfirmed applications must not reconcile newer sources")
            })
            .await;
        assert!(!result.confirmed);
        assert_eq!(result.application_recovery, Some(RecoveryView::Unknown));
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
