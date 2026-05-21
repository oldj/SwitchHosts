//! Platform-agnostic SwitchHosts business logic.
//!
//! Pure computation (hosts normalization, list aggregation, manifest
//! tree translation) lives here so the same code runs in the Tauri
//! desktop app and in the VS Code extension via WASM.

pub mod aggregate;
pub mod normalize;
pub mod tree_format;

pub use aggregate::{aggregate_selected_content, aggregate_selected_content_from_map};
pub use normalize::remove_duplicate_records;
pub use tree_format::{legacy_root_to_v5, v5_root_to_legacy};
