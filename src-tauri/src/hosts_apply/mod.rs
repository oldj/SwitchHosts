//! Hosts apply pipeline.
//!
//! Submodules:
//!
//! - `aggregate` — resolve enabled entries and group references, concatenate
//!   their source files, optionally dedup repeated host records.
//! - `content_sync` — reconcile saved content with system hosts without a webview.
//! - `error` — `HostsApplyError` enum + renderer-facing translation.
//! - `elevation` — OS-native privileged write helpers (osascript on
//!   macOS today; pkexec / UAC land in P2.E.4).
//! - `write` — orchestrates normalization, append-mode splice,
//!   no-op short-circuit, and the direct → elevated write fallback.
//! - `history` — `internal/histories/system-hosts.json` journal:
//!   load / save / record changes / retention / delete by id.

pub mod aggregate;
pub mod cmd_runner;
pub mod content_sync;
pub mod elevation;
pub mod error;
pub mod helper_admin;
pub mod helper_client;
pub mod history;
pub mod recovery;
pub mod write;

pub use aggregate::aggregate_selected_content;
pub use error::HostsApplyError;
pub use write::apply_to_system_hosts;
