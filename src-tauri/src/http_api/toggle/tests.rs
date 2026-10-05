use super::*;
use crate::hosts_apply::recovery::RecoveryView;
use crate::storage::{entries, AppConfig, V5Paths};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    Arc, Mutex,
};
use tokio::sync::oneshot;

type Pause = (oneshot::Sender<()>, oneshot::Receiver<()>);

#[derive(Default)]
struct FakeHosts {
    bytes: Mutex<Vec<u8>>,
    writes: Mutex<Vec<String>>,
    restores: AtomicUsize,
    cancel_apply: AtomicBool,
    cancel_restore: AtomicBool,
    pause: Mutex<Option<Pause>>,
    after_write: Mutex<Option<Box<dyn FnOnce() + Send>>>,
}

impl FakeHosts {
    fn pause_next_apply(&self) -> (oneshot::Receiver<()>, oneshot::Sender<()>) {
        let (entered_tx, entered_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        *self.pause.lock().unwrap() = Some((entered_tx, release_rx));
        (entered_rx, release_tx)
    }

    fn content(&self) -> String {
        crate::hosts_text::decode_system(&self.bytes.lock().unwrap()).unwrap()
    }
}

impl SystemHosts for FakeHosts {
    async fn apply(&self, content: &str) -> Result<ApplyOutcome, HostsApplyError> {
        if self.cancel_apply.swap(false, Ordering::SeqCst) {
            return Err(HostsApplyError::Cancelled);
        }
        let previous_bytes = self.bytes.lock().unwrap().clone();
        let previous_content =
            entries::normalize_to_lf(&crate::hosts_text::decode_system(&previous_bytes).unwrap());
        let new_content = crate::hosts_text::normalize(content);
        *self.bytes.lock().unwrap() = new_content.as_bytes().to_vec();
        self.writes.lock().unwrap().push(new_content.clone());
        let hook = self.after_write.lock().unwrap().take();
        if let Some(hook) = hook {
            hook();
        }
        let pause = self.pause.lock().unwrap().take();
        if let Some((entered, release)) = pause {
            entered.send(()).unwrap();
            release.await.unwrap();
        }
        Ok(ApplyOutcome {
            unchanged: previous_bytes == new_content.as_bytes(),
            previous_content,
            previous_bytes,
            new_content,
        })
    }

    async fn restore(&self, outcome: &ApplyOutcome) -> Result<(), HostsApplyError> {
        self.restores.fetch_add(1, Ordering::SeqCst);
        if self.cancel_restore.load(Ordering::SeqCst) {
            return Err(HostsApplyError::Cancelled);
        }
        let mut bytes = self.bytes.lock().unwrap();
        if *bytes != outcome.new_content.as_bytes() {
            return Err(HostsApplyError::ContentChanged);
        }
        *bytes = outcome.previous_bytes.clone();
        Ok(())
    }

    fn matches(&self, content: &str, original_bytes: Option<&[u8]>) -> bool {
        *self.bytes.lock().unwrap() == original_bytes.unwrap_or(content.as_bytes())
    }
}

struct Fixture {
    state: Arc<AppState>,
    system: Arc<FakeHosts>,
}

impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let root = std::env::temp_dir().join(format!(
            "switchhosts-http-toggle-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
        let paths = V5Paths::under(root);
        paths.ensure_dirs().unwrap();
        Manifest {
            root: vec![
                json!({"id":"a", "title":"A", "type":"local", "on":false}),
                json!({"id":"b", "title":"B", "type":"local", "on":false}),
            ],
            ..Manifest::default()
        }
        .save(&paths)
        .unwrap();
        for id in ["a", "b"] {
            entries::write_entry(&paths.entries_dir, id, &format!("127.0.0.1 {id}.test")).unwrap();
        }
        let state = Arc::new(AppState {
            paths,
            config: Mutex::new(AppConfig {
                choice_mode: 2,
                write_mode: "overwrite".into(),
                ..AppConfig::default()
            }),
            store_lock: Mutex::new(()),
            application_recovery: Default::default(),
            config_write_lock: Mutex::new(()),
            update_check_lock: tokio::sync::Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
            data_dir_recovery: None,
        });
        let system = Arc::new(FakeHosts::default());
        *system.bytes.lock().unwrap() = b"original hosts\r\n".to_vec();
        Self { state, system }
    }

    fn recovery(&self) -> Option<RecoveryView> {
        self.state
            .application_recovery
            .inspect_and_notify(|content| self.system.matches(content, None), || {})
    }

    fn fail_save_after_apply(&self) {
        let blocker = self
            .state
            .paths
            .manifest_file
            .with_file_name("manifest.json.tmp");
        *self.system.after_write.lock().unwrap() = Some(Box::new(move || {
            // Unlike permissions this also fails reliably for elevated tests.
            // It fails the real manifest write after the state-file write.
            std::fs::create_dir(&blocker).unwrap();
        }));
    }

    fn spawn_toggle(&self, id: &'static str) -> tokio::task::JoinHandle<Result<(), ToggleError>> {
        let state = self.state.clone();
        let system = self.system.clone();
        tokio::spawn(async move { toggle(&state, id, system.as_ref()).await })
    }

    fn assert_selection(&self, a: bool, b: bool) {
        let manifest = self.state.read_manifest().unwrap();
        assert_eq!(manifest::find_node(&manifest.root, "a").unwrap()["on"], a);
        assert_eq!(manifest::find_node(&manifest.root, "b").unwrap()["on"], b);
        assert_eq!(
            self.system.content(),
            hosts_apply::aggregate_selected_content(&manifest.root, &self.state.paths, false)
                .unwrap(),
        );
        assert_eq!(self.recovery(), None);
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.state.paths.root);
    }
}

async fn queued_toggles(second_id: &'static str) {
    let fixture = Fixture::new();
    let (entered, release) = fixture.system.pause_next_apply();
    let first = fixture.spawn_toggle("a");
    entered.await.unwrap();
    let mut second = Box::pin(toggle(&fixture.state, second_id, fixture.system.as_ref()));
    // Poll the queued request while the first write/post-apply work is pending.
    assert!(matches!(
        Future::poll(
            second.as_mut(),
            &mut std::task::Context::from_waker(std::task::Waker::noop()),
        ),
        std::task::Poll::Pending
    ));
    assert_eq!(fixture.system.writes.lock().unwrap().len(), 1);
    release.send(()).unwrap();
    first.await.unwrap().unwrap();
    second.await.unwrap();
    if second_id == "a" {
        fixture.assert_selection(false, false);
        assert_eq!(
            *fixture.system.writes.lock().unwrap(),
            ["127.0.0.1 a.test", ""]
        );
    } else {
        fixture.assert_selection(true, true);
        assert_eq!(
            *fixture.system.writes.lock().unwrap(),
            ["127.0.0.1 a.test", "127.0.0.1 a.test\n\n127.0.0.1 b.test"]
        );
    }
}

#[tokio::test]
async fn queued_toggles_keep_all_selected_content() {
    queued_toggles("b").await;
}

#[tokio::test]
async fn queued_toggles_of_the_same_entry_use_the_committed_state() {
    queued_toggles("a").await;
}

#[tokio::test]
async fn save_failure_restores_original_encoding_and_storage() {
    let fixture = Fixture::new();
    let original: Vec<u8> = [0xff, 0xfe]
        .into_iter()
        .chain("# 原始 hosts\r\n".encode_utf16().flat_map(u16::to_le_bytes))
        .collect();
    *fixture.system.bytes.lock().unwrap() = original.clone();
    let manifest_before = std::fs::read(&fixture.state.paths.manifest_file).unwrap();
    let state_before = std::fs::read(&fixture.state.paths.state_file).unwrap();
    fixture.fail_save_after_apply();

    let result = toggle(&fixture.state, "a", fixture.system.as_ref()).await;
    assert_eq!(result.unwrap_err().as_body(), "apply failed.");
    assert_eq!(*fixture.system.bytes.lock().unwrap(), original);
    assert_eq!(fixture.system.restores.load(Ordering::SeqCst), 1);
    assert_eq!(
        std::fs::read(&fixture.state.paths.manifest_file).unwrap(),
        manifest_before
    );
    assert_eq!(
        std::fs::read(&fixture.state.paths.state_file).unwrap(),
        state_before
    );
    assert!(!fixture
        .state
        .paths
        .internal
        .join("storage-transaction.json")
        .exists());
    assert_eq!(fixture.recovery(), None);
    std::fs::remove_dir(fixture.state.paths.root.join("manifest.json.tmp")).unwrap();
    toggle(&fixture.state, "b", fixture.system.as_ref())
        .await
        .unwrap();
    fixture.assert_selection(false, true);
}

#[tokio::test]
async fn failed_compensation_records_the_applied_list_and_blocks_followup() {
    let fixture = Fixture::new();
    fixture.fail_save_after_apply();
    fixture.system.cancel_restore.store(true, Ordering::SeqCst);
    let error = toggle(&fixture.state, "a", fixture.system.as_ref())
        .await
        .unwrap_err();
    assert_eq!(error.as_body(), "applied but not persisted.");
    let Some(RecoveryView::Applied { list }) = fixture.recovery() else {
        panic!("the next renderer must see the applied selection");
    };
    assert_eq!(manifest::find_node(&list, "a").unwrap()["on"], true);
    let saved = fixture.state.read_manifest().unwrap();
    assert_eq!(manifest::find_node(&saved.root, "a").unwrap()["on"], false);
    assert_eq!(fixture.system.content(), "127.0.0.1 a.test");
    let error = toggle(&fixture.state, "b", fixture.system.as_ref())
        .await
        .unwrap_err();
    assert_eq!(error.as_body(), "recovery required.");
    assert_eq!(fixture.system.writes.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn external_system_edit_is_not_overwritten_by_compensation() {
    let fixture = Fixture::new();
    fixture.fail_save_after_apply();
    let (entered, release) = fixture.system.pause_next_apply();
    let applying = fixture.spawn_toggle("a");
    entered.await.unwrap();
    *fixture.system.bytes.lock().unwrap() = b"external hosts".to_vec();
    release.send(()).unwrap();
    assert_eq!(
        applying.await.unwrap().unwrap_err().as_body(),
        "applied but not persisted."
    );
    assert_eq!(fixture.system.content(), "external hosts");
    assert_eq!(fixture.recovery(), Some(RecoveryView::Unknown));
}

#[tokio::test]
async fn successful_save_does_not_acknowledge_an_external_system_edit() {
    let fixture = Fixture::new();
    let (entered, release) = fixture.system.pause_next_apply();
    let applying = fixture.spawn_toggle("a");
    entered.await.unwrap();
    *fixture.system.bytes.lock().unwrap() = b"external hosts".to_vec();
    release.send(()).unwrap();
    assert_eq!(
        applying.await.unwrap().unwrap_err().as_body(),
        "recovery required."
    );
    assert_eq!(fixture.state.read_manifest().unwrap().root[0]["on"], true);
    assert_eq!(fixture.system.content(), "external hosts");
    assert_eq!(fixture.recovery(), Some(RecoveryView::Unknown));
}

async fn concurrent_edit(content_only: bool) {
    let fixture = Fixture::new();
    let original = fixture.system.bytes.lock().unwrap().clone();
    let (entered, release) = fixture.system.pause_next_apply();
    let applying = fixture.spawn_toggle("a");
    entered.await.unwrap();
    {
        let _guard = fixture.state.lock_store().unwrap();
        if content_only {
            entries::write_entry(
                &fixture.state.paths.entries_dir,
                "a",
                "127.0.0.2 edited.test",
            )
            .unwrap();
        } else {
            let mut manifest = Manifest::load(&fixture.state.paths).unwrap();
            manifest.root[0]["title"] = json!("Renamed during apply");
            manifest.save(&fixture.state.paths).unwrap();
        }
    }
    release.send(()).unwrap();
    let error = applying.await.unwrap().unwrap_err();
    assert!(error.to_string().contains("changed during application"));
    assert_eq!(*fixture.system.bytes.lock().unwrap(), original);
    let saved = fixture.state.read_manifest().unwrap();
    assert_eq!(saved.root[0]["on"], false);
    if content_only {
        assert_eq!(
            entries::read_entry(&fixture.state.paths.entries_dir, "a").unwrap(),
            "127.0.0.2 edited.test"
        );
    } else {
        assert_eq!(saved.root[0]["title"], "Renamed during apply");
    }
    assert_eq!(fixture.recovery(), None);
}

#[tokio::test]
async fn concurrent_tree_edit_is_preserved_and_the_apply_is_compensated() {
    concurrent_edit(false).await;
}

#[tokio::test]
async fn concurrent_content_edit_is_detected_even_without_a_manifest_change() {
    concurrent_edit(true).await;
}

#[tokio::test]
async fn cancelled_apply_leaves_no_recovery_and_allows_retry() {
    let fixture = Fixture::new();
    fixture.system.cancel_apply.store(true, Ordering::SeqCst);
    let error = toggle(&fixture.state, "a", fixture.system.as_ref())
        .await
        .unwrap_err();
    assert_eq!(error.as_body(), "cancelled.");
    assert_eq!(fixture.system.content(), "original hosts\r\n");
    assert_eq!(fixture.recovery(), None);
    assert_eq!(fixture.system.restores.load(Ordering::SeqCst), 0);
    toggle(&fixture.state, "a", fixture.system.as_ref())
        .await
        .unwrap();
    fixture.assert_selection(true, false);
}

#[tokio::test]
async fn backend_waits_for_renderer_apply_and_rechecks_pending_recovery() {
    let fixture = Fixture::new();
    let state = fixture.state.clone();
    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let renderer = tokio::spawn(async move {
        state
            .application_recovery
            .track_apply(async {
                entered_tx.send(()).unwrap();
                release_rx.await.unwrap();
                Ok::<_, ()>(())
            })
            .await
    });
    entered_rx.await.unwrap();
    let mut backend = Box::pin(toggle(&fixture.state, "a", fixture.system.as_ref()));
    assert!(matches!(
        Future::poll(
            backend.as_mut(),
            &mut std::task::Context::from_waker(std::task::Waker::noop()),
        ),
        std::task::Poll::Pending
    ));
    release_tx.send(()).unwrap();
    renderer.await.unwrap().unwrap();
    assert_eq!(backend.await.unwrap_err().as_body(), "recovery required.");
    assert!(fixture.system.writes.lock().unwrap().is_empty());
    assert_eq!(fixture.recovery(), Some(RecoveryView::Unknown));
}

#[tokio::test]
async fn missing_entry_and_unset_write_mode_do_not_apply() {
    let fixture = Fixture::new();
    let error = toggle(&fixture.state, "missing", fixture.system.as_ref())
        .await
        .unwrap_err();
    assert_eq!(error.as_body(), "not found.");
    fixture.state.config.lock().unwrap().write_mode.clear();
    let error = toggle(&fixture.state, "a", fixture.system.as_ref())
        .await
        .unwrap_err();
    assert_eq!(error.as_body(), "write mode not set.");
    assert!(fixture.system.writes.lock().unwrap().is_empty());
    assert_eq!(fixture.recovery(), None);
}
