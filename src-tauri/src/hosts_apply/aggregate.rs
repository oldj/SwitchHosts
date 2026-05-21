//! Selected-content aggregation.
//!
//! Delegates in-memory aggregation to `switchhosts-core` and reads
//! entry files from the v5 `entries/` directory.

use serde_json::Value;

use switchhosts_core::aggregate_selected_content as aggregate_in_memory;

use crate::storage::{entries, error::StorageError, paths::V5Paths};

/// Aggregate the content of every selected node in `list`, returning
/// the final string the renderer wants to write to `/etc/hosts`.
pub fn aggregate_selected_content(
    list: &[Value],
    paths: &V5Paths,
    remove_duplicate_records: bool,
) -> Result<String, StorageError> {
    let entries_dir = paths.entries_dir.clone();
    let content = aggregate_in_memory(
        list,
        |id| entries::read_entry(&entries_dir, id).unwrap_or_default(),
        remove_duplicate_records,
        line_ending(),
    );
    Ok(content)
}

#[cfg(target_os = "windows")]
fn line_ending() -> &'static str {
    "\r\n"
}

#[cfg(not(target_os = "windows"))]
fn line_ending() -> &'static str {
    "\n"
}
