use super::*;
use crate::storage::{
    entries,
    manifest::{self, Manifest},
    AppConfig, V5Paths,
};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use tokio::sync::oneshot;

type Pause = (oneshot::Sender<()>, oneshot::Receiver<()>);

#[derive(Default)]
struct FakeHosts {
    content: Mutex<String>,
    writes: Mutex<Vec<String>>,
    fail: AtomicBool,
    pause: Mutex<Option<Pause>>,
}

impl SystemHosts for FakeHosts {
    fn is_current(&self, content: &str, _: &str) -> bool {
        *self.content.lock().unwrap() == content
    }
    async fn apply(&self, content: &str) -> Result<ApplyOutcome, HostsApplyError> {
        if self.fail.swap(false, Ordering::SeqCst) {
            return Err(HostsApplyError::Cancelled);
        }
        let previous_content =
            std::mem::replace(&mut *self.content.lock().unwrap(), content.into());
        self.writes.lock().unwrap().push(content.into());
        let pause = self.pause.lock().unwrap().take();
        if let Some((entered, resume)) = pause {
            entered.send(()).unwrap();
            resume.await.unwrap();
        }
        Ok(ApplyOutcome {
            previous_bytes: previous_content.as_bytes().to_vec(),
            previous_content,
            new_content: content.into(),
            unchanged: false,
        })
    }
    fn matches(&self, content: &str) -> bool {
        self.is_current(content, "overwrite")
    }
}

struct Fixture {
    state: Arc<AppState>,
    system: Arc<FakeHosts>,
}

impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let paths = V5Paths::under(std::env::temp_dir().join(format!(
            "swh-content-sync-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )));
        paths.ensure_dirs().unwrap();
        let state = Arc::new(AppState {
            paths,
            config: Mutex::new(AppConfig {
                write_mode: "overwrite".into(),
                ..Default::default()
            }),
            store_lock: Mutex::new(()),
            content_sync: Default::default(),
            application_recovery: Default::default(),
            config_write_lock: Mutex::new(()),
            update_check_lock: tokio::sync::Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
            data_dir_recovery: None,
        });
        Manifest {
            root: vec![
                json!({"id":"local", "type":"local", "on":false}),
                json!({"id":"remote", "type":"remote", "on":false}),
                json!({"id":"unused", "type":"local", "on":false}),
                json!({"id":"group", "type":"group", "on":true, "include":["local","remote"]}),
            ],
            ..Default::default()
        }
        .save(&state.paths)
        .unwrap();
        for id in ["local", "remote", "unused"] {
            entries::write_entry(
                &state.paths.entries_dir,
                id,
                &format!("127.0.0.1 {id}.test"),
            )
            .unwrap();
        }
        let system = Arc::new(FakeHosts::default());
        *system.content.lock().unwrap() = aggregate::aggregate_selected_content(
            &state.read_manifest().unwrap().root,
            &state.paths,
            false,
        )
        .unwrap();
        Self { state, system }
    }

    fn save(&self, id: &str, content: &str) {
        commands::save_hosts_content(&self.state, id, content).unwrap();
    }

    async fn sync(&self) -> Result<(), StorageError> {
        synchronize(&self.state, self.system.as_ref()).await
    }

    fn remote_commit(&self, content: &str) {
        let _store = self.state.lock_store().unwrap();
        entries::write_entry(&self.state.paths.entries_dir, "remote", content).unwrap();
        self.state.content_sync.mark("remote");
    }

    fn spawn(&self) -> tokio::task::JoinHandle<Result<(), StorageError>> {
        let state = self.state.clone();
        let system = self.system.clone();
        tokio::spawn(async move { synchronize(&state, system.as_ref()).await })
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.state.paths.root);
    }
}

#[tokio::test]
async fn local_edit_of_disabled_group_member_updates_system_without_a_window() {
    let f = Fixture::new();
    f.save("local", "192.0.2.1 edited.test");
    f.sync().await.unwrap();
    assert_eq!(
        *f.system.content.lock().unwrap(),
        "192.0.2.1 edited.test\n\n127.0.0.1 remote.test"
    );
    assert_eq!(
        manifest::find_node(&f.state.read_manifest().unwrap().root, "local").unwrap()["on"],
        false
    );
    assert!(!f.state.application_recovery.is_pending());
}

#[tokio::test]
async fn remote_changes_apply_in_background_and_batches_write_once() {
    let f = Fixture::new();
    f.remote_commit("192.0.2.2 remote.test");
    f.save("local", "192.0.2.3 local.test");
    f.sync().await.unwrap();
    assert_eq!(
        *f.system.writes.lock().unwrap(),
        ["192.0.2.3 local.test\n\n192.0.2.2 remote.test"]
    );
    f.sync().await.unwrap();
    assert_eq!(f.system.writes.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn directly_enabled_remote_also_applies_without_a_window() {
    let f = Fixture::new();
    Manifest {
        root: vec![json!({"id":"remote", "type":"remote", "on":true})],
        ..Default::default()
    }
    .save(&f.state.paths)
    .unwrap();
    f.remote_commit("192.0.2.4 remote.test");
    f.sync().await.unwrap();
    assert_eq!(*f.system.content.lock().unwrap(), "192.0.2.4 remote.test");
}

#[tokio::test]
async fn unrelated_disabled_sources_and_unchanged_edits_do_not_write() {
    let f = Fixture::new();
    f.save("unused", "192.0.2.8 unused.test");
    f.save("local", "127.0.0.1 local.test");
    f.sync().await.unwrap();
    assert!(f.system.writes.lock().unwrap().is_empty());
}

#[tokio::test]
async fn pending_renderer_apply_defers_changes_until_acknowledgement() {
    let f = Fixture::new();
    f.state.application_recovery.begin();
    f.save("local", "192.0.2.5 local.test");
    f.sync().await.unwrap();
    assert!(f.system.writes.lock().unwrap().is_empty());
    assert!(f.state.application_recovery.is_pending());
    f.state.application_recovery.finish_with(true);
    f.sync().await.unwrap();
    assert!(f.system.content.lock().unwrap().contains("192.0.2.5"));
}

#[tokio::test]
async fn cancelled_write_keeps_saved_source_and_recovery_for_explicit_retry() {
    let f = Fixture::new();
    let original = f.system.content.lock().unwrap().clone();
    f.save("local", "192.0.2.6 local.test");
    f.system.fail.store(true, Ordering::SeqCst);
    assert!(f.sync().await.is_err());
    assert_eq!(*f.system.content.lock().unwrap(), original);
    assert_eq!(
        entries::read_entry(&f.state.paths.entries_dir, "local").unwrap(),
        "192.0.2.6 local.test"
    );
    assert!(f.state.application_recovery.is_pending());
    // A periodic refresh must not repeatedly prompt while recovery is pending.
    f.sync().await.unwrap();
    assert!(f.system.writes.lock().unwrap().is_empty());
    f.state.application_recovery.finish_with(true);
    f.sync().await.unwrap();
    assert!(f.system.content.lock().unwrap().contains("192.0.2.6"));
}

#[tokio::test]
async fn changes_during_a_slow_apply_are_reconciled_and_serialized() {
    let f = Fixture::new();
    f.save("local", "192.0.2.7 first.test");
    let (entered_tx, entered_rx) = oneshot::channel();
    let (resume_tx, resume_rx) = oneshot::channel();
    *f.system.pause.lock().unwrap() = Some((entered_tx, resume_rx));
    let first = f.spawn();
    entered_rx.await.unwrap();
    f.save("local", "192.0.2.8 latest.test");
    f.remote_commit("192.0.2.9 remote.test");
    let second = f.spawn();
    resume_tx.send(()).unwrap();
    first.await.unwrap().unwrap();
    second.await.unwrap().unwrap();
    assert_eq!(
        *f.system.content.lock().unwrap(),
        "192.0.2.8 latest.test\n\n192.0.2.9 remote.test"
    );
    assert_eq!(f.system.writes.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn selection_changes_during_apply_do_not_leave_removed_content_active() {
    let f = Fixture::new();
    f.save("local", "192.0.2.10 local.test");
    let (entered_tx, entered_rx) = oneshot::channel();
    let (resume_tx, resume_rx) = oneshot::channel();
    *f.system.pause.lock().unwrap() = Some((entered_tx, resume_rx));
    let pending = f.spawn();
    entered_rx.await.unwrap();
    {
        let _store = f.state.lock_store().unwrap();
        Manifest::default().save(&f.state.paths).unwrap();
    }
    resume_tx.send(()).unwrap();
    pending.await.unwrap().unwrap();
    assert_eq!(*f.system.content.lock().unwrap(), "");
}

#[tokio::test]
async fn renderer_acknowledgement_does_not_repeat_write_if_content_is_current() {
    let f = Fixture::new();
    f.state.content_sync.mark_all();
    f.sync().await.unwrap();
    assert!(f.system.writes.lock().unwrap().is_empty());
}

#[tokio::test]
async fn missing_write_mode_never_falls_back_to_overwrite() {
    let f = Fixture::new();
    f.state.config.lock().unwrap().write_mode.clear();
    f.save("local", "192.0.2.11 local.test");
    assert!(f.sync().await.is_err());
    assert!(f.system.writes.lock().unwrap().is_empty());
    f.state.config.lock().unwrap().write_mode = "overwrite".into();
    f.sync().await.unwrap();
    assert_eq!(f.system.writes.lock().unwrap().len(), 1);
}
