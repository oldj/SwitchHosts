use super::*;
use crate::storage::{AppConfig, V5Paths};
use serde_json::json;
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Mutex};

struct Fixture(AppState);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "swh-history-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let paths = V5Paths::under(root);
        paths.ensure_dirs().unwrap();
        let state = AppState {
            paths,
            config: Mutex::new(AppConfig::default()),
            store_lock: Mutex::new(()),
            application_recovery: Default::default(),
            config_write_lock: Mutex::new(()),
            update_check_lock: tokio::sync::Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
            data_dir_recovery: None,
        };
        state.persist_config().unwrap();
        Self(state)
    }
    fn path(&self) -> PathBuf {
        self.0.paths.histories_dir.join("system-hosts.json")
    }
    fn seed(&self, count: usize) {
        let items = (0..count)
            .map(|i| ApplyHistoryItem {
                id: format!("{i}"),
                content: format!("content-{i}"),
                add_time_ms: i as i64,
                label: None,
            })
            .collect::<Vec<_>>();
        save(&self.path(), &items).unwrap();
    }
    fn confirmation(&self, limit: u32) -> LimitConfirmation {
        let preview = update_limit(&self.0, limit, None).unwrap();
        assert!(preview.confirmation_required);
        LimitConfirmation {
            previous_limit: preview.previous_limit,
            delete_count: preview.delete_count,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0.paths.root);
    }
}

#[test]
fn lowering_limit_only_writes_after_confirmation_and_keeps_latest() {
    let f = Fixture::new();
    f.seed(50);
    let original = std::fs::read(f.path()).unwrap();
    let config = std::fs::read(&f.0.paths.config_file).unwrap();
    let confirmation = f.confirmation(10);
    assert_eq!(confirmation.delete_count, 40);
    // Canceling is simply discarding the preview; neither file has changed.
    assert_eq!(std::fs::read(f.path()).unwrap(), original);
    assert_eq!(std::fs::read(&f.0.paths.config_file).unwrap(), config);
    assert_eq!(f.0.config.lock().unwrap().history_limit, 50);
    let result = update_limit(&f.0, 10, Some(confirmation)).unwrap();
    assert!(!result.confirmation_required);
    let items = load(&f.path()).unwrap();
    assert_eq!(items.len(), 10);
    assert_eq!(items.first().unwrap().id, "40");
    assert_eq!(items.last().unwrap().id, "49");
    assert_eq!(
        AppConfig::load_checked(&f.0.paths.config_file)
            .unwrap()
            .history_limit,
        10
    );
    assert_eq!(f.0.config.lock().unwrap().history_limit, 10);
}

#[test]
fn non_destructive_changes_save_directly_and_zero_keeps_unlimited_semantics() {
    let f = Fixture::new();
    f.seed(2);
    for limit in [10, 100, 0, u32::MAX] {
        assert!(
            !update_limit(&f.0, limit, None)
                .unwrap()
                .confirmation_required
        );
        assert_eq!(load(&f.path()).unwrap().len(), 2);
        assert_eq!(f.0.config.lock().unwrap().history_limit, limit);
    }
    let mut records: Vec<_> = (0..10_000).collect();
    assert_eq!(trim(&mut records, 0), 0);
    assert_eq!(trim(&mut records, 10), 9_990);
    assert_eq!(records, (9_990..10_000).collect::<Vec<_>>());
}

#[test]
fn changed_count_or_setting_requires_a_new_confirmation() {
    let f = Fixture::new();
    f.seed(50);
    let confirmation = f.confirmation(10);
    delete_by_id(&f.path(), "0").unwrap();
    let result = update_limit(&f.0, 10, Some(confirmation)).unwrap();
    assert!(result.confirmation_required);
    assert_eq!(result.delete_count, 39);
    assert_eq!(f.0.config.lock().unwrap().history_limit, 50);
    let confirmation = f.confirmation(10);
    update_limit(&f.0, 100, None).unwrap();
    assert!(
        update_limit(&f.0, 10, Some(confirmation))
            .unwrap()
            .confirmation_required
    );
    assert_eq!(load(&f.path()).unwrap().len(), 49);
}

#[test]
fn failed_history_write_rolls_back_config_and_preserves_records() {
    let f = Fixture::new();
    f.seed(50);
    let confirmation = f.confirmation(10);
    let original = std::fs::read(f.path()).unwrap();
    let config = std::fs::read(&f.0.paths.config_file).unwrap();
    // Fail the history write after the new config has been saved, on all OSes.
    std::fs::create_dir(f.path().with_file_name("system-hosts.json.tmp")).unwrap();
    assert!(update_limit(&f.0, 10, Some(confirmation)).is_err());
    assert_eq!(std::fs::read(&f.0.paths.config_file).unwrap(), config);
    assert_eq!(std::fs::read(f.path()).unwrap(), original);
    assert_eq!(f.0.config.lock().unwrap().history_limit, 50);
    assert!(!f.0.paths.internal.join("storage-transaction.json").exists());
}

#[test]
fn disabled_recording_and_noop_leave_existing_file_untouched() {
    let f = Fixture::new();
    f.seed(3);
    let original = std::fs::read(f.path()).unwrap();
    f.0.config.lock().unwrap().history_enabled = false;
    record_change(&f.0, "old", "new").unwrap();
    assert_eq!(std::fs::read(f.path()).unwrap(), original);
    f.0.config.lock().unwrap().history_enabled = true;
    record_change(&f.0, "same", "same").unwrap();
    assert_eq!(std::fs::read(f.path()).unwrap(), original);
    record_change(&f.0, "content-2", "new").unwrap();
    let records = load(&f.path()).unwrap();
    assert_eq!(records.len(), 4);
    assert_eq!(records.last().unwrap().content, "new");
}

#[test]
fn maintenance_and_recording_trim_large_legacy_files() {
    let f = Fixture::new();
    f.seed(10_561);
    enforce_limit(&f.path(), 50).unwrap();
    let records = load(&f.path()).unwrap();
    assert_eq!(records.len(), 50);
    assert_eq!(records[0].id, "10511");
    record_change(&f.0, "external edit", "new").unwrap();
    let records = load(&f.path()).unwrap();
    assert_eq!(records.len(), 50);
    assert_eq!(records[48].content, "external edit");
    assert_eq!(records[49].content, "new");
}

#[test]
fn corrupt_history_is_never_replaced_by_recording_or_maintenance() {
    let f = Fixture::new();
    for bytes in [
        "{broken",
        r#"[{"id":"valid","content":"hosts","add_time_ms":0},null]"#,
    ] {
        std::fs::write(f.path(), bytes).unwrap();
        assert!(record_change(&f.0, "old", "new").is_err());
        assert!(enforce_limit(&f.path(), 10).is_err());
        assert!(update_limit(&f.0, 10, None).is_err());
        assert_eq!(std::fs::read_to_string(f.path()).unwrap(), bytes);
    }
}

#[test]
fn concurrent_recording_and_deletion_do_not_resurrect_or_lose_records() {
    let f = Fixture::new();
    f.seed(2);
    update_limit(&f.0, 0, None).unwrap();
    std::thread::scope(|scope| {
        for i in 0..20 {
            let state = &f.0;
            scope.spawn(move || {
                record_change(state, &format!("old-{i}"), &format!("new-{i}")).unwrap()
            });
        }
        scope.spawn(|| {
            let _guard = f.0.lock_store().unwrap();
            delete_by_id(&f.path(), "0").unwrap();
        });
    });
    let records = load(&f.path()).unwrap();
    assert_eq!(records.len(), 41);
    assert!(!records.iter().any(|record| record.id == "0"));
    for i in 0..20 {
        assert!(records
            .iter()
            .any(|record| record.content == format!("new-{i}")));
    }
    let unique = records
        .iter()
        .map(|item| &item.id)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(unique.len(), records.len());
}

#[test]
fn import_preserves_local_history_even_when_backup_contains_history() {
    let f = Fixture::new();
    f.seed(10);
    let original = std::fs::read(f.path()).unwrap();
    let backup = json!({"version": [4], "data": {
        "list": {"tree": [{"id":"imported", "type":"local"}]},
        "collection": {
            "hosts": {"data": [{"id":"imported", "content":"hosts"}]},
            "history": {"data": [{"id":"foreign", "content":"foreign history"}]}
        }
    }});
    crate::import_export::preview::replace_for_test(&backup, &f.0.paths);
    assert_eq!(std::fs::read(f.path()).unwrap(), original);
}

#[test]
fn migration_caps_active_history_but_preserves_original_archive() {
    let f = Fixture::new();
    let paths = &f.0.paths;
    let legacy = paths.root.join("data/collection/history");
    std::fs::create_dir_all(legacy.join("data")).unwrap();
    std::fs::create_dir_all(paths.root.join("config/dict")).unwrap();
    std::fs::write(
        paths.root.join("config/dict/cfg.json"),
        r#"{"history_limit":10}"#,
    )
    .unwrap();
    let ids = (0..60).map(|i| i.to_string()).collect::<Vec<_>>();
    std::fs::write(legacy.join("ids.json"), serde_json::to_vec(&ids).unwrap()).unwrap();
    for id in &ids {
        let value = json!({"id": id, "content":"hosts", "add_time_ms":0});
        std::fs::write(
            legacy.join("data").join(format!("{id}.json")),
            value.to_string(),
        )
        .unwrap();
    }
    let outcome = crate::migration::run_if_needed(paths).unwrap();
    let crate::migration::MigrationOutcome::Applied {
        history_items,
        archive_dir_name,
        ..
    } = outcome
    else {
        panic!("expected migration")
    };
    assert_eq!(history_items, 10);
    assert_eq!(load(&f.path()).unwrap()[0].id, "50");
    let archived = paths
        .root
        .join("v4")
        .join(archive_dir_name)
        .join("data/collection/history/data");
    assert_eq!(std::fs::read_dir(archived).unwrap().count(), 60);
}

#[test]
fn config_defaults_enable_recording_but_malformed_config_is_not_a_retention_policy() {
    let f = Fixture::new();
    std::fs::write(&f.0.paths.config_file, r#"{"history_limit":10}"#).unwrap();
    assert!(
        AppConfig::load_checked(&f.0.paths.config_file)
            .unwrap()
            .history_enabled
    );
    std::fs::write(&f.0.paths.config_file, "{broken").unwrap();
    assert!(AppConfig::load_checked(&f.0.paths.config_file).is_err());
    assert_eq!(
        std::fs::read_to_string(&f.0.paths.config_file).unwrap(),
        "{broken"
    );
}

#[test]
fn retention_crash_child() {
    let Some(root) = std::env::var_os("SWH_HISTORY_CRASH_ROOT") else {
        return;
    };
    let paths = V5Paths::under(root.into());
    let _: Result<(), StorageError> =
        transaction::run(&paths, vec![Target::Config, Target::ApplyHistory], || {
            let mut config = AppConfig::load_checked(&paths.config_file)?;
            config.history_limit = 10;
            config.save(&paths.config_file)?;
            enforce_limit(&paths.histories_dir.join("system-hosts.json"), 10)?;
            // Exit before the transaction commit marker is removed.
            std::process::exit(77);
        });
    panic!("child should exit before commit");
}

#[test]
fn interrupted_retention_commit_recovers_both_files() {
    let f = Fixture::new();
    f.seed(50);
    let original_history = std::fs::read(f.path()).unwrap();
    let original_config = std::fs::read(&f.0.paths.config_file).unwrap();
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "hosts_apply::history::tests::retention_crash_child",
        ])
        .env("SWH_HISTORY_CRASH_ROOT", &f.0.paths.root)
        .output()
        .unwrap()
        .status;
    assert_eq!(status.code(), Some(77));
    assert_eq!(load(&f.path()).unwrap().len(), 10);
    transaction::recover(&f.0.paths).unwrap();
    assert_eq!(std::fs::read(f.path()).unwrap(), original_history);
    assert_eq!(
        std::fs::read(&f.0.paths.config_file).unwrap(),
        original_config
    );
}

#[test]
fn config_write_after_failed_retention_rollback_survives_later_reads() {
    let f = Fixture::new();
    f.seed(50);
    let blocker = f.0.paths.config_file.with_file_name("config.json.tmp");
    let result: Result<(), StorageError> = transaction::run(
        &f.0.paths,
        vec![Target::Config, Target::ApplyHistory],
        || {
            let mut config = AppConfig::load_checked(&f.0.paths.config_file)?;
            config.history_limit = 10;
            config.save(&f.0.paths.config_file)?;
            // The write failed and the config cannot yet be rolled back.
            std::fs::create_dir(&blocker).unwrap();
            Err(StorageError::Conflict {
                reason: "simulated history write failure".into(),
            })
        },
    );
    assert!(result.is_err());
    assert!(f.0.paths.internal.join("storage-transaction.json").exists());
    std::fs::remove_dir(blocker).unwrap();
    // The tray's config writer is allowed to retry after storage is repaired.
    let _writer = f.0.config_write_lock.lock().unwrap();
    f.0.config.lock().unwrap().theme = "dark".into();
    f.0.persist_config().unwrap();
    let _store = f.0.lock_store().unwrap();
    let saved = AppConfig::load_checked(&f.0.paths.config_file).unwrap();
    assert_eq!(saved.theme, "dark");
    assert_eq!(saved.history_limit, 50);
    assert_eq!(load(&f.path()).unwrap().len(), 50);
}

#[test]
fn importing_hosts_without_history_does_not_require_readable_retention_config() {
    let f = Fixture::new();
    std::fs::write(&f.0.paths.config_file, "{broken").unwrap();
    let backup = json!({"version": [4], "data": {
        "list": {"tree": [{"id":"imported", "type":"local"}]},
        "collection": {"hosts": {"data": [{"id":"imported", "content":"127.0.0.1 example.test"}]}}
    }});
    let root = crate::import_export::preview::replace_for_test(&backup, &f.0.paths);
    assert_eq!(
        crate::storage::entries::read_entry(
            &f.0.paths.entries_dir,
            root[0]["id"].as_str().unwrap()
        )
        .unwrap(),
        "127.0.0.1 example.test"
    );
    assert_eq!(
        std::fs::read_to_string(&f.0.paths.config_file).unwrap(),
        "{broken"
    );
}
