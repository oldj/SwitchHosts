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
    fail: Mutex<Option<HostsApplyError>>,
    pause: Mutex<Option<Pause>>,
}

impl SystemHosts for FakeHosts {
    fn is_current(&self, content: &str, _: &str) -> bool {
        *self.content.lock().unwrap() == content
    }
    async fn apply(&self, content: &str) -> Result<ApplyOutcome, HostsApplyError> {
        if let Some(error) = self.fail.lock().unwrap().take() {
            return Err(error);
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
    *f.system.fail.lock().unwrap() = Some(HostsApplyError::Cancelled);
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
    for invalid_dirty in [false, true] {
        let f = Fixture::new();
        if invalid_dirty {
            std::fs::write(dirty_path(&f.state), "broken json").unwrap();
        }
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
    assert!(f.state.application_recovery.is_pending());
    f.state.config.lock().unwrap().write_mode = "overwrite".into();
    f.state.application_recovery.finish_with(true);
    f.sync().await.unwrap();
    assert_eq!(f.system.writes.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn unreadable_group_member_keeps_recovery_visible_after_acknowledgement() {
    let f = Fixture::new();
    f.state.application_recovery.begin();
    f.save("local", "192.0.2.12 latest.test");
    let remote = entries::entry_path(&f.state.paths.entries_dir, "remote").unwrap();
    std::fs::remove_file(&remote).unwrap();
    std::fs::create_dir(&remote).unwrap();
    // The renderer acknowledges its earlier write while a newer source needs
    // applying. Failing to read a group member must not claim synchronization.
    f.state.application_recovery.finish_with(true);
    f.state.content_sync.mark_all();
    assert!(f.sync().await.is_err());
    assert!(f.state.application_recovery.is_pending());
    assert!(f.state.content_sync.is_pending());
    assert!(f.system.writes.lock().unwrap().is_empty());
    std::fs::remove_dir(remote).unwrap();
    f.remote_commit("127.0.0.1 remote.test");
    f.state.application_recovery.finish_with(true);
    f.sync().await.unwrap();
    assert!(f.system.content.lock().unwrap().contains("192.0.2.12"));
    assert!(!f.state.application_recovery.is_pending());
}

#[tokio::test]
async fn io_and_permission_errors_preserve_committed_content_and_retry_queue() {
    for error in [
        HostsApplyError::Io {
            message: "disk full".into(),
        },
        HostsApplyError::NoAccess {
            message: "permission denied".into(),
        },
    ] {
        let f = Fixture::new();
        f.save("local", "192.0.2.99 latest.test");
        *f.system.fail.lock().unwrap() = Some(error);
        assert!(f.sync().await.is_err());
        assert!(f.state.application_recovery.is_pending());
        assert!(f.state.content_sync.is_pending());
        assert!(f.system.writes.lock().unwrap().is_empty());
    }
}

#[tokio::test]
async fn post_apply_change_to_system_file_keeps_recovery_and_does_not_loop() {
    let f = Fixture::new();
    f.save("local", "192.0.2.99 latest.test");
    let (entered_tx, entered_rx) = oneshot::channel();
    let (resume_tx, resume_rx) = oneshot::channel();
    *f.system.pause.lock().unwrap() = Some((entered_tx, resume_rx));
    let pending = f.spawn();
    entered_rx.await.unwrap();
    *f.system.content.lock().unwrap() = "192.0.2.10 external.test".into();
    resume_tx.send(()).unwrap();
    assert!(pending.await.unwrap().is_err());
    assert!(f.state.application_recovery.is_pending());
    assert!(f.state.content_sync.is_pending());
    assert_eq!(f.system.writes.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn append_sync_uses_native_bytes_and_dedup_without_repeating_application() {
    struct FileHosts {
        path: std::path::PathBuf,
        calls: Mutex<usize>,
    }
    impl SystemHosts for FileHosts {
        fn is_current(&self, content: &str, mode: &str) -> bool {
            super::super::write::applied_content_matches_at(&self.path, content, mode)
        }
        async fn apply(&self, content: &str) -> Result<ApplyOutcome, HostsApplyError> {
            *self.calls.lock().unwrap() += 1;
            super::super::write::apply_at(
                &self.path,
                content,
                "append",
                &self.path.with_extension("backups"),
            )
        }
        fn matches(&self, expected: &str) -> bool {
            std::fs::read_to_string(&self.path)
                .unwrap()
                .replace("\r\n", "\n")
                == expected
        }
    }
    let f = Fixture::new();
    {
        let mut config = f.state.config.lock().unwrap();
        config.write_mode = "append".into();
        config.remove_duplicate_records = true;
    }
    let system = FileHosts {
        path: f.state.paths.root.join("system-hosts"),
        calls: Mutex::new(0),
    };
    std::fs::write(&system.path, "\u{feff}127.0.0.1 localhost\r\n").unwrap();
    f.save("local", "192.0.2.1 duplicate.test");
    f.remote_commit("192.0.2.2 duplicate.test other.test");
    synchronize(&f.state, &system).await.unwrap();
    let content = std::fs::read_to_string(&system.path).unwrap();
    assert!(content.starts_with("127.0.0.1 localhost"));
    assert!(content.contains("192.0.2.2 other.test"));
    assert!(content.contains("# invalid hosts (repeated): 192.0.2.2 duplicate.test"));
    f.state.content_sync.mark_all();
    synchronize(&f.state, &system).await.unwrap();
    assert_eq!(*system.calls.lock().unwrap(), 1);
    assert!(!f.state.application_recovery.is_pending());
}

#[tokio::test]
async fn find_commit_survives_exit_before_background_task_starts() {
    let mut f = Fixture::new();
    crate::find::replace_all_in_manifest(
        &f.state,
        "local.test",
        &Default::default(),
        "resumed.test",
        |_| {},
    )
    .unwrap();
    assert!(dirty_path(&f.state).exists());
    assert!(!f.system.content.lock().unwrap().contains("resumed.test"));
    // Simulate a new process; only the stored files survive.
    let state = Arc::get_mut(&mut f.state).unwrap();
    state.content_sync = Default::default();
    state.application_recovery = Default::default();
    resume_saved_changes(state).unwrap();
    f.sync().await.unwrap();
    assert!(f.system.content.lock().unwrap().contains("resumed.test"));
    assert!(!dirty_path(&f.state).exists());
}

#[tokio::test]
async fn failed_background_find_apply_keeps_durable_intent() {
    let f = Fixture::new();
    crate::find::replace_all_in_manifest(
        &f.state,
        "local.test",
        &Default::default(),
        "retry.test",
        |_| {},
    )
    .unwrap();
    *f.system.fail.lock().unwrap() = Some(HostsApplyError::Cancelled);
    assert!(f.sync().await.is_err());
    assert!(dirty_path(&f.state).exists());
    f.state.application_recovery.finish_with(true);
    f.sync().await.unwrap();
    assert!(!dirty_path(&f.state).exists());
}

#[test]
fn find_refuses_to_change_content_if_durable_intent_cannot_be_saved() {
    let f = Fixture::new();
    std::fs::create_dir(dirty_path(&f.state)).unwrap();
    assert!(crate::find::replace_all_in_manifest(
        &f.state,
        "local.test",
        &Default::default(),
        "lost.test",
        |_| {}
    )
    .is_err());
    assert!(entries::read_entry(&f.state.paths.entries_dir, "local")
        .unwrap()
        .contains("local.test"));
}

#[tokio::test]
async fn scheduler_returns_before_apply_finishes_and_keeps_running() {
    let f = Fixture::new();
    f.save("local", "192.0.2.42 background.test");
    let (entered_tx, entered_rx) = oneshot::channel();
    let (resume_tx, resume_rx) = oneshot::channel();
    *f.system.pause.lock().unwrap() = Some((entered_tx, resume_rx));
    let state = f.state.clone();
    let system = f.system.clone();
    let (finished_tx, finished_rx) = oneshot::channel();
    let task = spawn_sync(async move {
        synchronize(&state, system.as_ref()).await.unwrap();
        finished_tx.send(()).unwrap();
    });
    // The production caller drops the handle immediately. Its lifetime must
    // not cancel the application-owned task when the find command returns.
    drop(task);
    // Returning the handle did not await the apply; it is blocked on our signal.
    entered_rx.await.unwrap();
    assert!(f.state.application_recovery.is_pending());
    resume_tx.send(()).unwrap();
    finished_rx.await.unwrap();
    assert!(!f.state.application_recovery.is_pending());
    assert!(f.system.content.lock().unwrap().contains("background.test"));
}

#[tokio::test]
async fn resumed_disabled_find_source_does_not_apply_unrelated_configuration() {
    let mut f = Fixture::new();
    crate::find::replace_all_in_manifest(
        &f.state,
        "unused.test",
        &Default::default(),
        "disabled.test",
        |_| {},
    )
    .unwrap();
    *f.system.content.lock().unwrap() = "external configuration".into();
    let state = Arc::get_mut(&mut f.state).unwrap();
    state.content_sync = Default::default();
    resume_saved_changes(state).unwrap();
    f.sync().await.unwrap();
    assert_eq!(*f.system.content.lock().unwrap(), "external configuration");
    assert!(f.system.writes.lock().unwrap().is_empty());
    assert!(!dirty_path(&f.state).exists());
}

#[tokio::test]
async fn find_during_an_apply_is_reconciled_before_clearing_durable_intent() {
    let f = Fixture::new();
    crate::find::replace_all_in_manifest(
        &f.state,
        "local.test",
        &Default::default(),
        "first.test",
        |_| {},
    )
    .unwrap();
    let (entered_tx, entered_rx) = oneshot::channel();
    let (resume_tx, resume_rx) = oneshot::channel();
    *f.system.pause.lock().unwrap() = Some((entered_tx, resume_rx));
    let apply = f.spawn();
    entered_rx.await.unwrap();
    crate::find::replace_all_in_manifest(
        &f.state,
        "first.test",
        &Default::default(),
        "latest.test",
        |_| {},
    )
    .unwrap();
    assert!(dirty_path(&f.state).exists());
    resume_tx.send(()).unwrap();
    apply.await.unwrap().unwrap();
    assert!(f.system.content.lock().unwrap().contains("latest.test"));
    assert!(!dirty_path(&f.state).exists());
}

fn replace_one_local(state: &AppState, expected: &str, replacement: &str) -> Result<bool, String> {
    let content = entries::read_entry(&state.paths.entries_dir, "local").unwrap();
    let start = content.find(expected).unwrap();
    crate::find::replace_one_in_manifest(
        state,
        crate::find::FindReplaceOneArgs {
            item_id: "local".into(),
            start,
            end: start + expected.len(),
            expected: expected.into(),
            replace_to: replacement.into(),
        },
        |_| {},
    )
}

#[tokio::test]
async fn single_find_commit_is_durable_and_resumes_after_restart() {
    let mut f = Fixture::new();
    assert!(replace_one_local(&f.state, "local.test", "single.test").unwrap());
    assert_eq!(
        read_dirty(&f.state).unwrap(),
        HashSet::from(["local".into()])
    );
    let state = Arc::get_mut(&mut f.state).unwrap();
    state.content_sync = Default::default();
    resume_saved_changes(state).unwrap();
    f.sync().await.unwrap();
    assert!(f.system.content.lock().unwrap().contains("single.test"));
    assert!(!dirty_path(&f.state).exists());
}

#[test]
fn failed_single_and_first_batch_write_remove_only_their_new_intents() {
    for batch in [false, true] {
        let f = Fixture::new();
        std::fs::create_dir(f.state.paths.entries_dir.join("local.hosts.tmp")).unwrap();
        let result = if batch {
            crate::find::replace_all_in_manifest(
                &f.state,
                "test",
                &Default::default(),
                "failed",
                |_| {},
            )
            .map(|_| true)
        } else {
            replace_one_local(&f.state, "local.test", "failed.test")
        };
        assert!(result.is_err());
        assert!(!dirty_path(&f.state).exists());
        assert!(!f.state.content_sync.is_pending());
        resume_saved_changes(&f.state).unwrap();
        assert!(!f.state.content_sync.is_pending());
    }
}

#[test]
fn failed_find_preserves_prior_intent_for_the_same_or_another_entry() {
    for prior_same_entry in [false, true] {
        let f = Fixture::new();
        let expected = if prior_same_entry {
            replace_one_local(&f.state, "local.test", "saved.test").unwrap();
            "saved.test"
        } else {
            crate::find::replace_all_in_manifest(
                &f.state,
                "unused.test",
                &Default::default(),
                "saved.test",
                |_| {},
            )
            .unwrap();
            "local.test"
        };
        let before = read_dirty(&f.state).unwrap();
        std::fs::create_dir(f.state.paths.entries_dir.join("local.hosts.tmp")).unwrap();
        assert!(replace_one_local(&f.state, expected, "failed.test").is_err());
        assert_eq!(read_dirty(&f.state).unwrap(), before);
    }
}

#[test]
fn partial_find_batch_retains_only_committed_new_intents() {
    let f = Fixture::new();
    std::fs::create_dir(f.state.paths.entries_dir.join("unused.hosts.tmp")).unwrap();
    assert!(crate::find::replace_all_in_manifest(
        &f.state,
        "test",
        &Default::default(),
        "updated",
        |_| {}
    )
    .is_err());
    assert_eq!(
        read_dirty(&f.state).unwrap(),
        HashSet::from(["local".into()])
    );
    assert!(entries::read_entry(&f.state.paths.entries_dir, "local")
        .unwrap()
        .contains("updated"));
    assert!(entries::read_entry(&f.state.paths.entries_dir, "unused")
        .unwrap()
        .contains("unused.test"));
}

#[tokio::test]
async fn explicit_reapply_preserves_invalid_dirty_record_and_unblocks_find() {
    for directory in [false, true] {
        let f = Fixture::new();
        let path = dirty_path(&f.state);
        if directory {
            std::fs::create_dir(&path).unwrap();
            std::fs::write(path.join("diagnostic"), b"preserve me").unwrap();
        } else {
            std::fs::write(&path, b"broken json").unwrap();
        }
        assert!(resume_saved_changes(&f.state).is_err());
        f.state.content_sync.mark_all();
        f.state.application_recovery.finish_with(false);
        assert!(replace_one_local(&f.state, "local.test", "recovered.test").is_err());
        // Matches explicit finish -> mark_all -> reconcile after the user reapplies.
        let result = f
            .state
            .application_recovery
            .finish_and_reconcile(|| true, async {
                f.state.content_sync.mark_all();
                f.sync().await.unwrap();
                f.state
                    .application_recovery
                    .inspect_and_notify(|_| true, || {})
            })
            .await;
        assert!(result.confirmed);
        assert!(result.application_recovery.is_none());
        assert!(!path.exists());
        let backup = std::fs::read_dir(&f.state.paths.internal)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("pending-content-sync.invalid-")
            })
            .unwrap();
        assert_eq!(
            std::fs::read(if directory {
                backup.join("diagnostic")
            } else {
                backup
            })
            .unwrap(),
            if directory {
                b"preserve me".to_vec()
            } else {
                b"broken json".to_vec()
            }
        );
        assert!(replace_one_local(&f.state, "local.test", "recovered.test").unwrap());
    }
}

#[cfg(unix)]
#[tokio::test]
async fn permission_failure_preserves_dirty_record_until_access_is_restored() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new();
    replace_one_local(&f.state, "local.test", "saved.test").unwrap();
    let path = dirty_path(&f.state);
    let original = std::fs::read(&path).unwrap();
    let permissions = std::fs::metadata(&path).unwrap().permissions();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0)).unwrap();
    let denied = read_dirty(&f.state).is_err();
    // Privileged runners can bypass Unix mode bits; do not fake a denial there.
    if denied {
        assert!(f.sync().await.is_err());
        assert!(f.system.writes.lock().unwrap().is_empty());
        assert!(replace_one_local(&f.state, "saved.test", "failed.test").is_err());
    }
    std::fs::set_permissions(&path, permissions).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), original);
    f.state.application_recovery.finish_with(true);
    f.sync().await.unwrap();
    assert!(!path.exists());
    assert!(replace_one_local(&f.state, "saved.test", "retry.test").unwrap());
}

#[tokio::test]
async fn confirmed_apply_with_failed_followup_retains_find_dirty_record() {
    let f = Fixture::new();
    f.state.application_recovery.begin();
    replace_one_local(&f.state, "local.test", "deferred.test").unwrap();
    *f.system.fail.lock().unwrap() = Some(HostsApplyError::Cancelled);
    let result = f
        .state
        .application_recovery
        .finish_and_reconcile(|| true, async {
            f.state.content_sync.mark_all();
            assert!(f.sync().await.is_err());
            f.state
                .application_recovery
                .inspect_and_notify(|_| false, || {})
        })
        .await;
    assert!(result.confirmed);
    assert!(result.application_recovery.is_some());
    assert!(dirty_path(&f.state).exists());
    assert!(f.state.content_sync.is_pending());
}

#[tokio::test]
async fn invalid_dirty_without_selected_sources_never_writes_system_hosts() {
    for directory in [false, true] {
        let f = Fixture::new();
        let mut manifest = f.state.read_manifest().unwrap();
        for node in &mut manifest.root {
            node["on"] = json!(false);
        }
        manifest.save(&f.state.paths).unwrap();
        let original = f.system.content.lock().unwrap().clone();
        if directory {
            std::fs::create_dir(dirty_path(&f.state)).unwrap();
        } else {
            std::fs::write(dirty_path(&f.state), "broken json").unwrap();
        }
        f.save("local", "192.0.2.1 disabled.test");
        f.remote_commit("192.0.2.2 disabled-remote.test");
        f.sync().await.unwrap();
        assert!(f.system.writes.lock().unwrap().is_empty());
        assert_eq!(*f.system.content.lock().unwrap(), original);
        assert!(!dirty_path(&f.state).exists());
        assert!(!f.state.content_sync.is_pending());
        assert!(!f.state.application_recovery.is_pending());
    }
}

#[tokio::test]
async fn runtime_dirty_corruption_exposes_recovery_and_find_can_retry() {
    for directory in [false, true] {
        for batch in [false, true] {
            let f = Fixture::new();
            if directory {
                std::fs::create_dir(dirty_path(&f.state)).unwrap();
            } else {
                std::fs::write(dirty_path(&f.state), "broken json").unwrap();
            }
            assert!(!f.state.content_sync.is_pending());
            assert!(!f.state.application_recovery.is_pending());
            let result = if batch {
                crate::find::replace_all_in_manifest(
                    &f.state,
                    "test",
                    &Default::default(),
                    "updated",
                    |_| {},
                )
                .map(|_| true)
            } else {
                replace_one_local(&f.state, "local.test", "updated.test")
            };
            assert!(result.is_err());
            assert!(f.state.content_sync.is_pending());
            assert!(f.state.application_recovery.is_pending());
            f.sync().await.unwrap();
            assert!(dirty_path(&f.state).exists());
            assert!(f.system.writes.lock().unwrap().is_empty());
            // The existing explicit recovery clears the notice, then reconciles.
            f.state.application_recovery.finish_with(true);
            f.sync().await.unwrap();
            assert!(!dirty_path(&f.state).exists());
            assert!(replace_one_local(&f.state, "local.test", "retry.test").unwrap());
        }
    }
}

#[tokio::test]
async fn empty_content_of_a_selected_source_still_applies() {
    let f = Fixture::new();
    Manifest {
        root: vec![json!({"id":"local", "type":"local", "on":true})],
        ..Default::default()
    }
    .save(&f.state.paths)
    .unwrap();
    f.save("local", "");
    f.sync().await.unwrap();
    assert_eq!(*f.system.writes.lock().unwrap(), [String::new()]);
}

#[test]
fn unreadable_find_intent_preserves_an_active_apply_and_its_compensation() {
    let f = Fixture::new();
    let list = f.state.read_manifest().unwrap().root;
    let recovery = &f.state.application_recovery;
    recovery.record(list.clone(), "earlier".into());
    recovery.begin();
    std::fs::write(dirty_path(&f.state), "broken json").unwrap();
    assert!(replace_one_local(&f.state, "local.test", "blocked.test").is_err());
    recovery.restored_with(true);
    assert_eq!(
        recovery.inspect_and_notify(|expected| expected == "earlier", || {}),
        Some(super::super::recovery::RecoveryView::Applied { list }),
    );
    assert!(f.state.content_sync.is_pending());
}

#[tokio::test]
async fn renderer_confirmation_reconciles_a_concurrently_emptied_selection() {
    for fail_once in [false, true] {
        let f = Fixture::new();
        f.state.application_recovery.begin();
        *f.system.content.lock().unwrap() = "192.0.2.1 renderer-applied.test".into();
        Manifest::default().save(&f.state.paths).unwrap();
        if fail_once {
            *f.system.fail.lock().unwrap() = Some(HostsApplyError::Cancelled);
        }
        let result = f
            .state
            .application_recovery
            .finish_and_reconcile(|| true, async {
                f.state.content_sync.mark_after_apply();
                let result = f.sync().await;
                assert_eq!(result.is_err(), fail_once);
                f.state
                    .application_recovery
                    .inspect_and_notify(|_| false, || {})
            })
            .await;
        assert!(result.confirmed);
        if fail_once {
            assert!(result.application_recovery.is_some());
            // A later preserved-file recovery must retain this outstanding
            // selection reconciliation, even though it adds only mark_all.
            f.state.application_recovery.finish_with(true);
            f.state.content_sync.mark_all();
            f.sync().await.unwrap();
        }
        assert_eq!(*f.system.content.lock().unwrap(), "");
        assert_eq!(f.system.writes.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn preserved_empty_recovery_quarantines_dirty_without_changing_system_hosts() {
    let f = Fixture::new();
    Manifest::default().save(&f.state.paths).unwrap();
    std::fs::write(dirty_path(&f.state), "broken json").unwrap();
    f.state.application_recovery.require_reconciliation();
    let original = f.system.content.lock().unwrap().clone();
    let result = f
        .state
        .application_recovery
        .finish_and_reconcile(|| true, async {
            f.state.content_sync.mark_all(); // preserved response: no selection apply
            f.sync().await.unwrap();
            f.state
                .application_recovery
                .inspect_and_notify(|_| true, || {})
        })
        .await;
    assert!(result.confirmed);
    assert!(result.application_recovery.is_none());
    assert_eq!(*f.system.content.lock().unwrap(), original);
    assert!(f.system.writes.lock().unwrap().is_empty());
    assert!(!dirty_path(&f.state).exists());
}

#[tokio::test]
async fn preserved_finish_only_clears_empty_selection_for_an_outstanding_confirmed_apply() {
    for after_apply in [false, true] {
        let f = Fixture::new();
        Manifest::default().save(&f.state.paths).unwrap();
        let original = f.system.content.lock().unwrap().clone();
        if after_apply {
            // A confirmed renderer apply needs to reconcile a concurrent
            // deselection, but the first system write is cancelled.
            f.state.content_sync.mark_after_apply();
            *f.system.fail.lock().unwrap() = Some(HostsApplyError::Cancelled);
            assert!(f.sync().await.is_err());
        } else {
            std::fs::write(dirty_path(&f.state), "broken json").unwrap();
            f.state.content_sync.mark_all();
            f.state.application_recovery.require_reconciliation();
        }
        let target = f.state.paths.root.join("preserved-system-hosts");
        std::fs::write(&target, &original).unwrap();
        let (snapshot, _) = commands::preserve_hosts_selection(&f.state, &target)
            .await
            .unwrap();
        assert!(f.system.writes.lock().unwrap().is_empty());
        assert_eq!(std::fs::read_to_string(target).unwrap(), original);
        let result = f
            .state
            .application_recovery
            .finish_and_reconcile(|| f.system.matches(&snapshot.new_content), async {
                f.state.content_sync.mark_all();
                f.sync().await.unwrap();
                f.state
                    .application_recovery
                    .inspect_and_notify(|_| true, || {})
            })
            .await;
        assert!(result.confirmed);
        assert!(result.application_recovery.is_none());
        assert_eq!(
            *f.system.content.lock().unwrap(),
            if after_apply { "" } else { &original }
        );
        assert_eq!(
            f.system.writes.lock().unwrap().len(),
            usize::from(after_apply)
        );
        assert!(!f.state.content_sync.is_pending());
    }
}
