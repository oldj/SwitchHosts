//! Atomic file write helper.
//!
//! Every write goes through `atomic_write`: write to a sibling `.tmp`
//! file, then rename it onto the destination. A rename on the same
//! filesystem is atomic at the OS level on macOS / Linux / Windows, so
//! a crash mid-write either leaves the previous file intact or lands
//! the new one — never a half-written file.

use std::path::{Path, PathBuf};

use super::error::StorageError;

/// Write `contents` to `dest` atomically. The parent directory is
/// created if it doesn't already exist.
pub fn atomic_write(dest: &Path, contents: &[u8]) -> Result<(), StorageError> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| StorageError::io(parent.display().to_string(), e))?;
    }

    let tmp = tmp_sibling(dest);
    std::fs::write(&tmp, contents).map_err(|e| StorageError::io(tmp.display().to_string(), e))?;
    std::fs::rename(&tmp, dest).map_err(|e| StorageError::io(dest.display().to_string(), e))?;
    Ok(())
}

fn tmp_sibling(path: &Path) -> PathBuf {
    let mut file_name = path
        .file_name()
        .map(|f| f.to_os_string())
        .unwrap_or_default();
    file_name.push(".tmp");
    path.with_file_name(file_name)
}
