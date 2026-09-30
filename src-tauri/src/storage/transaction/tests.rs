use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

struct Fixture(V5Paths);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let paths = V5Paths::under(std::env::temp_dir().join(format!(
            "swh-transaction-{}-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        )));
        paths.ensure_dirs().unwrap();
        std::fs::write(&paths.manifest_file, b"original manifest").unwrap();
        std::fs::write(&paths.trashcan_file, b"original trashcan").unwrap();
        Self(paths)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0.root);
    }
}
fn injected_error() -> StorageError {
    StorageError::Io {
        path: "injected".into(),
        reason: "injected failure".into(),
    }
}

#[test]
fn failure_after_first_write_restores_both_files_and_allows_retry() {
    let fixture = Fixture::new();
    let paths = &fixture.0;
    let targets = vec![Target::Manifest, Target::Trashcan];
    let result: Result<(), _> = run(paths, targets.clone(), || {
        atomic_write(&paths.manifest_file, b"changed")?;
        Err(injected_error())
    });
    assert!(result.is_err());
    assert_eq!(
        std::fs::read(&paths.manifest_file).unwrap(),
        b"original manifest"
    );
    assert_eq!(
        std::fs::read(&paths.trashcan_file).unwrap(),
        b"original trashcan"
    );
    assert!(!journal_path(paths).exists());
    run(paths, targets, || {
        atomic_write(&paths.manifest_file, b"committed manifest")?;
        atomic_write(&paths.trashcan_file, b"committed trashcan")
    })
    .unwrap();
    recover(paths).unwrap();
    assert_eq!(
        std::fs::read(&paths.manifest_file).unwrap(),
        b"committed manifest"
    );
    assert_eq!(
        std::fs::read(&paths.trashcan_file).unwrap(),
        b"committed trashcan"
    );
}

#[test]
fn failure_after_deleting_content_restores_metadata_and_contents() {
    let fixture = Fixture::new();
    let paths = &fixture.0;
    entries::write_entry(&paths.entries_dir, "child", "127.0.0.1 example.test\n").unwrap();
    let result: Result<(), _> = run(
        paths,
        vec![Target::Trashcan, Target::Entry("child".into())],
        || {
            atomic_write(&paths.trashcan_file, b"empty")?;
            entries::delete_entry(&paths.entries_dir, "child")?;
            Err(injected_error())
        },
    );
    assert!(result.is_err());
    assert_eq!(
        std::fs::read(&paths.trashcan_file).unwrap(),
        b"original trashcan"
    );
    assert_eq!(
        entries::read_entry(&paths.entries_dir, "child").unwrap(),
        "127.0.0.1 example.test\n"
    );
}

#[test]
fn rollback_restores_absence_and_is_idempotent() {
    let fixture = Fixture::new();
    let paths = &fixture.0;
    std::fs::remove_file(&paths.trashcan_file).unwrap();
    let result: Result<(), _> = run(paths, vec![Target::Trashcan], || {
        atomic_write(&paths.trashcan_file, b"new")?;
        Err(injected_error())
    });
    assert!(result.is_err());
    assert!(!paths.trashcan_file.exists());
    recover(paths).unwrap();
    recover(paths).unwrap();
    assert!(!paths.trashcan_file.exists());
}

#[test]
fn failed_rollback_retains_journal_and_refuses_new_transactions() {
    let fixture = Fixture::new();
    let paths = &fixture.0;
    let blocked = paths.root.join("trashcan.json.tmp");
    let result: Result<(), _> = run(paths, vec![Target::Manifest, Target::Trashcan], || {
        atomic_write(&paths.manifest_file, b"changed")?;
        atomic_write(&paths.trashcan_file, b"changed trashcan")?;
        std::fs::create_dir(&blocked).unwrap();
        Err(injected_error())
    });
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("rollback incomplete"));
    assert!(journal_path(paths).exists());
    assert_eq!(
        std::fs::read(&paths.manifest_file).unwrap(),
        b"original manifest"
    );
    assert_eq!(
        std::fs::read(&paths.trashcan_file).unwrap(),
        b"changed trashcan"
    );
    assert!(run(
        paths,
        vec![Target::Trashcan],
        || -> Result<(), StorageError> { panic!("must not run while recovery is blocked") }
    )
    .is_err());
    std::fs::remove_dir(blocked).unwrap();
    recover(paths).unwrap();
    assert_eq!(
        std::fs::read(&paths.manifest_file).unwrap(),
        b"original manifest"
    );
    assert_eq!(
        std::fs::read(&paths.trashcan_file).unwrap(),
        b"original trashcan"
    );
    assert!(!journal_path(paths).exists());
}

#[test]
fn unavailable_journal_location_refuses_the_mutation() {
    let fixture = Fixture::new();
    let paths = &fixture.0;
    std::fs::create_dir(paths.internal.join("storage-transaction.json.tmp")).unwrap();
    assert!(run(
        paths,
        vec![Target::Manifest],
        || -> Result<(), StorageError> {
            panic!("must not mutate before recording the undo journal")
        }
    )
    .is_err());
    assert_eq!(
        std::fs::read(&paths.manifest_file).unwrap(),
        b"original manifest"
    );
    assert!(!journal_path(paths).exists());
}

#[test]
fn invalid_journal_is_retained_without_touching_storage() {
    let fixture = Fixture::new();
    let paths = &fixture.0;
    for bytes in [
        br#"{"unfinished": ["#.as_slice(),
        br#"{"version":2,"files":[{"target":"Manifest","contents":"Absent"}]}"#,
        br#"{"version":1,"files":[{"target":"Manifest"}]}"#,
        br#"{"version":1,"files":[{"target":"Manifest","contents":"Absent"},{"target":{"Entry":"../outside"},"contents":"Absent"}]}"#,
        br#"{"version":1,"files":[{"target":"Manifest","contents":"Absent"},{"target":"Manifest","contents":"Absent"}]}"#,
    ] {
        std::fs::write(journal_path(paths), bytes).unwrap();
        assert!(recover(paths).is_err());
        assert_eq!(std::fs::read(&paths.manifest_file).unwrap(), b"original manifest");
        assert_eq!(std::fs::read(journal_path(paths)).unwrap(), bytes);
    }
}

// Run in a child process so exit bypasses destructors and exception handlers.
#[test]
fn crash_child() {
    let Some(root) = std::env::var_os("SWH_TRANSACTION_CRASH_TEST_ROOT") else {
        return;
    };
    let paths = V5Paths::under(root.into());
    let step: u8 = std::env::var("SWH_TRANSACTION_CRASH_TEST_STEP")
        .unwrap()
        .parse()
        .unwrap();
    let _: Result<(), StorageError> = run(&paths, vec![Target::Manifest, Target::Trashcan], || {
        if step == 0 {
            std::process::exit(77);
        }
        atomic_write(&paths.manifest_file, b"interrupted manifest")?;
        if step == 1 {
            std::process::exit(77);
        }
        atomic_write(&paths.trashcan_file, b"interrupted trashcan")?;
        std::process::exit(77);
    });
    panic!("child should have exited during the transaction");
}

#[test]
fn process_interruption_before_commit_recovers_the_entire_snapshot() {
    for step in 0..=2 {
        let fixture = Fixture::new();
        let paths = &fixture.0;
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "storage::transaction::tests::crash_child"])
            .env("SWH_TRANSACTION_CRASH_TEST_ROOT", &paths.root)
            .env("SWH_TRANSACTION_CRASH_TEST_STEP", step.to_string())
            .output()
            .unwrap()
            .status;
        assert_eq!(status.code(), Some(77));
        assert!(journal_path(paths).exists());
        recover(paths).unwrap();
        recover(paths).unwrap();
        assert_eq!(
            std::fs::read(&paths.manifest_file).unwrap(),
            b"original manifest"
        );
        assert_eq!(
            std::fs::read(&paths.trashcan_file).unwrap(),
            b"original trashcan"
        );
        assert!(!journal_path(paths).exists());
    }
}
