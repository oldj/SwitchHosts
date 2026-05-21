//! WASM exports for the VS Code extension.
//!
//! JSON strings cross the JS/Rust boundary; Node.js owns filesystem I/O.

use std::collections::HashMap;

use serde_json::Value;
use switchhosts_core::{
    aggregate_selected_content_from_map, legacy_root_to_v5, remove_duplicate_records,
    v5_root_to_legacy,
};
use wasm_bindgen::prelude::*;

fn parse_json_array(input: &str, label: &str) -> Result<Vec<Value>, String> {
    serde_json::from_str(input).map_err(|e| format!("invalid {label} JSON array: {e}"))
}

fn parse_json_object_map(input: &str, label: &str) -> Result<HashMap<String, String>, String> {
    let value: Value =
        serde_json::from_str(input).map_err(|e| format!("invalid {label} JSON object: {e}"))?;
    let Some(obj) = value.as_object() else {
        return Err(format!("{label} must be a JSON object"));
    };
    let mut out = HashMap::with_capacity(obj.len());
    for (key, val) in obj {
        let content = val
            .as_str()
            .ok_or_else(|| format!("{label}[{key}] must be a string"))?
            .to_string();
        out.insert(key.clone(), content);
    }
    Ok(out)
}

#[wasm_bindgen]
pub fn ping() -> String {
    "pong".to_string()
}

#[wasm_bindgen]
pub fn remove_duplicate_records_wasm(content: &str, line_ending: &str) -> String {
    remove_duplicate_records(content, line_ending)
}

#[wasm_bindgen]
pub fn aggregate_selected_content_wasm(
    list_json: &str,
    entries_json: &str,
    remove_duplicate_records_flag: bool,
    line_ending: &str,
) -> Result<String, JsValue> {
    let list = parse_json_array(list_json, "list").map_err(|e| JsValue::from_str(&e))?;
    let entries = parse_json_object_map(entries_json, "entries").map_err(|e| JsValue::from_str(&e))?;
    Ok(aggregate_selected_content_from_map(
        &list,
        &entries,
        remove_duplicate_records_flag,
        line_ending,
    ))
}

#[wasm_bindgen]
pub fn legacy_root_to_v5_wasm(list_json: &str) -> Result<String, JsValue> {
    let list = parse_json_array(list_json, "list").map_err(|e| JsValue::from_str(&e))?;
    let (v5_root, collapsed) = legacy_root_to_v5(&list);
    let payload = serde_json::json!({
        "root": v5_root,
        "collapsedNodeIds": collapsed,
    });
    serde_json::to_string(&payload).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn v5_root_to_legacy_wasm(
    root_json: &str,
    collapsed_json: &str,
) -> Result<String, JsValue> {
    let root = parse_json_array(root_json, "root").map_err(|e| JsValue::from_str(&e))?;
    let collapsed: Vec<String> = serde_json::from_str(collapsed_json)
        .map_err(|e| JsValue::from_str(&format!("invalid collapsed JSON array: {e}")))?;
    let legacy = v5_root_to_legacy(&root, &collapsed);
    serde_json::to_string(&legacy).map_err(|e| JsValue::from_str(&e.to_string()))
}
