//! Manual JSON backup export. Interactive v3/v4/v5 import lives in `preview`.
//! Import prepares an in-memory draft; only explicit commit can change data.

use crate::storage::{
    atomic::atomic_write,
    entries,
    manifest::{self, Manifest},
    trashcan::Trashcan,
    StorageError, V5Paths,
};
use serde_json::{json, Value};
use std::path::Path;

pub mod preview;

/// Serialize the current v5 state into a backup JSON and write it to
/// `dest`. Returns `Ok(())` on success. Hard I/O errors bubble up.
pub fn export_to_file(dest: &Path, paths: &V5Paths) -> Result<(), StorageError> {
    let manifest = Manifest::load(paths)?;
    let trashcan = Trashcan::load(&paths.trashcan_file)?;

    // Walk the tree and collect every local/remote node id that owns a
    // content file. We read each file and embed it inline in the backup
    // JSON under `entries`, keyed by node id.
    let mut ids = Vec::new();
    manifest::collect_content_ids(&manifest.root, &mut ids);

    let mut entries_map = serde_json::Map::with_capacity(ids.len());
    for id in ids {
        if id == "0" {
            continue;
        }
        let content = entries::read_entry(&paths.entries_dir, &id)?;
        entries_map.insert(id, Value::String(content));
    }

    let backup = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 1,
        // Legacy Electron import reads `version[0]` — flagging this as
        // v5 lets old clients fail with "new_version" rather than a
        // "parse_error" / "invalid_data" mystery.
        "version": [5, 0, 0, 0],
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "manifest": {
            "format": "switchhosts-data",
            "schemaVersion": 1,
            "root": manifest.root,
        },
        "entries": Value::Object(entries_map),
        "trashcan": {
            "format": "switchhosts-trashcan",
            "schemaVersion": 1,
            "items": trashcan.items,
        },
    });

    let bytes = serde_json::to_vec_pretty(&backup)
        .map_err(|e| StorageError::serialize(dest.display().to_string(), e))?;
    atomic_write(dest, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp_paths(name: &str) -> V5Paths {
        let root = std::env::temp_dir().join(format!(
            "switchhosts-import-test-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let paths = V5Paths::under(root);
        paths.ensure_dirs().unwrap();
        paths
    }

    fn cleanup(paths: &V5Paths) {
        std::fs::remove_dir_all(&paths.root).ok();
    }

    #[tokio::test]
    async fn dns_failure_metadata_keeps_private_endpoints_out_of_manifest_and_backup() {
        let paths = temp_paths("dns-error-privacy");
        let private_template = "https://resolver.invalid/TEST_PROFILE?token=TEST_QUERY";
        let invalid_template = crate::dns::provider_by_id("custom", private_template).unwrap_err();
        // An unsupported scheme fails before any network request is sent.
        let mut provider = crate::dns::provider_by_id(
            "custom",
            "https://resolver.invalid/TEST_PROFILE?token=TEST_QUERY&name={domain}",
        )
        .unwrap();
        provider.template =
            "private-doh://resolver.invalid/TEST_PROFILE?token=TEST_QUERY&name={domain}".into();
        let network_error =
            crate::dns::resolve_domain(&reqwest::Client::new(), &provider, "network.test")
                .await
                .unwrap_err();
        let parse_error =
            crate::dns::parse_doh_a_records(r#"{"Status":"TEST_RESPONSE_SECRET"}"#).unwrap_err();
        let domains = vec![
            "template.test".into(),
            "network.test".into(),
            "response.test".into(),
        ];
        let results = crate::dns::merge_domain_results(
            &domains,
            vec![Err(invalid_template), Err(network_error), Err(parse_error)],
            &std::collections::HashMap::new(),
            "2026-10-03 00:00:00",
            100,
        );
        assert!(results
            .iter()
            .all(|result| result.error.as_ref().is_some_and(|error| !error.is_empty())));
        let content = crate::dns::build_batch_hosts_content(&results, "Custom DoH");
        Manifest {
            root: vec![json!({
                "id": "dns-private", "type": "remote", "source": "domain",
                "domains": domains, "domain_results": results,
                "domain_refresh_status": "failed"
            })],
            ..Default::default()
        }
        .save(&paths)
        .unwrap();
        entries::write_entry(&paths.entries_dir, "dns-private", &content).unwrap();
        let backup_path = paths.root.join("backup.json");
        export_to_file(&backup_path, &paths).unwrap();
        for file in [&paths.manifest_file, &backup_path] {
            let persisted = std::fs::read_to_string(file).unwrap();
            for private_value in [
                "resolver.invalid",
                "TEST_PROFILE",
                "TEST_QUERY",
                "TEST_RESPONSE_SECRET",
                "private-doh://",
            ] {
                assert!(
                    !persisted.contains(private_value),
                    "private endpoint data reached persisted DNS results"
                );
            }
        }
        cleanup(&paths);
    }
}
