//! Hosts apply pipeline.
//!
//! Submodules:
//!
//! - `aggregate` — walk the manifest tree, collect every node whose
//!   `on === true`, concatenate `entries/<id>.hosts` files, optionally
//!   dedup repeated host records.
//! - `error` — `HostsApplyError` enum + renderer-facing translation.
//! - `elevation` — OS-native privileged write helpers (osascript on
//!   macOS today; pkexec / UAC land in P2.E.4).
//! - `write` — orchestrates normalization, append-mode splice,
//!   no-op short-circuit, and the direct → elevated write fallback.
//! - `history` — `internal/histories/system-hosts.json` journal:
//!   load / save / insert (trimmed by `history_limit`) / delete by id.

pub mod aggregate;
pub mod cmd_runner;
pub mod elevation;
pub mod error;
pub mod history;
pub mod write;

pub use aggregate::aggregate_selected_content;
pub use error::HostsApplyError;
pub use history::ApplyHistoryItem;
pub use write::apply_to_system_hosts;
