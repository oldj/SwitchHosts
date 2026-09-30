use super::*;
use crate::storage::{AppConfig, V5Paths};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{atomic::AtomicBool, Mutex};

struct Fixture {
    state: AppState,
}

impl Fixture {
    fn empty() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let root = std::env::temp_dir().join(format!(
            "switchhosts-storage-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
        let paths = V5Paths::under(root);
        paths.ensure_dirs().unwrap();
        Self {
            state: AppState {
                paths,
                config: Mutex::new(AppConfig::default()),
                store_lock: Mutex::new(()),
                config_write_lock: Mutex::new(()),
                update_check_lock: tokio::sync::Mutex::new(()),
                is_will_quit: AtomicBool::new(false),
                last_geometry_persist_ms: AtomicU64::new(0),
                data_dir_recovery: None,
            },
        }
    }

    fn populated() -> Self {
        let fixture = Self::empty();
        Manifest {
            root: vec![json!({"id":"live", "type":"local", "title":"Live"})],
            ..Default::default()
        }
        .save(&fixture.state.paths)
        .unwrap();
        let mut trashcan = Trashcan::default();
        trashcan.add_item(
            json!({"id":"deleted", "type":"folder", "children":[
                {"id":"child", "type":"local", "title":"Deleted child"}
            ]}),
            None,
        );
        trashcan.save(&fixture.state.paths.trashcan_file).unwrap();
        for id in ["live", "child"] {
            entries::write_entry(
                &fixture.state.paths.entries_dir,
                id,
                &format!("127.0.0.1 {id}.test\n"),
            )
            .unwrap();
        }
        fixture
    }

    fn snapshot(&self) -> BTreeMap<PathBuf, Option<Vec<u8>>> {
        fn walk(root: &Path, dir: &Path, files: &mut BTreeMap<PathBuf, Option<Vec<u8>>>) {
            for entry in std::fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                let relative = path.strip_prefix(root).unwrap().to_path_buf();
                if path.is_dir() {
                    files.insert(relative, None);
                    walk(root, &path, files);
                } else {
                    files.insert(relative, Some(std::fs::read(path).unwrap()));
                }
            }
        }
        let mut files = BTreeMap::new();
        walk(&self.state.paths.root, &self.state.paths.root, &mut files);
        files
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.state.paths.root);
    }
}

#[derive(Clone, Copy, Debug)]
enum Operation {
    Set,
    Move,
    Clear,
    Delete,
    Restore,
}

fn run(state: &AppState, operation: Operation) -> Result<Value, StorageError> {
    match operation {
        Operation::Set => set_list_inner(state, vec![json!([{"id":"new", "type":"local"}])]),
        Operation::Move => move_ids_to_trashcan(state, &["live".into()]).map(|_| Value::Null),
        Operation::Clear => clear_trashcan_inner(state, vec![]),
        Operation::Delete => delete_item_from_trashcan_inner(state, vec![json!("deleted")]),
        Operation::Restore => restore_item_from_trashcan_inner(state, vec![json!("deleted")]),
    }
}

fn assert_load_failure_preserves_storage(manifest: bool, unreadable: bool) {
    let operations = if manifest {
        vec![Operation::Set, Operation::Move, Operation::Restore]
    } else {
        vec![
            Operation::Move,
            Operation::Clear,
            Operation::Delete,
            Operation::Restore,
        ]
    };
    for operation in operations {
        let fixture = Fixture::populated();
        let paths = &fixture.state.paths;
        let file = if manifest {
            &paths.manifest_file
        } else {
            &paths.trashcan_file
        };
        if unreadable {
            // A directory at the expected file path reliably fails reads on
            // every supported OS, including tests run with elevated privileges.
            std::fs::remove_file(file).unwrap();
            std::fs::create_dir(file).unwrap();
        } else {
            std::fs::write(file, br#"{"unfinished": ["#).unwrap();
        }
        let before = fixture.snapshot();
        let error = run(&fixture.state, operation).unwrap_err();
        assert!(
            if unreadable {
                matches!(error, StorageError::Io { .. })
            } else {
                matches!(error, StorageError::Parse { .. })
            },
            "{operation:?}: {error}"
        );
        assert_eq!(
            fixture.snapshot(),
            before,
            "{operation:?} must not modify any storage file"
        );
    }
}

#[test]
fn corrupt_manifest_preserves_storage_for_all_mutations() {
    assert_load_failure_preserves_storage(true, false);
}

#[test]
fn corrupt_trashcan_preserves_storage_for_all_mutations() {
    assert_load_failure_preserves_storage(false, false);
}

#[test]
fn unreadable_manifest_preserves_storage_for_all_mutations() {
    assert_load_failure_preserves_storage(true, true);
}

#[test]
fn unreadable_trashcan_preserves_storage_for_all_mutations() {
    assert_load_failure_preserves_storage(false, true);
}

#[test]
fn missing_files_allow_initialization_and_empty_trashcan_operations() {
    for operation in [
        Operation::Set,
        Operation::Move,
        Operation::Clear,
        Operation::Delete,
        Operation::Restore,
    ] {
        let fixture = Fixture::empty();
        run(&fixture.state, operation).unwrap();
        let manifest = load_manifest(&fixture.state).unwrap();
        assert_eq!(
            manifest.root.len(),
            usize::from(matches!(operation, Operation::Set))
        );
        assert!(load_trashcan(&fixture.state).unwrap().items.is_empty());
    }
}

#[test]
fn move_creates_missing_trashcan_without_losing_content() {
    let fixture = Fixture::populated();
    std::fs::remove_file(&fixture.state.paths.trashcan_file).unwrap();
    run(&fixture.state, Operation::Move).unwrap();
    assert!(load_manifest(&fixture.state).unwrap().root.is_empty());
    assert_eq!(
        load_trashcan(&fixture.state).unwrap().items[0]["data"]["id"],
        "live"
    );
    assert_eq!(
        entries::read_entry(&fixture.state.paths.entries_dir, "live").unwrap(),
        "127.0.0.1 live.test\n"
    );
}

#[test]
fn restore_creates_missing_manifest_and_preserves_nested_content() {
    let fixture = Fixture::populated();
    std::fs::remove_file(&fixture.state.paths.manifest_file).unwrap();
    assert_eq!(
        run(&fixture.state, Operation::Restore).unwrap(),
        json!(true)
    );
    assert_eq!(
        load_manifest(&fixture.state).unwrap().root[0]["children"][0]["id"],
        "child"
    );
    assert!(load_trashcan(&fixture.state).unwrap().items.is_empty());
    assert_eq!(
        entries::read_entry(&fixture.state.paths.entries_dir, "child").unwrap(),
        "127.0.0.1 child.test\n"
    );
}

#[test]
fn move_and_restore_round_trip_without_duplicates() {
    let fixture = Fixture::populated();
    for _ in 0..2 {
        run(&fixture.state, Operation::Move).unwrap();
    }
    assert!(load_manifest(&fixture.state).unwrap().root.is_empty());
    assert_eq!(load_trashcan(&fixture.state).unwrap().items.len(), 2);
    assert_eq!(
        restore_item_from_trashcan_inner(&fixture.state, vec![json!("live")]).unwrap(),
        json!(true)
    );
    assert_eq!(
        restore_item_from_trashcan_inner(&fixture.state, vec![json!("live")]).unwrap(),
        json!(false)
    );
    assert_eq!(load_manifest(&fixture.state).unwrap().root.len(), 1);
    assert_eq!(load_trashcan(&fixture.state).unwrap().items.len(), 1);
}
