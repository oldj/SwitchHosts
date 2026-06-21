//! Filesystem helpers for the custom-data-directory feature.
//!
//! - [`copy_dir_recursive`] copies the whole data tree into a new
//!   location, overwriting same-named files (merge semantics) and never
//!   deleting anything in the source. Used when the user opts to copy
//!   existing data while changing the storage location.
//! - [`lexical_canonicalize`] normalises a path that may not exist yet
//!   (the target `SwitchHosts.data` is usually created only on apply), so
//!   "is this the same as / inside the current directory?" checks are
//!   reliable on case-insensitive filesystems.
//! - [`dir_is_empty_ignoring_meta`] decides whether the target needs an
//!   overwrite warning, ignoring OS metadata files like `.DS_Store`.

use std::path::{Path, PathBuf};

use super::error::StorageError;

/// Entry names that don't count as "real" content when deciding if a
/// directory is empty (OS-generated metadata / our own temp files).
const META_FILE_NAMES: &[&str] = &[".DS_Store", "Thumbs.db", "desktop.ini"];

fn is_tmp(name: &str) -> bool {
    name.ends_with(".tmp")
}

fn is_meta(name: &str) -> bool {
    META_FILE_NAMES.contains(&name) || is_tmp(name)
}

/// Copy every file/dir under `src` into `dst`, creating `dst` first.
/// Overwrites same-named files (merge), skips `.tmp` leftovers and
/// symlinks, and never touches the source. Rejects self-containing
/// copies (`dst == src`, or either nested in the other) which would
/// otherwise recurse forever.
pub fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), StorageError> {
    std::fs::create_dir_all(dst).map_err(|e| StorageError::io(dst.display().to_string(), e))?;

    // Canonicalize after creating dst so both paths exist; this resolves
    // symlinks and case differences before the containment checks.
    let src_c =
        std::fs::canonicalize(src).map_err(|e| StorageError::io(src.display().to_string(), e))?;
    let dst_c =
        std::fs::canonicalize(dst).map_err(|e| StorageError::io(dst.display().to_string(), e))?;
    if src_c == dst_c {
        return Err(StorageError::InvalidDataDirChoice {
            reason: "source and target data directories are the same".into(),
        });
    }
    if dst_c.starts_with(&src_c) || src_c.starts_with(&dst_c) {
        return Err(StorageError::InvalidDataDirChoice {
            reason: "the target directory is inside the source directory (or vice versa)".into(),
        });
    }

    copy_tree(src, dst)?;

    // Lightweight verification: if the source had a manifest, the target
    // must end up with one too — otherwise the copy is unusable and we
    // must not flip the pointer to it.
    if src.join("manifest.json").exists() && !dst.join("manifest.json").exists() {
        return Err(StorageError::InvalidDataDirChoice {
            reason: "copy verification failed: manifest.json was not copied to the target".into(),
        });
    }

    Ok(())
}

fn copy_tree(src: &Path, dst: &Path) -> Result<(), StorageError> {
    let read_dir =
        std::fs::read_dir(src).map_err(|e| StorageError::io(src.display().to_string(), e))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| StorageError::io(src.display().to_string(), e))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if is_tmp(&name_str) {
            continue;
        }

        let file_type = entry
            .file_type()
            .map_err(|e| StorageError::io(entry.path().display().to_string(), e))?;
        if file_type.is_symlink() {
            log::info!(
                "skipping symlink during data copy: {}",
                entry.path().display()
            );
            continue;
        }

        let from = entry.path();
        let to = dst.join(&name);
        if file_type.is_dir() {
            std::fs::create_dir_all(&to)
                .map_err(|e| StorageError::io(to.display().to_string(), e))?;
            copy_tree(&from, &to)?;
        } else {
            std::fs::copy(&from, &to).map_err(|e| {
                StorageError::io(format!("{} -> {}", from.display(), to.display()), e)
            })?;
        }
    }
    Ok(())
}

/// Canonicalize `p`, tolerating non-existent leaf segments: walk up to the
/// nearest existing ancestor, canonicalize that, then re-append the
/// missing tail. Falls back to the path as-given if nothing canonicalizes.
/// Used to compare a not-yet-created target against the current root.
pub fn lexical_canonicalize(p: &Path) -> PathBuf {
    if let Ok(c) = std::fs::canonicalize(p) {
        return c;
    }
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    let mut current = p;
    loop {
        if let Ok(base) = std::fs::canonicalize(current) {
            let mut result = base;
            for seg in tail.iter().rev() {
                result.push(seg);
            }
            return result;
        }
        match current.file_name() {
            Some(name) => {
                tail.push(name.to_os_string());
                match current.parent() {
                    Some(parent) => current = parent,
                    None => return p.to_path_buf(),
                }
            }
            None => return p.to_path_buf(),
        }
    }
}

/// Whether `p` is effectively empty: missing/unreadable counts as empty,
/// and OS metadata / `.tmp` files are ignored. Drives the overwrite
/// warning when choosing a non-empty target.
pub fn dir_is_empty_ignoring_meta(p: &Path) -> bool {
    let Ok(read_dir) = std::fs::read_dir(p) else {
        return true;
    };
    for entry in read_dir.flatten() {
        let name = entry.file_name();
        if !is_meta(&name.to_string_lossy()) {
            return false;
        }
    }
    true
}

/// Probe whether `dir` is writable by creating and removing a temp file.
/// Returns false if `dir` doesn't exist or the write fails (e.g. a
/// read-only volume or permissions). More reliable than `create_dir_all`,
/// which is a no-op (and so returns Ok) on an existing read-only dir.
/// The probe name ends in `.tmp`, so a leftover (crash between write and
/// remove) is cleaned up by `V5Paths::cleanup_tmp_files` and skipped by
/// `copy_dir_recursive`.
pub fn is_writable_dir(dir: &Path) -> bool {
    let probe = dir.join(".swh-write-probe.tmp");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "swh-fscopy-test-{}-{}-{name}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn copies_nested_tree_and_skips_tmp() {
        let base = temp_dir("nested");
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("entries")).unwrap();
        std::fs::write(src.join("manifest.json"), b"{}").unwrap();
        std::fs::write(src.join("entries/a.hosts"), b"127.0.0.1 a").unwrap();
        std::fs::write(src.join("manifest.json.tmp"), b"garbage").unwrap();

        copy_dir_recursive(&src, &dst).unwrap();

        assert_eq!(std::fs::read(dst.join("manifest.json")).unwrap(), b"{}");
        assert_eq!(
            std::fs::read(dst.join("entries/a.hosts")).unwrap(),
            b"127.0.0.1 a"
        );
        assert!(
            !dst.join("manifest.json.tmp").exists(),
            ".tmp must be skipped"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn copies_source_without_manifest() {
        // A fresh store may have no manifest.json yet (FreshInstall before
        // any write); copying it must not trip the manifest verification.
        let base = temp_dir("no-manifest");
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("internal")).unwrap();
        std::fs::write(src.join("internal/config.json"), b"{}").unwrap();
        copy_dir_recursive(&src, &dst).unwrap();
        assert!(dst.join("internal/config.json").exists());
        assert!(!dst.join("manifest.json").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn overwrites_same_named_files() {
        let base = temp_dir("overwrite");
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&dst).unwrap();
        std::fs::write(src.join("manifest.json"), b"new").unwrap();
        std::fs::write(dst.join("manifest.json"), b"old").unwrap();
        std::fs::write(dst.join("keep.txt"), b"keep").unwrap();

        copy_dir_recursive(&src, &dst).unwrap();

        assert_eq!(std::fs::read(dst.join("manifest.json")).unwrap(), b"new");
        assert!(
            dst.join("keep.txt").exists(),
            "unrelated files are preserved"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_same_src_and_dst() {
        let base = temp_dir("same");
        let err = copy_dir_recursive(&base, &base).unwrap_err();
        assert!(matches!(err, StorageError::InvalidDataDirChoice { .. }));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_dst_inside_src() {
        let base = temp_dir("inside");
        let src = base.join("src");
        std::fs::create_dir_all(&src).unwrap();
        let dst = src.join("SwitchHosts.data");
        let err = copy_dir_recursive(&src, &dst).unwrap_err();
        assert!(matches!(err, StorageError::InvalidDataDirChoice { .. }));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinks() {
        use std::os::unix::fs::symlink;
        let base = temp_dir("symlink");
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("manifest.json"), b"{}").unwrap();
        // A dangling symlink would abort a naive copy; ours skips it.
        symlink("/nonexistent/target", src.join("link")).unwrap();

        copy_dir_recursive(&src, &dst).unwrap();

        assert!(dst.join("manifest.json").exists());
        assert!(!dst.join("link").exists(), "symlink must be skipped");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn empty_ignoring_meta() {
        let base = temp_dir("empty");
        assert!(dir_is_empty_ignoring_meta(&base));
        std::fs::write(base.join(".DS_Store"), b"x").unwrap();
        std::fs::write(base.join("sh.tmp"), b"x").unwrap();
        assert!(dir_is_empty_ignoring_meta(&base), "meta-only dir is empty");
        std::fs::write(base.join("real.txt"), b"x").unwrap();
        assert!(!dir_is_empty_ignoring_meta(&base));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn empty_for_missing_dir() {
        let missing = std::env::temp_dir().join("swh-definitely-missing-xyz-123");
        assert!(dir_is_empty_ignoring_meta(&missing));
    }

    #[test]
    fn writable_dir_probe() {
        let dir = temp_dir("writable");
        assert!(is_writable_dir(&dir));
        // The probe must clean up after itself.
        assert!(dir_is_empty_ignoring_meta(&dir));
        // A non-existent dir is not writable.
        assert!(!is_writable_dir(&dir.join("does-not-exist")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn lexical_canonicalize_handles_missing_leaf() {
        let base = temp_dir("lexcanon");
        let missing_leaf = base.join("SwitchHosts.data");
        // The leaf doesn't exist yet, but the result should be the
        // canonical base + the leaf name, and equal to itself.
        let resolved = lexical_canonicalize(&missing_leaf);
        assert!(resolved.ends_with("SwitchHosts.data"));
        assert_eq!(resolved, lexical_canonicalize(&missing_leaf));
        // Distinct from the parent.
        assert_ne!(resolved, lexical_canonicalize(&base));
        let _ = std::fs::remove_dir_all(&base);
    }
}
