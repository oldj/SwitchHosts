//! Offline unit tests for the cloud sync engine internals. HTTP behaviour
//! is covered by the pure parser tests; real platform round trips need
//! live credentials and are verified manually (see docs/cloud-sync.md).

use super::account::{self, Account, AuthMethod, Platform};
use super::payload::{self, ApplySummary};
use super::engine::{decide_poll, PollAction};
use super::provider::{
    self, map_device_code_error, parse_content_file, parse_device_poll, parse_user_login,
    DevicePollOutcome, SyncError,
};

use crate::storage::{entries, manifest::Manifest, paths::V5Paths, Trashcan};
use base64::Engine as _;
use serde_json::{json, Value};

fn temp_paths(name: &str) -> V5Paths {
    let root = std::env::temp_dir().join(format!(
        "switchhosts-cloud-sync-{}-{}-{}",
        name,
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

fn sample_account() -> Account {
    Account {
        platform: Platform::Github,
        auth_method: AuthMethod::Pat,
        login: "alice".into(),
        repo: "switchhosts-backup".into(),
        token: "secret-token".into(),
        device_client_id: String::new(),
        last_push_at: None,
        last_pull_at: None,
        last_hash: None,
    }
}

fn write_sample_data(paths: &V5Paths) {
    Manifest {
        root: vec![
            json!({
                "id": "h1", "type": "local", "title": "one", "on": false,
                "contentFile": "entries/h1.hosts",
            }),
            json!({
                "id": "f1", "type": "folder", "title": "grp", "on": false,
                "children": [
                    {"id": "h2", "type": "remote", "title": "two", "on": false,
                     "contentFile": "entries/h2.hosts"}
                ],
            }),
        ],
        ..Default::default()
    }
    .save(paths)
    .unwrap();
    entries::write_entry(&paths.entries_dir, "h1", "127.0.0.1 alpha\n").unwrap();
    entries::write_entry(&paths.entries_dir, "h2", "127.0.0.1 beta\n").unwrap();
    Trashcan {
        items: vec![json!({
            "data": {"id": "h3", "type": "local", "title": "gone", "on": false},
            "add_time_ms": 1,
            "parent_id": null,
        })],
        ..Default::default()
    }
    .save(&paths.trashcan_file)
    .unwrap();
    entries::write_entry(&paths.entries_dir, "h3", "10.0.0.1 gone\n").unwrap();
}

// ---- account ---------------------------------------------------------------

#[test]
fn account_load_returns_none_when_missing() {
    let paths = temp_paths("no-account");
    assert!(account::load(&paths.internal).unwrap().is_none());
    cleanup(&paths);
}

#[test]
fn account_save_and_load_roundtrip() {
    let paths = temp_paths("account-roundtrip");
    let account = sample_account();
    account::save(&paths.internal, &account).unwrap();
    let loaded = account::load(&paths.internal).unwrap().unwrap();
    assert_eq!(loaded.platform, Platform::Github);
    assert_eq!(loaded.login, "alice");
    assert_eq!(loaded.repo, "switchhosts-backup");
    assert_eq!(loaded.token, "secret-token");
    cleanup(&paths);
}

#[test]
fn account_public_view_hides_token() {
    let view = sample_account().public_view();
    let raw = view.to_string();
    assert!(!raw.contains("secret-token"));
    assert_eq!(view["platform"], "github");
    assert_eq!(view["login"], "alice");
}

#[test]
#[cfg(unix)]
fn account_file_is_owner_read_write_only() {
    use std::os::unix::fs::PermissionsExt;
    let paths = temp_paths("account-perms");
    account::save(&paths.internal, &sample_account()).unwrap();
    let mode = std::fs::metadata(account::account_file_path(&paths.internal))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600);
    cleanup(&paths);
}

#[test]
fn account_logout_removes_file() {
    let paths = temp_paths("logout");
    account::save(&paths.internal, &sample_account()).unwrap();
    account::logout(&paths.internal).unwrap();
    assert!(account::load(&paths.internal).unwrap().is_none());
    // Logout with no account file is a no-op, not an error.
    account::logout(&paths.internal).unwrap();
    cleanup(&paths);
}

#[test]
fn repo_name_validation() {
    assert!(account::is_valid_repo_name("switchhosts-backup"));
    assert!(account::is_valid_repo_name("a.b_c-d"));
    assert!(!account::is_valid_repo_name(""));
    assert!(!account::is_valid_repo_name("has space"));
    assert!(!account::is_valid_repo_name("bad/name"));
}

// ---- payload ---------------------------------------------------------------

#[test]
fn build_backup_value_includes_tree_entries_and_trashcan() {
    let paths = temp_paths("build");
    write_sample_data(&paths);
    let value = payload::build_backup_value(&paths).unwrap();

    assert_eq!(value["format"], "switchhosts-backup");
    let entries = value["entries"].as_object().unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries["h1"], "127.0.0.1 alpha\n");
    let trash_entries = value["trashcanEntries"].as_object().unwrap();
    assert_eq!(trash_entries["h3"], "10.0.0.1 gone\n");
    let items = value["trashcan"]["items"].as_array().unwrap();
    assert_eq!(items.len(), 1);
    cleanup(&paths);
}

#[test]
fn stable_hash_is_deterministic_across_key_orders() {
    let mut a = serde_json::Map::new();
    a.insert("x".into(), json!(1));
    a.insert("y".into(), json!(2));
    let mut b = serde_json::Map::new();
    b.insert("y".into(), json!(2));
    b.insert("x".into(), json!(1));
    // serde_json's default map is ordered (BTreeMap), so both hash equal.
    let ha = payload::stable_hash(&Value::Object(a)).unwrap();
    let hb = payload::stable_hash(&Value::Object(b)).unwrap();
    assert_eq!(ha, hb);
    // Different content hashes differently.
    let mut c = serde_json::Map::new();
    c.insert("x".into(), json!(3));
    let hc = payload::stable_hash(&Value::Object(c)).unwrap();
    assert_ne!(ha, hc);
}

#[test]
fn stable_hash_ignores_volatile_exported_at() {
    // Build the same payload twice with different `exportedAt` stamps; the stable
    // hash must be equal so a freshly rebuilt local payload is not mistaken for a
    // change against the remote copy (the infinite pull-overwrite bug).
    let base = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 1,
        "exportedAt": "2026-01-01T00:00:00Z",
        "entries": {"h1": "127.0.0.1 alpha"},
    });
    let mut newer = base.clone();
    newer["exportedAt"] = json!("2026-11-11T08:00:00Z");
    let ha = payload::stable_hash(&base).unwrap();
    let hb = payload::stable_hash(&newer).unwrap();
    assert_eq!(ha, hb);
    // Changing actual host content does change the hash.
    let mut changed = base.clone();
    changed["entries"]["h1"] = json!("127.0.0.1 beta");
    let hc = payload::stable_hash(&changed).unwrap();
    assert_ne!(ha, hc);
}

#[test]
fn parse_backup_rejects_wrong_format_and_schema() {
    assert!(payload::parse_backup(br#"{"format":"other"}"#).is_err());
    let bad_schema = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 99,
        "manifest": {"root": []},
        "entries": {},
    });
    assert!(payload::parse_backup(bad_schema.to_string().as_bytes()).is_err());
}

#[test]
fn parse_backup_rejects_non_string_entry_content() {
    let bad = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 1,
        "manifest": {"schemaVersion": 1, "root": [
            {"id": "h1", "type": "local", "title": "a"}
        ]},
        "entries": {"h1": 42},
        "trashcan": {"items": []},
    });
    let err = payload::parse_backup(bad.to_string().as_bytes()).unwrap_err();
    assert!(err.to_string().contains("invalid_data"));
}

#[test]
fn parse_backup_normalizes_crlf_content() {
    let value = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 1,
        "manifest": {"schemaVersion": 1, "root": [
            {"id": "h1", "type": "local", "title": "a"}
        ]},
        "entries": {"h1": "1.2.3.4 x\r\n1.2.3.4 y\r\n"},
        "trashcan": {"items": []},
    });
    let parsed = payload::parse_backup(value.to_string().as_bytes()).unwrap();
    assert_eq!(parsed.entries_map["h1"], "1.2.3.4 x\n1.2.3.4 y\n");
}

#[test]
fn apply_backup_preserves_ids_writes_and_deletes_orphans() {
    let paths = temp_paths("apply");
    write_sample_data(&paths);

    let remote = json!({
        "format": "switchhosts-backup",
        "schemaVersion": 1,
        "manifest": {"schemaVersion": 1, "root": [
            {"id": "h1", "type": "local", "title": "one-updated", "on": false},
            {"id": "h9", "type": "local", "title": "new", "on": false},
        ]},
        "entries": {
            "h1": "127.0.0.1 alpha-updated\n",
            "h9": "127.0.0.1 brand-new\n",
        },
        "trashcan": {"schemaVersion": 1, "items": []},
        "trashcanEntries": {},
    });
    let parsed = payload::parse_backup(remote.to_string().as_bytes()).unwrap();

    // apply_backup takes paths directly; locking is the caller's job
    // (engine holds lock_store around it).
    let summary = payload::apply_backup(&paths, parsed).unwrap();

    assert!(matches!(summary, ApplySummary { hosts_count: 2, folder_count: 0, trashcan_count: 0, entries_written: 2, entries_deleted: 2 }));

    let manifest = Manifest::load(&paths).unwrap();
    assert_eq!(manifest.root.len(), 2);
    assert_eq!(manifest.root[0]["id"], "h1");
    assert_eq!(manifest.root[1]["id"], "h9");
    assert_eq!(
        entries::read_entry(&paths.entries_dir, "h1").unwrap(),
        "127.0.0.1 alpha-updated\n"
    );
    assert_eq!(
        entries::read_entry(&paths.entries_dir, "h9").unwrap(),
        "127.0.0.1 brand-new\n"
    );
    // Orphan ids (h2, h3) no longer own files.
    assert!(!entries::entry_path(&paths.entries_dir, "h2").unwrap().exists());
    assert!(!entries::entry_path(&paths.entries_dir, "h3").unwrap().exists());
    // Trashcan replaced by the incoming (empty) one.
    let trash = Trashcan::load(&paths.trashcan_file).unwrap();
    assert!(trash.items.is_empty());
    cleanup(&paths);
}

#[test]
fn snapshot_is_saved_and_pruned() {
    let paths = temp_paths("snapshot");
    write_sample_data(&paths);
    for i in 0..12 {
        let value = payload::build_backup_value(&paths).unwrap();
        let mut stamped = value.clone();
        stamped["stamp"] = json!(i);
        payload::save_snapshot(&paths, &stamped).unwrap();
    }
    let dir = paths.internal.join("snapshots");
    let count = std::fs::read_dir(&dir).unwrap().count();
    assert_eq!(count, payload::SNAPSHOT_KEEP);
    cleanup(&paths);
}

// ---- provider parsers ------------------------------------------------------

#[test]
fn parse_user_login_extracts_login() {
    assert_eq!(parse_user_login(r#"{"login":"octocat","id":1}"#).unwrap(), "octocat");
    assert!(parse_user_login(r#"{"id":1}"#).is_err());
    assert!(parse_user_login("not json").is_err());
}

#[test]
fn parse_content_file_decodes_base64() {
    let content = "hello hosts";
    let b64 = base64::engine::general_purpose::STANDARD.encode(content);
    // GitHub wraps base64 in 60-char lines; simulate that.
    let wrapped: String = b64
        .as_bytes()
        .chunks(60)
        .map(std::str::from_utf8)
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
        .join("\n");
    let body = json!({"sha": "abc123", "content": wrapped}).to_string();
    let file = parse_content_file(&body).unwrap();
    assert_eq!(file.sha, "abc123");
    assert_eq!(String::from_utf8(file.content).unwrap(), content);
}

#[test]
fn parse_content_file_rejects_missing_fields() {
    assert!(parse_content_file(r#"{"sha":"abc"}"#).is_err());
    assert!(parse_content_file(r#"{"content":"aGk="}"#).is_err());
}

#[test]
fn parse_device_poll_all_outcomes() {
    match parse_device_poll(r#"{"access_token":"tok"}"#).unwrap() {
        DevicePollOutcome::Token { token } => assert_eq!(token, "tok"),
        _ => panic!("expected token"),
    }
    match parse_device_poll(r#"{"error":"authorization_pending"}"#).unwrap() {
        DevicePollOutcome::Pending { interval } => assert_eq!(interval, 5),
        _ => panic!("expected pending"),
    }
    match parse_device_poll(r#"{"error":"slow_down"}"#).unwrap() {
        DevicePollOutcome::Pending { interval } => assert_eq!(interval, 15),
        _ => panic!("expected slow_down"),
    }
    assert!(matches!(
        parse_device_poll(r#"{"error":"expired_token"}"#).unwrap(),
        DevicePollOutcome::Expired
    ));
    assert!(matches!(
        parse_device_poll(r#"{"error":"access_denied"}"#).unwrap(),
        DevicePollOutcome::Denied
    ));
    // Unknown error maps to a fixed renderer-known code.
    let err = parse_device_poll(r#"{"error":"brand_new_failure"}"#).unwrap_err();
    assert!(matches!(err, SyncError::Device(_)));
}

#[test]
fn verify_status_mapping_splits_bad_token_from_missing_permission() {
    // 401 keeps meaning the credential itself is bad.
    assert_eq!(
        super::provider::SyncError::InvalidToken.code(),
        "invalid_token"
    );
    // 403 is a distinct, fixable condition (fine-grained PAT without the
    // needed permission) and must not be lumped with invalid tokens.
    let forbidden = super::provider::SyncError::Forbidden("reason".into());
    assert_eq!(forbidden.code(), "forbidden");
}

#[test]
fn decide_poll_orders_push_over_pull() {
    use PollAction::*;
    // Not logged in → never poll.
    assert_eq!(decide_poll(false, false, false), SkipNotLoggedIn);
    assert_eq!(decide_poll(false, true, true), SkipNotLoggedIn);
    // Logged in, idle → poll.
    assert_eq!(decide_poll(true, false, false), Pull);
    // Local unpushed mutations win over a pull so fresh edits are not
    // snapshotted-and-discarded in favour of an older remote copy.
    assert_eq!(decide_poll(true, true, false), SkipPendingPush);
    // A push is mid-round-trip; its PUT decides the remote state.
    assert_eq!(decide_poll(true, false, true), SkipInFlight);
    // Dirty beats in-flight in the ordering — the in-flight push will
    // publish the dirty state, so the next tick sees clean + idle.
    assert_eq!(decide_poll(true, true, true), SkipPendingPush);
}

#[test]
fn map_device_code_error_recognizes_flow_disabled() {
    let body = r#"{"error":"device_flow_disabled","error_description":"Device Flow must be explicitly enabled for this App"}"#;
    let err = map_device_code_error(400, body);
    assert!(matches!(err, SyncError::Device("flow_disabled")));
    // Unknown errors keep the api_<status> shape.
    let err = map_device_code_error(400, r#"{"error":"unrecognized_failure"}"#);
    assert!(matches!(err, SyncError::Api(400, _)));
    let err = map_device_code_error(500, "not json");
    assert!(matches!(err, SyncError::Api(500, _)));
}

#[test]
fn provider_error_codes_are_stable() {
    assert_eq!(SyncError::InvalidToken.code(), "invalid_token");
    assert_eq!(SyncError::Forbidden("body".into()).code(), "forbidden");
    assert_eq!(SyncError::Network("x".into()).code(), "network");
    assert_eq!(SyncError::Api(422, "b".into()).code(), "api_422");
    assert_eq!(SyncError::RateLimited.code(), "rate_limited");
    assert_eq!(
        SyncError::Device("client_id_missing").code(),
        "device_client_id_missing"
    );
    assert_eq!(provider::SyncError::Internal("x".into()).code(), "internal");
}
