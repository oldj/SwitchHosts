use super::*;

struct Fixture(V5Paths);
impl Fixture {
    fn new() -> Self {
        let paths = V5Paths::under(std::env::temp_dir().join(fresh_id()));
        paths.ensure_dirs().unwrap();
        Manifest {
            root: vec![json!({"id":"same","type":"local","title":"Existing","on":true})],
            ..Default::default()
        }
        .save(&paths)
        .unwrap();
        entries::write_entry(&paths.entries_dir, "same", "old content").unwrap();
        Trashcan {
            items: vec![json!({"data":{"id":"trash","type":"local","title":"Deleted"}})],
            ..Default::default()
        }
        .save(&paths.trashcan_file)
        .unwrap();
        std::fs::write(&paths.config_file, b"{\"untouched\":true}").unwrap();
        std::fs::write(paths.histories_dir.join("system-hosts.json"), b"[]").unwrap();
        Self(paths)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0.root);
    }
}
fn backup() -> Value {
    json!({
        "format":"switchhosts-backup","schemaVersion":1,
        "manifest":{"root":[
            {"id":"folder","type":"folder","title":"Team","folder_mode":1,"children":[
                {"id":"nested","type":"folder","title":"Backend","children":[
                    {"id":"same","type":"local","title":"Imported","on":true} ]},
                {"id":"empty","type":"folder","title":"Empty","children":[]},
                {"id":"other","type":"remote","title":"Other","url":"https://example.test/hosts"}
            ]},
            {"id":"group","type":"group","title":"Combined","include":["same","other"],"on":true}
        ]}, "entries":{"same":"new content\r\n","other":"remote content"},
        "trashcan":{"items":[]}
    })
}
fn prepare(sessions: &Sessions, paths: &V5Paths) -> Preview {
    sessions
        .prepare(
            parse(&serde_json::to_vec(&backup()).unwrap()).unwrap(),
            "backup".into(),
            paths,
        )
        .unwrap()
}
fn request(p: &Preview, mode: Mode, selected: &[&str]) -> Request {
    Request {
        id: p.id.clone(),
        mode,
        selected: selected.iter().map(|s| s.to_string()).collect(),
        folder_name: None,
        confirmed: false,
    }
}

#[test]
fn preview_and_cancel_do_not_write_any_configuration() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let manifest = std::fs::read(&f.0.manifest_file).unwrap();
    let p = prepare(&sessions, &f.0);
    assert_eq!(p.contents["same"], "new content\n");
    assert_eq!(p.list[0]["children"][0]["children"][0]["on"], false);
    assert_eq!(std::fs::read(&f.0.manifest_file).unwrap(), manifest);
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, "same").unwrap(),
        "old content"
    );
    sessions.discard(&p.id);
    assert!(matches!(
        sessions.commit(request(&p, Mode::Append, &["folder"]), &f.0),
        Err(ImportError::Expired)
    ));
}

#[test]
fn appending_a_folder_keeps_nested_and_empty_folders_order_and_original_content() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    sessions
        .commit(request(&p, Mode::Append, &["folder"]), &f.0)
        .unwrap();
    let root = Manifest::load(&f.0).unwrap().root;
    assert_eq!(root.len(), 2);
    assert_eq!(root[0]["on"], true);
    assert_eq!(root[1]["title"], "Team");
    assert_eq!(root[1]["folder_mode"], 1);
    let nested = &root[1]["children"];
    assert_eq!(nested[0]["title"], "Backend");
    assert_eq!(nested[1]["title"], "Empty");
    assert_eq!(nested[1]["children"], json!([]));
    assert_eq!(nested[2]["title"], "Other");
    let imported = &nested[0]["children"][0];
    assert_ne!(id(imported), "same");
    assert_eq!(imported["on"], false);
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, id(imported)).unwrap(),
        "new content\n"
    );
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, "same").unwrap(),
        "old content"
    );
}

#[test]
fn partial_import_keeps_ancestors_but_excludes_unselected_siblings() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    sessions
        .commit(request(&p, Mode::Append, &["same"]), &f.0)
        .unwrap();
    let root = Manifest::load(&f.0).unwrap().root;
    assert_eq!(root[1]["children"].as_array().unwrap().len(), 1);
    assert_eq!(root[1]["children"][0]["title"], "Backend");
    assert_eq!(root[1]["children"][0]["children"][0]["title"], "Imported");
}

#[test]
fn empty_folder_alone_is_importable() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    sessions
        .commit(request(&p, Mode::Append, &["empty"]), &f.0)
        .unwrap();
    assert_eq!(
        Manifest::load(&f.0).unwrap().root[1]["children"][0]["title"],
        "Empty"
    );
}

#[test]
fn group_references_are_remapped_and_missing_selection_is_rejected() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    assert!(matches!(
        sessions.commit(request(&p, Mode::Append, &["group"]), &f.0),
        Err(ImportError::Invalid(_))
    ));
    sessions
        .commit(request(&p, Mode::Append, &["folder", "group"]), &f.0)
        .unwrap();
    let root = Manifest::load(&f.0).unwrap().root;
    assert_eq!(
        root[2]["include"][0],
        root[1]["children"][0]["children"][0]["id"]
    );
    assert_eq!(root[2]["include"][1], root[1]["children"][2]["id"]);
}

#[test]
fn replacement_requires_confirmation_preserves_trash_settings_history_and_consumes_token() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    let trash = std::fs::read(&f.0.trashcan_file).unwrap();
    let config = std::fs::read(&f.0.config_file).unwrap();
    assert!(sessions
        .commit(request(&p, Mode::Replace, &[]), &f.0)
        .is_err());
    let mut req = request(&p, Mode::Replace, &[]);
    req.confirmed = true;
    sessions.commit(req, &f.0).unwrap();
    let root = Manifest::load(&f.0).unwrap().root;
    assert_eq!(root.len(), 2);
    assert_eq!(root[0]["title"], "Team");
    assert!(!entries::entry_path(&f.0.entries_dir, "same")
        .unwrap()
        .exists());
    assert_eq!(std::fs::read(&f.0.trashcan_file).unwrap(), trash);
    assert_eq!(std::fs::read(&f.0.config_file).unwrap(), config);
    assert_eq!(
        std::fs::read(f.0.histories_dir.join("system-hosts.json")).unwrap(),
        b"[]"
    );
    assert!(matches!(
        sessions.commit(request(&p, Mode::Append, &["folder"]), &f.0),
        Err(ImportError::Expired)
    ));
}

#[test]
fn concurrent_content_edit_blocks_commit_until_explicit_repreview() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    entries::write_entry(&f.0.entries_dir, "same", "edited after preview").unwrap();
    assert!(matches!(
        sessions.commit(request(&p, Mode::Append, &["folder"]), &f.0),
        Err(ImportError::Changed)
    ));
    let p = sessions.rebase(&p.id, &f.0).unwrap();
    sessions
        .commit(request(&p, Mode::Append, &["folder"]), &f.0)
        .unwrap();
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, "same").unwrap(),
        "edited after preview"
    );
}

#[test]
fn failed_manifest_write_rolls_back_new_files_and_state() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    let before = std::fs::read(&f.0.manifest_file).unwrap();
    let before_state = std::fs::read(&f.0.state_file).unwrap();
    // Force a late failure after content files have been written.
    std::fs::create_dir(f.0.root.join("manifest.json.tmp")).unwrap();
    assert!(sessions
        .commit(request(&p, Mode::Append, &["folder"]), &f.0)
        .is_err());
    assert_eq!(std::fs::read(&f.0.manifest_file).unwrap(), before);
    assert_eq!(std::fs::read(&f.0.state_file).unwrap(), before_state);
    assert_eq!(std::fs::read_dir(&f.0.entries_dir).unwrap().count(), 1);
    assert!(!f.0.internal.join("storage-transaction.json").exists());
}

#[test]
fn rejects_bad_backup_shapes_missing_contents_duplicate_ids_and_cycles() {
    for source in [
        json!({"version":[4],"data":{}}),
        json!({"format":"switchhosts-backup","schemaVersion":2}),
        json!({"format":"switchhosts-backup","manifest":{"root":[]},"entries":{}}),
    ] {
        assert!(parse(&serde_json::to_vec(&source).unwrap()).is_err());
    }
    let mut source = backup();
    source["entries"].as_object_mut().unwrap().remove("same");
    assert!(parse(&serde_json::to_vec(&source).unwrap()).is_err());
    let mut source = backup();
    source["manifest"]["root"][1]["id"] = json!("same");
    assert!(parse(&serde_json::to_vec(&source).unwrap()).is_err());
    let mut source = backup();
    source["manifest"]["root"][1]["include"] = json!(["missing"]);
    assert!(parse(&serde_json::to_vec(&source).unwrap()).is_err());
    source["manifest"]["root"][1]["include"] = json!(["group"]);
    assert!(parse(&serde_json::to_vec(&source).unwrap()).is_err());
}

#[test]
fn reads_v3_v4_and_persisted_v5_shapes() {
    let v3 = json!({"version":[3,3],"list":[{"id":12,"where":"remote","refresh_interval":2,"content":"x\r\n"}]});
    let draft = parse(&serde_json::to_vec(&v3).unwrap()).unwrap();
    assert_eq!(draft.root[0]["refresh_interval"], 7200);
    assert_eq!(draft.contents["12"], "x\n");
    let v4 = json!({"version":[4,0],"data":{"list":{"tree":[{"id":"v4","type":"local"}]},"collection":{"hosts":{"data":[{"id":"v4","content":"old format"}]}}}});
    assert_eq!(
        parse(&serde_json::to_vec(&v4).unwrap()).unwrap().contents["v4"],
        "old format"
    );
    let mut v5 = backup();
    let root = v5["manifest"]["root"].as_array().unwrap();
    v5["manifest"]["root"] = json!(tree_format::legacy_root_to_v5(root).0);
    let draft = parse(&serde_json::to_vec(&v5).unwrap()).unwrap();
    assert_eq!(draft.root[0]["folder_mode"], 1);
    assert_eq!(draft.root[1]["include"], json!(["same", "other"]));
}

#[test]
fn v4_empty_configs_without_content_records_remain_importable() {
    // Legacy content records are created on first edit/refresh, not when the
    // tree node is created. A valid backup may therefore contain empty nodes.
    let data = json!({"version":[4],"data":{
        "list":{"tree":[
            {"id":"filled","type":"local"},
            {"id":"folder","type":"folder","children":[
                {"id":"empty","type":"local"},
                {"id":"pending","type":"remote","url":"https://example.test/hosts"}
            ]}
        ]},
        "collection":{"hosts":{"data":[{"id":"filled","content":"127.0.0.1 example.test"}]}}
    }});
    let f = Fixture::new();
    let imported = replace_for_test(&data, &f.0);
    let mut ids = Vec::new();
    manifest::collect_content_ids(&imported, &mut ids);
    assert_eq!(ids.len(), 3);
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, &ids[0]).unwrap(),
        "127.0.0.1 example.test"
    );
    for key in &ids[1..] {
        assert!(entries::entry_path(&f.0.entries_dir, key).unwrap().exists());
        assert_eq!(entries::read_entry(&f.0.entries_dir, key).unwrap(), "");
    }
}

#[test]
fn v4_malformed_content_collections_are_not_treated_as_empty_configs() {
    for collection in [
        json!(false),
        json!({"hosts": []}),
        json!({"hosts": {"data": {}}}),
        json!({"hosts": {"data": [{"id":"empty", "content":null}]}}),
    ] {
        let data = json!({"version":[4],"data":{
            "list":{"tree":[{"id":"empty","type":"local"}]},
            "collection":collection
        }});
        assert!(parse(&serde_json::to_vec(&data).unwrap()).is_err());
    }
}

#[test]
fn v4_missing_content_collection_is_not_treated_as_an_empty_record() {
    for collection in [None, Some(json!({})), Some(json!({"hosts": {}}))] {
        let mut data = json!({"version":[4],"data":{
            "list":{"tree":[{"id":"folder","type":"folder","children":[
                {"id":"local","type":"local"}
            ]}]}
        }});
        if let Some(collection) = collection {
            data["data"]["collection"] = collection;
        }
        assert!(parse(&serde_json::to_vec(&data).unwrap()).is_err());
        data["data"]["collection"] = json!({"hosts":{"data":[]}});
        let draft = parse(&serde_json::to_vec(&data).unwrap()).unwrap();
        assert_eq!(draft.contents["local"], "");
    }
    let folders_only = json!({"version":[4],"data":{
        "list":{"tree":[{"id":"folder","type":"folder","children":[]}]}
    }});
    assert!(parse(&serde_json::to_vec(&folders_only).unwrap()).is_ok());
}

#[test]
fn group_reference_depth_limit_does_not_depend_on_node_order() {
    for depth in [60, 61] {
        let mut root = vec![json!({"id":"g0","type":"group","include":[]})];
        for i in 1..=depth {
            root.push(json!({"id":format!("g{i}"),"type":"group","include":[format!("g{}", i-1)]}));
        }
        for _ in 0..2 {
            let data = json!({"format":"switchhosts-backup","manifest":{"root":root},"entries":{}});
            assert_eq!(
                parse(&serde_json::to_vec(&data).unwrap()).is_ok(),
                depth == 60
            );
            root.reverse();
        }
    }
}

#[test]
fn wrapper_name_collision_and_root_name_collision_keep_both() {
    let f = Fixture::new();
    let sessions = Sessions::default();
    let p = prepare(&sessions, &f.0);
    let mut req = request(&p, Mode::Append, &["empty"]);
    req.folder_name = Some("Existing".into());
    sessions.commit(req, &f.0).unwrap();
    assert_eq!(
        Manifest::load(&f.0).unwrap().root[1]["title"],
        "Existing (2)"
    );
    let p = prepare(&sessions, &f.0);
    sessions
        .commit(request(&p, Mode::Append, &["empty"]), &f.0)
        .unwrap();
    let p = prepare(&sessions, &f.0);
    sessions
        .commit(request(&p, Mode::Append, &["empty"]), &f.0)
        .unwrap();
    assert_eq!(Manifest::load(&f.0).unwrap().root[3]["title"], "Team (2)");
}

#[test]
fn rejects_damaged_folder_and_metadata_instead_of_silently_dropping_them() {
    for (key, value) in [
        ("children", json!({})),
        ("folder", json!(3)),
        ("type", json!(true)),
    ] {
        let mut data = backup();
        data["manifest"]["root"][0][key] = value;
        assert!(parse(&serde_json::to_vec(&data).unwrap()).is_err());
    }
    for (key, value) in [
        ("domains", json!("not an array")),
        ("url", json!({})),
        ("domain_results", json!([{}])),
    ] {
        let mut data = backup();
        data["manifest"]["root"][0]["children"][2][key] = value;
        assert!(parse(&serde_json::to_vec(&data).unwrap()).is_err());
    }
}

#[test]
fn discards_irrelevant_content_and_non_group_references_before_remapping() {
    let f = Fixture::new();
    let mut data = backup();
    data["manifest"]["root"][0]["children"][0]["children"][0]["include"] = json!(["missing"]);
    data["entries"]["folder"] = json!("not a content-owning node");
    let draft = parse(&serde_json::to_vec(&data).unwrap()).unwrap();
    assert!(!draft.contents.contains_key("folder"));
    assert!(draft.root[0]["children"][0]["children"][0]
        .get("include")
        .is_none());
    replace_for_test(&data, &f.0);
    assert_eq!(std::fs::read_dir(&f.0.entries_dir).unwrap().count(), 2);
}

#[test]
fn export_and_reimport_preserves_contents_hierarchy_and_remote_metadata_with_fresh_ids() {
    let f = Fixture::new();
    let original = replace_for_test(&backup(), &f.0);
    let path = f.0.root.join("export.json");
    crate::import_export::export_to_file(&path, &f.0).unwrap();
    let data: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let imported = replace_for_test(&data, &f.0);
    assert_ne!(original[0]["id"], imported[0]["id"]);
    assert_eq!(
        imported[0]["children"][2]["url"],
        "https://example.test/hosts"
    );
    assert_eq!(imported[0]["children"][1]["children"], json!([]));
    assert_eq!(
        imported[1]["include"][0],
        imported[0]["children"][0]["children"][0]["id"]
    );
    let local = id(&imported[0]["children"][0]["children"][0]);
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, local).unwrap(),
        "new content\n"
    );
}

#[test]
fn reimport_preserves_exported_node_metadata() {
    let f = Fixture::new();
    let mut manifest = Manifest::load(&f.0).unwrap();
    manifest.root[0]["description"] = json!("Keep this note");
    manifest.root.push(json!({
        "id":"folder", "type":"folder", "title":"Folder", "is_collapsed":true,
        "children":[{"id":"child", "type":"local", "description":"Nested note"}]
    }));
    manifest.save(&f.0).unwrap();
    entries::write_entry(&f.0.entries_dir, "child", "127.0.0.1 child.test").unwrap();
    let path = f.0.root.join("export.json");
    crate::import_export::export_to_file(&path, &f.0).unwrap();
    let data: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let imported = replace_for_test(&data, &f.0);
    assert_eq!(imported[0]["description"], "Keep this note");
    assert_eq!(imported[1]["is_collapsed"], true);
    assert_eq!(imported[1]["children"][0]["description"], "Nested note");
}

#[test]
fn legacy_system_nodes_are_excluded_and_nested_v3_configs_are_imported_disabled() {
    let f = Fixture::new();
    let source = json!({"version":[3],"list":[
        {"id":0,"content":"system hosts"},
        {"id":"parent","where":"folder","children":[
            {"id":"child","where":"local","on":true,"content":"nested"}
        ]}
    ]});
    let root = replace_for_test(&source, &f.0);
    assert_eq!(root.len(), 1);
    assert_eq!(root[0]["type"], "folder");
    assert_eq!(root[0]["children"][0]["on"], false);
    assert_eq!(
        entries::read_entry(&f.0.entries_dir, id(&root[0]["children"][0])).unwrap(),
        "nested"
    );
    assert!(!entries::entry_path(&f.0.entries_dir, "0").unwrap().exists());
}
