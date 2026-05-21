//! Selected-content aggregation from an in-memory hosts tree.
//!
//! File I/O is injected via `read_entry` so the same logic works in
//! Tauri (filesystem) and WASM (entry map supplied by JavaScript).

use std::collections::HashMap;

use serde_json::Value;

use crate::normalize::remove_duplicate_records;

/// Aggregate the content of every selected node in `list`.
///
/// `read_entry` is called with each node's `id` when `on === true`.
/// Missing entries should return an empty string.
pub fn aggregate_selected_content<F>(
    list: &[Value],
    read_entry: F,
    remove_duplicate_records_flag: bool,
    line_ending: &str,
) -> String
where
    F: Fn(&str) -> String,
{
    let mut chunks: Vec<String> = Vec::new();
    collect_selected(list, &read_entry, &mut chunks);
    let mut content = chunks.join("\n\n");
    if remove_duplicate_records_flag {
        content = remove_duplicate_records(&content, line_ending);
    }
    content
}

/// Same as [`aggregate_selected_content`] but reads entry bodies from
/// an in-memory map — the shape the VS Code extension passes into WASM.
pub fn aggregate_selected_content_from_map(
    list: &[Value],
    entries: &HashMap<String, String>,
    remove_duplicate_records_flag: bool,
    line_ending: &str,
) -> String {
    aggregate_selected_content(
        list,
        |id| entries.get(id).cloned().unwrap_or_default(),
        remove_duplicate_records_flag,
        line_ending,
    )
}

fn collect_selected<F>(nodes: &[Value], read_entry: &F, out: &mut Vec<String>)
where
    F: Fn(&str) -> String,
{
    for node in nodes {
        if is_on(node) {
            if let Some(id) = node.get("id").and_then(Value::as_str) {
                out.push(read_entry(id));
            }
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            collect_selected(children, read_entry, out);
        }
    }
}

fn is_on(node: &Value) -> bool {
    node.get("on").and_then(Value::as_bool).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn aggregates_selected_nodes_in_tree_order() {
        let list = vec![
            json!({ "id": "a", "on": true }),
            json!({
                "id": "folder",
                "on": false,
                "children": [
                    { "id": "b", "on": true }
                ]
            }),
        ];
        let entries = HashMap::from([
            ("a".to_string(), "127.0.0.1 a".to_string()),
            ("b".to_string(), "127.0.0.1 b".to_string()),
        ]);

        let content =
            aggregate_selected_content_from_map(&list, &entries, false, "\n");

        assert_eq!(content, "127.0.0.1 a\n\n127.0.0.1 b");
    }
}
