//! Storage layer error type. Exposed to front-end commands as a serialized
//! JSON object so UI can branch on `kind`.

use serde::Serialize;

#[allow(dead_code)] // `Parse` lands in Phase 1B step 2 alongside manifest.json
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StorageError {
    #[error("home directory not found")]
    HomeDirNotFound,

    #[error("io error at {path}: {reason}")]
    Io { path: String, reason: String },

    #[error("failed to parse {path}: {reason}")]
    Parse { path: String, reason: String },

    #[error("failed to serialize {path}: {reason}")]
    Serialize { path: String, reason: String },

    #[error("config key not found: {key}")]
    UnknownConfigKey { key: String },

    #[error("config value for {key} failed validation: {reason}")]
    InvalidConfigValue { key: String, reason: String },

    #[error("failed to apply {key} to the OS: {reason}")]
    SideEffect { key: String, reason: String },
}

#[allow(dead_code)] // `parse` helper lands in Phase 1B step 2
impl StorageError {
    pub fn io(path: impl Into<String>, err: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            reason: err.to_string(),
        }
    }

    pub fn parse(path: impl Into<String>, err: serde_json::Error) -> Self {
        Self::Parse {
            path: path.into(),
            reason: err.to_string(),
        }
    }

    pub fn serialize(path: impl Into<String>, err: serde_json::Error) -> Self {
        Self::Serialize {
            path: path.into(),
            reason: err.to_string(),
        }
    }
}
