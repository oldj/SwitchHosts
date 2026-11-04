use super::*;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Fixture {
    base: PathBuf,
    paths: V5Paths,
    config_dir: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let base = std::env::temp_dir().join(format!(
            "swh-998-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&base).unwrap();
        let paths = V5Paths::under(base.join(".SwitchHosts"));
        paths.ensure_dirs().unwrap();
        write_json(
            &paths.root.join("config/dict/cfg.json"),
            json!({"theme":"dark"}),
        );
        Self {
            config_dir: base.join("app-config"),
            paths,
            base,
        }
    }

    fn pointer(&self, settings: Value) {
        write_json(
            &self
                .config_dir
                .join("SwitchHosts/swh_local/dict/local.json"),
            settings,
        );
    }

    fn migrate(&self) -> MigrationOutcome {
        migrate(&self.paths, Some(&self.config_dir)).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

fn write_json(path: &Path, value: Value) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, value.to_string()).unwrap();
}

fn seed_store(root: &Path) {
    write_json(
        &root.join("data/list/tree.json"),
        json!([
            {"type":"folder","id":"folder","children":[{"id":"local","type":"local"}]},
            {"type":"group","id":"group","include":["local"]}
        ]),
    );
    let hosts = root.join("data/collection/hosts");
    write_json(&hosts.join("ids.json"), json!(["1"]));
    write_json(
        &hosts.join("data/1.json"),
        json!({"id":"local","content":"127.0.0.1 legacy.test"}),
    );
}

fn assert_migrated(paths: &V5Paths) {
    let tree = Manifest::load(paths).unwrap().root;
    assert_eq!(tree[0]["children"][0]["id"], "local");
    assert_eq!(tree[1]["include"], json!(["local"]));
    assert_eq!(
        entries::read_entry(&paths.entries_dir, "local").unwrap(),
        "127.0.0.1 legacy.test"
    );
}

#[test]
fn migration_uses_electron_data_dir_and_preserves_external_store() {
    let f = Fixture::new();
    let custom = f.base.join("custom folder");
    seed_store(&custom);
    write_json(
        &f.paths.root.join("data/list/tree.json"),
        json!([{"type":"local","id":"stale"}]),
    );
    f.pointer(json!({"data_dir":custom}));
    let MigrationOutcome::Applied {
        archive_dir_name, ..
    } = f.migrate()
    else {
        panic!("migration did not run")
    };
    assert_migrated(&f.paths);
    assert_eq!(
        AppConfig::load_checked(&f.paths.config_file).unwrap().theme,
        "dark"
    );
    assert!(custom.join("data/collection/hosts/data/1.json").is_file());
    assert!(f.paths.root.join("data/list/tree.json").is_file());
    assert!(f
        .paths
        .root
        .join("v4")
        .join(archive_dir_name)
        .join("config/dict/cfg.json")
        .is_file());
    f.pointer(json!({"data_dir":"invalid"}));
    assert!(matches!(f.migrate(), MigrationOutcome::AlreadyMigrated));
}

#[test]
fn migration_retries_config_only_when_default_or_external_data_returns() {
    for external in [false, true] {
        let f = Fixture::new();
        let source = if external {
            let removable = f.base.join("removable");
            f.pointer(json!({"data_dir":removable}));
            seed_store(&f.paths.root); // stale default store must not win
            removable
        } else {
            f.paths.root.clone()
        };
        assert!(matches!(f.migrate(), MigrationOutcome::Deferred));
        assert!(!f.paths.manifest_file.exists());
        assert!(!f.paths.root.join("v4").exists());
        assert!(f.paths.root.join("config/dict/cfg.json").is_file());
        let mut cfg = AppConfig::load_checked(&f.paths.config_file).unwrap();
        assert_eq!(cfg.theme, "dark");
        cfg.theme = "light".into();
        cfg.save(&f.paths.config_file).unwrap();
        let history_file = f.paths.histories_dir.join("system-hosts.json");
        let live_history = json!([{"id":"v5","content":"new","add_time_ms":42}]);
        write_json(&history_file, live_history.clone());
        seed_store(&source);
        write_json(
            &source.join("data/collection/history/ids.json"),
            json!(["1"]),
        );
        write_json(
            &source.join("data/collection/history/data/1.json"),
            json!({"id":"v4","content":"old","add_time_ms":1}),
        );
        assert!(matches!(
            f.migrate(),
            MigrationOutcome::Applied {
                history_items: 0,
                ..
            }
        ));
        assert_eq!(
            fs::read_to_string(history_file).unwrap(),
            live_history.to_string()
        );
        assert_migrated(&f.paths);
        assert_eq!(
            AppConfig::load_checked(&f.paths.config_file).unwrap().theme,
            "light"
        );
    }
}

#[test]
fn migration_ignores_unrelated_electron_settings_but_defers_an_invalid_pointer() {
    let f = Fixture::new();
    seed_store(&f.paths.root);
    f.pointer(json!({"data_dir":"relative"}));
    assert!(matches!(f.migrate(), MigrationOutcome::Deferred));
    assert!(!f.paths.manifest_file.exists());
    f.pointer(json!({"other_key":true}));
    let MigrationOutcome::Applied {
        archive_dir_name, ..
    } = f.migrate()
    else {
        panic!("migration did not run")
    };
    assert_migrated(&f.paths);
    assert!(f
        .paths
        .root
        .join("v4")
        .join(archive_dir_name)
        .join("data/list/tree.json")
        .is_file());
}

#[test]
fn migration_can_recover_a_copy_separately_from_an_existing_v5_manifest() {
    let f = Fixture::new();
    let custom = f.base.join("v4 data");
    seed_store(&custom);
    f.pointer(json!({"data_dir":custom}));
    Manifest::default().save(&f.paths).unwrap(); // v5.0.3 already committed an empty list
    let before = fs::read(&f.paths.manifest_file).unwrap();
    assert!(matches!(f.migrate(), MigrationOutcome::AlreadyMigrated));

    // Select an isolated copy as the v5 data directory (without copying the live v5 files).
    let recovered = V5Paths::under(f.base.join("recovery/SwitchHosts.data"));
    recovered.ensure_dirs().unwrap();
    crate::storage::fs_copy::copy_dir_recursive(&custom.join("data"), &recovered.root.join("data"))
        .unwrap();
    assert!(matches!(
        run_if_needed(&recovered).unwrap(),
        MigrationOutcome::Applied { .. }
    ));
    assert_migrated(&recovered);
    assert_eq!(fs::read(&f.paths.manifest_file).unwrap(), before);
    assert!(custom.join("data/list/tree.json").is_file());
}

#[cfg(unix)]
#[test]
fn dangling_electron_pointer_does_not_select_the_stale_default_store() {
    let f = Fixture::new();
    seed_store(&f.paths.root);
    let pointer = f.config_dir.join("SwitchHosts/swh_local/dict/local.json");
    fs::create_dir_all(pointer.parent().unwrap()).unwrap();
    let target = f.base.join("unmounted-local.json");
    std::os::unix::fs::symlink(&target, &pointer).unwrap();
    assert!(matches!(f.migrate(), MigrationOutcome::Deferred));
    assert!(!f.paths.manifest_file.exists());
    assert!(f.paths.root.join("data/list/tree.json").is_file());
    let custom = f.base.join("restored");
    seed_store(&custom);
    write_json(&target, json!({"data_dir":custom}));
    assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
    assert!(f.paths.root.join("data/list/tree.json").is_file());
}

#[test]
fn partial_external_store_can_finish_after_the_missing_file_returns() {
    for missing in [
        "list/tree.json",
        "collection/hosts/data/1.json",
        "collection/hosts/ids.json",
    ] {
        let f = Fixture::new();
        let custom = f.base.join("cloud drive");
        seed_store(&custom);
        f.pointer(json!({"data_dir":custom}));
        write_json(&custom.join("data/list/trashcan.json"), json!([]));
        let missing_file = custom.join("data").join(missing);
        let saved = fs::read(&missing_file).unwrap();
        fs::remove_file(&missing_file).unwrap();
        assert!(
            matches!(f.migrate(), MigrationOutcome::Deferred),
            "{missing}"
        );
        assert!(!f.paths.manifest_file.exists());
        assert!(!f.paths.root.join("v4").exists());
        fs::write(missing_file, saved).unwrap();
        assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
        assert_migrated(&f.paths);
    }
}

#[test]
fn archiving_preferences_does_not_move_a_nested_v4_custom_store() {
    let f = Fixture::new();
    let custom = f.paths.root.join("config/custom");
    seed_store(&custom);
    f.pointer(json!({"data_dir":custom}));
    assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
    assert_migrated(&f.paths);
    assert!(custom.join("data/list/tree.json").is_file());
}

#[test]
fn valid_trash_only_store_recovers_nested_hosts() {
    let f = Fixture::new();
    seed_store(&f.paths.root);
    fs::remove_file(f.paths.root.join("data/list/tree.json")).unwrap();
    write_json(
        &f.paths.root.join("data/list/trashcan.json"),
        json!([{
            "data":{"type":"folder","id":"removed","children":[{"id":"local"}]}
        }]),
    );
    let hosts = f.paths.root.join("data/collection/hosts");
    write_json(&hosts.join("ids.json"), json!(["1", "2"]));
    write_json(
        &hosts.join("data/2.json"),
        json!({"id":"removed","type":"folder"}),
    );
    assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
    assert_eq!(
        Trashcan::load(&f.paths.trashcan_file).unwrap().items.len(),
        1
    );
    assert_eq!(
        entries::read_entry(&f.paths.entries_dir, "local").unwrap(),
        "127.0.0.1 legacy.test"
    );
}

#[test]
fn migration_retries_an_interrupted_v5_write_without_archiving_the_source() {
    let f = Fixture::new();
    seed_store(&f.paths.root);
    fs::create_dir(&f.paths.trashcan_file).unwrap();
    assert!(migrate(&f.paths, Some(&f.config_dir)).is_err());
    assert!(!f.paths.manifest_file.exists());
    assert!(f.paths.root.join("data/list/tree.json").is_file());
    fs::remove_dir(&f.paths.trashcan_file).unwrap();
    assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
    assert_migrated(&f.paths);
}

#[test]
fn migration_rejects_paths_in_a_shared_collection_index() {
    let f = Fixture::new();
    let custom = f.base.join("shared");
    seed_store(&custom);
    f.pointer(json!({"data_dir":custom}));
    write_json(
        &custom.join("data/collection/history/ids.json"),
        json!(["../../hosts/data/1"]),
    );
    assert!(matches!(f.migrate(), MigrationOutcome::Deferred));
    assert!(!f.paths.manifest_file.exists());
}

#[test]
fn deferred_source_errors_keep_legacy_preferences_available_before_retry() {
    for invalid_pointer in [true, false] {
        let f = Fixture::new();
        let custom = f.base.join("external");
        if invalid_pointer {
            f.pointer(json!({"data_dir":"relative"}));
        } else {
            f.pointer(json!({"data_dir":custom}));
            fs::create_dir_all(custom.join("data")).unwrap();
            fs::write(custom.join("data/list"), "unavailable directory").unwrap();
        }
        assert!(matches!(f.migrate(), MigrationOutcome::Deferred));
        let mut live = AppConfig::load_checked(&f.paths.config_file).unwrap();
        assert_eq!(live.theme, "dark");
        live.locale = Some("ja".into());
        live.save(&f.paths.config_file).unwrap();
        if !invalid_pointer {
            fs::remove_file(custom.join("data/list")).unwrap();
        }
        seed_store(&custom);
        f.pointer(json!({"data_dir":custom}));
        assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
        let config = AppConfig::load_checked(&f.paths.config_file).unwrap();
        assert_eq!(config.theme, "dark");
        assert_eq!(config.locale.as_deref(), Some("ja"));
    }
}

#[test]
fn external_snapshot_with_an_unusable_record_retries_before_committing() {
    let f = Fixture::new();
    let custom = f.base.join("shared");
    seed_store(&custom);
    f.pointer(json!({"data_dir":custom}));
    let record = custom.join("data/collection/hosts/data/1.json");
    let original = fs::read(&record).unwrap();
    for incomplete in [
        r#"{"id":"local","content":"#,
        r#"{"content":"hosts without id"}"#,
        r#"{"id":"local","content":null}"#,
        r#"{"id":"../invalid","content":"test"}"#,
    ] {
        fs::write(&record, incomplete).unwrap();
        assert!(matches!(f.migrate(), MigrationOutcome::Deferred));
        assert!(!f.paths.manifest_file.exists());
        assert!(!f.paths.root.join("v4").exists());
    }
    fs::write(&record, original).unwrap();
    assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
    assert_migrated(&f.paths);
}

#[cfg(unix)]
#[test]
fn archiving_keeps_both_links_in_an_external_v4_store_path() {
    let f = Fixture::new();
    let custom = f.base.join("external");
    let intermediate = f.paths.root.join("config/nested");
    let volume = f.base.join("volume");
    seed_store(&volume);
    fs::create_dir_all(&intermediate).unwrap();
    std::os::unix::fs::symlink(&intermediate, &custom).unwrap();
    std::os::unix::fs::symlink(volume.join("data"), intermediate.join("data")).unwrap();
    f.pointer(json!({"data_dir":custom}));
    assert!(matches!(f.migrate(), MigrationOutcome::Applied { .. }));
    assert_migrated(&f.paths);
    assert!(custom.join("data/list/tree.json").is_file());
}

#[test]
fn default_store_parse_errors_still_surface_without_committing() {
    let f = Fixture::new();
    seed_store(&f.paths.root);
    fs::write(f.paths.root.join("data/list/tree.json"), "[").unwrap();
    assert!(matches!(
        migrate(&f.paths, None),
        Err(StorageError::Parse { .. })
    ));
    assert!(!f.paths.manifest_file.exists());
}
