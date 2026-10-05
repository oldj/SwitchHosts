use super::*;

struct Fixture {
    root: PathBuf,
    target: PathBuf,
    backups: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("swh-encoding-{}-{stamp}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        Self {
            target: root.join("hosts"),
            backups: root.join("backups"),
            root,
        }
    }

    fn apply(&self, text: &str, mode: &str) -> ApplyOutcome {
        apply_at(&self.target, text, mode, &self.backups).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn utf16(text: &str) -> Vec<u8> {
    let mut bytes = vec![0xff, 0xfe];
    bytes.extend(text.encode_utf16().flat_map(u16::to_le_bytes));
    bytes
}

#[test]
fn bom_sources_work_in_both_modes_and_reapply_is_unchanged() {
    let f = Fixture::new();
    let original = "\u{feff}127.0.0.1 localhost\r\n";
    let content = "\u{feff}192.0.2.1 a.test\r\n\r\n\u{feff}192.0.2.2 b.test\r\n";
    for mode in ["overwrite", "append"] {
        std::fs::write(&f.target, original).unwrap();
        let applied = f.apply(content, mode);
        let disk = std::fs::read_to_string(&f.target).unwrap();
        assert!(!disk.contains('\u{feff}'));
        assert!(disk.contains("192.0.2.1 a.test"));
        assert!(disk.contains("192.0.2.2 b.test"));
        assert_eq!(disk.contains("localhost"), mode == "append");
        assert!(f.apply(content, mode).unchanged);
        restore_at(
            &f.target,
            &applied.previous_content,
            &applied.new_content,
            Some(&applied.previous_bytes),
        )
        .unwrap();
        assert_eq!(std::fs::read(&f.target).unwrap(), original.as_bytes());
    }
}

fn conversion_round_trip(original: &[u8], text: &str) {
    let f = Fixture::new();
    for mode in ["overwrite", "append"] {
        std::fs::write(&f.target, original).unwrap();
        assert_eq!(read_system_hosts(&f.target).unwrap(), text);
        let applied = f.apply(text, mode);
        // Equal decoded text is still a real write when disk encoding differs.
        assert!(!applied.unchanged);
        let disk = std::fs::read(&f.target).unwrap();
        assert!(std::str::from_utf8(&disk).unwrap().contains("# 中文"));
        assert!(!disk.starts_with(b"\xef\xbb\xbf"));
        assert!(std::fs::read_dir(&f.backups)
            .unwrap()
            .all(|entry| { std::fs::read(entry.unwrap().path()).unwrap() == original }));
        assert!(std::fs::read_dir(&f.backups).unwrap().count() > 0);
        assert!(f.apply(text, mode).unchanged);
        restore_at(
            &f.target,
            &applied.previous_content,
            &applied.new_content,
            Some(&applied.previous_bytes),
        )
        .unwrap();
        assert_eq!(std::fs::read(&f.target).unwrap(), original);
    }
}

#[test]
fn utf16_conversion_is_backed_up_and_compensation_restores_original_bytes() {
    let text = "# 中文\r\n127.0.0.1 localhost\n";
    conversion_round_trip(&utf16(text), text);
}

#[cfg(target_os = "windows")]
#[test]
fn gbk_conversion_on_chinese_windows_preserves_comments_and_original_bytes() {
    // The VM regression runs with ACP 936. Other locales have their decoder
    // covered with explicit code pages in hosts_text's Windows tests.
    if unsafe { windows_sys::Win32::Globalization::GetACP() } != 936 {
        return;
    }
    conversion_round_trip(
        b"# \xd6\xd0\xce\xc4\r\n127.0.0.1 localhost\n",
        "# 中文\r\n127.0.0.1 localhost\n",
    );
}

#[test]
fn backup_failure_and_invalid_unicode_leave_system_file_untouched() {
    let f = Fixture::new();
    let original = utf16("# 中文\n127.0.0.1 localhost\n");
    std::fs::write(&f.target, &original).unwrap();
    std::fs::write(&f.backups, b"not a directory").unwrap();
    assert!(apply_at(&f.target, "192.0.2.1 a.test\n", "overwrite", &f.backups).is_err());
    assert_eq!(std::fs::read(&f.target).unwrap(), original);

    for bytes in [b"\xef\xbb\xbf\xff".as_slice(), b"\xff\xfe\x00\xd8", b"a\0b"] {
        std::fs::write(&f.target, bytes).unwrap();
        assert!(apply_at(&f.target, "", "overwrite", &f.backups).is_err());
        assert_eq!(std::fs::read(&f.target).unwrap(), bytes);
    }
}

#[test]
fn compensation_rejects_mismatched_bytes_and_external_changes() {
    let f = Fixture::new();
    std::fs::write(&f.target, b"127.0.0.1 localhost\n").unwrap();
    let applied = f.apply("192.0.2.1 a.test\n", "overwrite");
    let current = std::fs::read(&f.target).unwrap();
    assert!(restore_at(
        &f.target,
        &applied.previous_content,
        &applied.new_content,
        Some(b"different snapshot")
    )
    .is_err());
    assert_eq!(std::fs::read(&f.target).unwrap(), current);
    std::fs::write(&f.target, b"external edit\n").unwrap();
    assert!(matches!(
        restore_at(
            &f.target,
            &applied.previous_content,
            &applied.new_content,
            Some(&applied.previous_bytes)
        ),
        Err(HostsApplyError::ContentChanged)
    ));
    assert_eq!(std::fs::read(&f.target).unwrap(), b"external edit\n");
}
