//! Apply-time error type.
//!
//! Distinct from [`crate::storage::error::StorageError`] because the
//! renderer expects a stable `{ success, code, message }` shape from
//! `setSystemHosts`, not the storage layer's tagged JSON. We translate
//! at the command boundary in `commands.rs`.

use serde_json::{json, Value};

#[derive(Debug, thiserror::Error)]
pub enum HostsApplyError {
    /// Cannot write the system hosts file via the elevation helper
    /// because the system policy refused the action — Linux pkexec
    /// returns exit 127 here. Renderer maps this to its existing
    /// `no_access` branch.
    ///
    /// `#[allow(dead_code)]` because the macOS path doesn't
    /// construct it (osascript only reports success / cancelled /
    /// io), and we can't conditionally enable variants per target
    /// without #[cfg] noise on every match arm.
    #[allow(dead_code)]
    #[error("no access: {message}")]
    NoAccess { message: String },

    /// User dismissed the OS authentication prompt.
    #[error("cancelled")]
    Cancelled,

    /// Filesystem / process error from a step that should normally
    /// succeed: temp file write, copy, chmod, exit code from
    /// osascript/pkexec/UAC helper.
    #[error("io: {message}")]
    Io { message: String },
}

impl HostsApplyError {
    /// Translate into the renderer's `IWriteResult` JSON shape so the
    /// existing `actions.setSystemHosts` call sites keep working
    /// without any front-end changes:
    ///
    /// ```ts
    /// { success: false, code?: string, message?: string }
    /// ```
    pub fn into_renderer_value(self) -> Value {
        let (code, message) = match self {
            HostsApplyError::NoAccess { message } => ("no_access", message),
            HostsApplyError::Cancelled => ("cancelled", "user cancelled".to_string()),
            HostsApplyError::Io { message } => ("fail", message),
        };
        json!({
            "success": false,
            "code": code,
            "message": message,
        })
    }
}
