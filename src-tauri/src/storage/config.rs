//! `internal/config.json` reader/writer.
//!
//! `AppConfig` mirrors `ConfigsType` in
//! `src/common/default_configs.ts`. The front-end adapter layer sees it
//! as a flat object so existing renderer code keeps working; the
//! `format` / `schemaVersion` envelope metadata is injected at the I/O
//! boundary and stripped on the way out.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::atomic::atomic_write;
use super::error::StorageError;

pub const CONFIG_FORMAT: &str = "switchhosts-config";
pub const CONFIG_SCHEMA_VERSION: u32 = 1;

/// User-facing config. Field names match ConfigsType in TypeScript, so a
/// round-trip through `serde_json::Value` preserves renderer contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    // UI
    pub left_panel_show: bool,
    pub left_panel_width: u32,
    pub right_panel_show: bool,
    pub right_panel_width: u32,
    pub use_system_window_frame: bool,

    // preferences
    pub write_mode: String, // "overwrite" | "append" | ""
    pub history_limit: u32,
    pub locale: Option<String>,
    pub theme: String, // "light" | "dark" | "system"
    pub choice_mode: u8,
    pub show_title_on_tray: bool,
    pub hide_at_launch: bool,
    pub send_usage_data: bool,
    pub cmd_after_hosts_apply: String,
    pub remove_duplicate_records: bool,
    pub hide_dock_icon: bool,
    pub multi_chose_folder_switch_all: bool,
    pub tray_mini_window: bool,

    // find window
    pub find_is_regexp: bool,
    pub find_is_ignore_case: bool,

    // proxy
    pub use_proxy: bool,
    pub proxy_protocol: String, // "http" | "https"
    pub proxy_host: String,
    pub proxy_port: u32,

    // http api
    pub http_api_on: bool,
    pub http_api_only_local: bool,

    // update
    pub auto_download_update: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            left_panel_show: true,
            left_panel_width: 270,
            right_panel_show: false,
            right_panel_width: 240,
            use_system_window_frame: false,

            write_mode: "append".to_string(),
            history_limit: 50,
            locale: None,
            theme: "system".to_string(),
            choice_mode: 2,
            show_title_on_tray: false,
            hide_at_launch: false,
            send_usage_data: false,
            cmd_after_hosts_apply: String::new(),
            remove_duplicate_records: false,
            hide_dock_icon: false,
            multi_chose_folder_switch_all: false,
            tray_mini_window: true,

            find_is_regexp: false,
            find_is_ignore_case: false,

            use_proxy: false,
            proxy_protocol: "http".to_string(),
            proxy_host: String::new(),
            proxy_port: 0,

            http_api_on: false,
            http_api_only_local: true,

            auto_download_update: true,
        }
    }
}

impl AppConfig {
    fn normalize(&mut self) {
        if !matches!(self.theme.as_str(), "light" | "dark" | "system") {
            self.theme = "system".to_string();
        }
    }

    /// Load `internal/config.json`.
    ///
    /// - Missing file → default config in memory, no write.
    /// - Unreadable / unparsable file → default config in memory, log a
    ///   warning, and defer any overwrite until the user triggers a real
    ///   write. The corrupted file is left on disk for inspection.
    pub fn load(path: &Path) -> Self {
        if !path.exists() {
            return Self::default();
        }
        match std::fs::read(path) {
            Ok(bytes) => match serde_json::from_slice::<AppConfig>(&bytes) {
                Ok(mut cfg) => {
                    cfg.normalize();
                    cfg
                }
                Err(e) => {
                    log::warn!(
                        "config.json at {} failed to parse: {e}. Falling back to defaults in memory; the file will not be overwritten until the next explicit write.",
                        path.display()
                    );
                    Self::default()
                }
            },
            Err(e) => {
                log::warn!(
                    "config.json at {} unreadable: {e}. Falling back to defaults in memory.",
                    path.display()
                );
                Self::default()
            }
        }
    }

    /// Save to disk with the format envelope, atomically.
    ///
    /// Writes a sibling `.tmp` file first, then renames it over the
    /// destination. Consistent with the "last successful rename wins"
    /// recovery strategy in the storage plan.
    pub fn save(&self, path: &Path) -> Result<(), StorageError> {
        let mut value = serde_json::to_value(self).map_err(|e| {
            StorageError::serialize(path.display().to_string(), e)
        })?;
        if let Some(obj) = value.as_object_mut() {
            obj.insert("format".into(), json!(CONFIG_FORMAT));
            obj.insert("schemaVersion".into(), json!(CONFIG_SCHEMA_VERSION));
        }

        let json = serde_json::to_vec_pretty(&value).map_err(|e| {
            StorageError::serialize(path.display().to_string(), e)
        })?;

        atomic_write(path, &json)
    }

    /// Return the flat `Value` view the front-end adapter expects from
    /// `config_all`. Strips the format envelope.
    pub fn to_flat_value(&self) -> Value {
        serde_json::to_value(self).expect("AppConfig serializes infallibly")
    }

    /// Look up a single key by its front-end name. Returns `None` when
    /// the key is not recognized.
    pub fn get_key(&self, key: &str) -> Option<Value> {
        let v = self.to_flat_value();
        v.as_object().and_then(|obj| obj.get(key).cloned())
    }

    /// Apply a partial update. Unknown keys return an error so stray
    /// call sites don't silently no-op during migration.
    pub fn apply_partial(&mut self, patch: &Value) -> Result<(), StorageError> {
        let patch_obj = patch.as_object().ok_or_else(|| StorageError::InvalidConfigValue {
            key: "<patch>".into(),
            reason: "expected a JSON object".into(),
        })?;

        let mut merged = self.to_flat_value();
        let merged_obj = merged
            .as_object_mut()
            .expect("AppConfig serializes to an object");

        for (k, v) in patch_obj {
            if !merged_obj.contains_key(k) {
                return Err(StorageError::UnknownConfigKey { key: k.clone() });
            }
            merged_obj.insert(k.clone(), v.clone());
        }

        let mut next: AppConfig = serde_json::from_value(merged).map_err(|e| {
            StorageError::InvalidConfigValue {
                key: "<patch>".into(),
                reason: e.to_string(),
            }
        })?;
        next.normalize();
        *self = next;
        Ok(())
    }

    /// Set a single key. Thin wrapper around `apply_partial` for the
    /// `config_set(key, value)` command shape.
    pub fn set_key(&mut self, key: &str, value: Value) -> Result<(), StorageError> {
        let patch = json!({ key: value });
        self.apply_partial(&patch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_normalizes_invalid_theme_to_system() {
        let path = std::env::temp_dir().join(format!(
            "switchhosts-config-test-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&path, r#"{ "theme": "sepia" }"#).unwrap();

        let cfg = AppConfig::load(&path);
        let _ = std::fs::remove_file(path);

        assert_eq!(cfg.theme, "system");
    }

    #[test]
    fn apply_partial_normalizes_invalid_theme_to_system() {
        let mut cfg = AppConfig::default();

        cfg.apply_partial(&json!({ "theme": "sepia" })).unwrap();

        assert_eq!(cfg.theme, "system");
    }
}
