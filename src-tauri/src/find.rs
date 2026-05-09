//! Find / replace window plumbing.
//!
//! Phase 2.D scope:
//!
//! - Lazy-create the `find` webview (route `#/find`) on first
//!   `find_show` invocation. Closing the window destroys it; the next
//!   `find_show` invocation creates a fresh webview.
//! - Search content of every local/remote node in the manifest. Group
//!   and folder nodes are skipped (Electron does the same — they have
//!   no own content, only references).
//! - Persist find / replace history to
//!   `internal/histories/find.json` and `internal/histories/replace.json`,
//!   capped at 20 entries (matches Electron's `MAX_LENGTH = 20`).
//!
//! On-disk shape mirrors the renderer's `IFindHistoryData` /
//! `string[]` types one-for-one so the existing `pages/find.tsx`
//! consumers work without changes.

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::{Color, WebviewWindowBuilder};
use tauri::{AppHandle, EventId, Listener, Manager, Runtime, Theme, WebviewUrl};

use crate::{
    i18n,
    storage::{
        atomic::atomic_write,
        entries,
        error::StorageError,
        manifest::{self, Manifest},
        AppState,
    },
};

pub const FIND_WINDOW_LABEL: &str = "find";
const FIND_WINDOW_READY_EVENT: &str = "find_window_ready";

const FIND_WINDOW_WIDTH: f64 = 480.0;
const FIND_WINDOW_HEIGHT: f64 = 400.0;
const FIND_WINDOW_MIN_WIDTH: f64 = 400.0;
const FIND_WINDOW_MIN_HEIGHT: f64 = 400.0;
const FIND_WINDOW_READY_FALLBACK_MS: u64 = 1500;

/// Per-window state for the renderer-ready gate. A new instance is
/// installed every time we create a fresh find webview; on re-create we
/// `abandon()` the previous one so its listener and fallback timer
/// become no-ops and can't accidentally show an unrelated window.
struct FindGate {
    did_show: Arc<AtomicBool>,
    listener_id: Arc<Mutex<Option<EventId>>>,
}

impl FindGate {
    /// Mark this gate as superseded so any in-flight handler (listener
    /// or fallback timer) takes its early-return branch on next fire.
    fn abandon<R: Runtime>(&self, app: &AppHandle<R>) {
        self.did_show.store(true, Ordering::SeqCst);
        if let Some(id) = self
            .listener_id
            .lock()
            .expect("find listener mutex poisoned")
            .take()
        {
            app.unlisten(id);
        }
    }

    fn is_pending(&self) -> bool {
        !self.did_show.load(Ordering::SeqCst)
    }
}

static FIND_GATE: Mutex<Option<FindGate>> = Mutex::new(None);

const FIND_HISTORY_FILE: &str = "find.json";
const REPLACE_HISTORY_FILE: &str = "replace.json";
const HISTORY_MAX: usize = 20;

// ---- search options + result types ----------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FindOptions {
    #[serde(default)]
    pub is_regexp: bool,
    #[serde(default)]
    pub is_ignore_case: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FindPosition {
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub line_pos: usize,
    pub end_line: usize,
    pub end_line_pos: usize,
    pub before: String,
    #[serde(rename = "match")]
    pub match_text: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FindItem {
    pub item_id: String,
    pub item_title: String,
    pub item_type: String,
    // Keep search payloads lean: the renderer only needs row display data and
    // jump offsets. Replacement re-reads content on the Rust side.
    pub positions: Vec<FindPosition>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FindReplaceOneArgs {
    pub item_id: String,
    pub start: usize,
    pub end: usize,
    pub expected: String,
    pub replace_to: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FindReplaceAllOutcome {
    pub item_ids: Vec<String>,
    pub replaced_count: usize,
}

// ---- search engine --------------------------------------------------------

/// Run a find pass against every local/remote node in the manifest
/// and return one `FindItem` per node that matched.
pub fn find_in_manifest(
    state: &AppState,
    keyword: &str,
    options: &FindOptions,
) -> Result<Vec<FindItem>, String> {
    if keyword.is_empty() {
        return Ok(Vec::new());
    }
    let regex = build_regex(keyword, options)?;

    let manifest = Manifest::load(&state.paths).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    walk_searchable(&manifest.root, &mut |id, title, kind| {
        let content = match entries::read_entry(&state.paths.entries_dir, id) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("read {id}: {e}");
                return;
            }
        };
        let positions = find_positions_in_content(&content, &regex);
        if positions.is_empty() {
            return;
        }
        out.push(FindItem {
            item_id: id.to_string(),
            item_title: title.to_string(),
            item_type: kind.to_string(),
            positions,
        });
    });
    Ok(out)
}

fn build_regex(keyword: &str, options: &FindOptions) -> Result<Regex, String> {
    let pattern = if options.is_regexp {
        keyword.to_string()
    } else {
        // Escape regex metacharacters so the user gets a literal
        // string search by default. Mirrors the
        // `keyword.replace(/([.^$([?*+])/gi, '\\$1')` pass in
        // `src/main/actions/find/findBy.ts` — `regex::escape` is
        // a strict superset (also escapes `]`, `}`, `|`, `\\`, etc.)
        // so any string the user types becomes a valid literal.
        regex::escape(keyword)
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(options.is_ignore_case)
        .build()
        .map_err(|e| format!("invalid pattern: {e}"))
}

/// Mirror of `src/main/actions/find/findPositionsInContent.ts`. For
/// each match in `content` we record positions (in UTF-16 code units,
/// matching CodeMirror / JS string indexing), line numbers, and the
/// surrounding line slices the renderer needs to render the result
/// list and jump back to the source view.
///
fn find_positions_in_content(content: &str, regex: &Regex) -> Vec<FindPosition> {
    let line_index = LineIndex::new(content);
    let mut positions = Vec::new();
    let mut line_idx = 0;
    let mut utf16_cursor = Utf16Cursor::default();

    for mat in regex.find_iter(content) {
        let start = mat.start();
        let end = mat.end();

        // CodeMirror counts offsets in UTF-16 code units (== JS string
        // length); the regex crate returns UTF-8 byte offsets. Convert
        // every outgoing offset / position so non-ASCII content (CJK,
        // emoji) doesn't skew the find-window jump or the result list's
        // column display.
        let start_u16 = utf16_cursor.advance_to(content, start);
        line_idx = line_index.line_idx_for_start(line_idx, start);
        let line_info = &line_index.lines[line_idx];
        let line = line_idx + 1;
        let line_pos = start_u16 - line_info.start_u16;

        let match_text = mat.as_str();
        let metrics = MatchMetrics::new(match_text);
        let end_u16 = start_u16 + metrics.utf16_len;

        let end_line_idx = line_idx + metrics.newline_count;
        let end_line = line + metrics.newline_count;
        let end_line_pos = if metrics.newline_count == 0 {
            line_pos + metrics.utf16_len
        } else {
            metrics.utf16_len_after_last_newline
        };
        let end_line_end_byte = line_index
            .lines
            .get(end_line_idx)
            .map(|line| line.end_byte)
            .unwrap_or(content.len());

        utf16_cursor.set(end, end_u16);

        positions.push(FindPosition {
            start: start_u16,
            end: end_u16,
            line,
            line_pos,
            end_line,
            end_line_pos,
            before: content[line_info.start_byte..start].to_string(),
            match_text: match_text.to_string(),
            after: content[end..end_line_end_byte].to_string(),
        });
    }
    positions
}

#[derive(Debug, Clone, Copy)]
struct LineInfo {
    start_byte: usize,
    end_byte: usize,
    start_u16: usize,
}

#[derive(Debug)]
struct LineIndex {
    lines: Vec<LineInfo>,
}

impl LineIndex {
    /// Precompute line byte starts and UTF-16 starts once. High-hit searches
    /// can otherwise devolve into rescanning the content prefix for each match.
    fn new(content: &str) -> Self {
        let mut lines = vec![LineInfo {
            start_byte: 0,
            end_byte: content.len(),
            start_u16: 0,
        }];
        let mut utf16_offset = 0;

        for (byte_idx, ch) in content.char_indices() {
            utf16_offset += ch.len_utf16();
            if ch == '\n' {
                if let Some(last) = lines.last_mut() {
                    last.end_byte = byte_idx;
                }
                lines.push(LineInfo {
                    start_byte: byte_idx + ch.len_utf8(),
                    end_byte: content.len(),
                    start_u16: utf16_offset,
                });
            }
        }

        Self { lines }
    }

    fn line_idx_for_start(&self, mut current_idx: usize, byte_idx: usize) -> usize {
        while current_idx + 1 < self.lines.len()
            && self.lines[current_idx + 1].start_byte <= byte_idx
        {
            current_idx += 1;
        }
        current_idx
    }
}

#[derive(Debug, Default)]
struct Utf16Cursor {
    byte: usize,
    utf16: usize,
}

impl Utf16Cursor {
    /// Move forward from the last match boundary and return the UTF-16 offset
    /// for `target_byte`. Regex matches are yielded in byte order, so normal
    /// search remains linear.
    fn advance_to(&mut self, content: &str, target_byte: usize) -> usize {
        if target_byte < self.byte {
            self.byte = 0;
            self.utf16 = 0;
        }

        for ch in content[self.byte..target_byte].chars() {
            self.utf16 += ch.len_utf16();
        }
        self.byte = target_byte;
        self.utf16
    }

    fn set(&mut self, byte: usize, utf16: usize) {
        self.byte = byte;
        self.utf16 = utf16;
    }
}

#[derive(Debug, Default)]
struct MatchMetrics {
    utf16_len: usize,
    newline_count: usize,
    utf16_len_after_last_newline: usize,
}

impl MatchMetrics {
    fn new(match_text: &str) -> Self {
        let mut out = Self::default();
        for ch in match_text.chars() {
            out.utf16_len += ch.len_utf16();
            if ch == '\n' {
                out.newline_count += 1;
                out.utf16_len_after_last_newline = 0;
            } else {
                out.utf16_len_after_last_newline += ch.len_utf16();
            }
        }
        out
    }
}

pub fn replace_one_in_manifest(state: &AppState, args: FindReplaceOneArgs) -> Result<bool, String> {
    if args.start > args.end {
        return Err("find_replace_one: start must be <= end".to_string());
    }

    let manifest = Manifest::load(&state.paths).map_err(|e| e.to_string())?;
    let Some(node) = manifest::find_node(&manifest.root, &args.item_id) else {
        return Ok(false);
    };
    // Missing type is treated as local for older/migrated manifests; remote
    // entries remain read-only from the find window.
    if node.get("type").and_then(Value::as_str).unwrap_or("local") != "local" {
        return Ok(false);
    }

    let mut content =
        entries::read_entry(&state.paths.entries_dir, &args.item_id).map_err(|e| e.to_string())?;
    let Some((start, end)) = utf16_range_to_byte_range(&content, args.start, args.end) else {
        return Ok(false);
    };
    if content[start..end] != args.expected {
        return Ok(false);
    }

    content.replace_range(start..end, &args.replace_to);
    entries::write_entry(&state.paths.entries_dir, &args.item_id, &content)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn replace_all_in_manifest(
    state: &AppState,
    keyword: &str,
    options: &FindOptions,
    replace_to: &str,
) -> Result<FindReplaceAllOutcome, String> {
    if keyword.is_empty() {
        return Ok(FindReplaceAllOutcome {
            item_ids: Vec::new(),
            replaced_count: 0,
        });
    }
    let regex = build_regex(keyword, options)?;
    let manifest = Manifest::load(&state.paths).map_err(|e| e.to_string())?;
    // First read every local entry and compute its replacement. That way a
    // later read error does not leave earlier entries already written.
    let mut pending_writes: Vec<(String, String, usize)> = Vec::new();
    let mut read_error: Option<String> = None;

    walk_searchable(&manifest.root, &mut |id, _title, kind| {
        if read_error.is_some() {
            return;
        }
        if kind != "local" {
            return;
        }
        let content = match entries::read_entry(&state.paths.entries_dir, id) {
            Ok(c) => c,
            Err(e) => {
                read_error = Some(format!("read {id}: {e}"));
                return;
            }
        };
        let (next_content, count) = replace_all_in_content(&content, &regex, replace_to);
        if count > 0 {
            pending_writes.push((id.to_string(), next_content, count));
        }
    });

    if let Some(error) = read_error {
        return Err(error);
    }

    let mut item_ids = Vec::new();
    let mut replaced_count = 0;

    for (id, next_content, count) in pending_writes {
        entries::write_entry(&state.paths.entries_dir, &id, &next_content)
            .map_err(|e| format!("write {id}: {e}"))?;
        item_ids.push(id);
        replaced_count += count;
    }

    Ok(FindReplaceAllOutcome {
        item_ids,
        replaced_count,
    })
}

fn replace_all_in_content(content: &str, regex: &Regex, replace_to: &str) -> (String, usize) {
    // Do literal replacement. Regex::replace_all would expand `$1`-style
    // captures, which is not how the existing find window behaved.
    let mut out = String::with_capacity(content.len());
    let mut last_end = 0;
    let mut count = 0;

    for mat in regex.find_iter(content) {
        out.push_str(&content[last_end..mat.start()]);
        out.push_str(replace_to);
        last_end = mat.end();
        count += 1;
    }

    if count == 0 {
        return (content.to_string(), 0);
    }

    out.push_str(&content[last_end..]);
    (out, count)
}

fn utf16_range_to_byte_range(content: &str, start: usize, end: usize) -> Option<(usize, usize)> {
    let start_byte = utf16_offset_to_byte(content, start)?;
    let end_byte = utf16_offset_to_byte(content, end)?;
    Some((start_byte, end_byte))
}

fn utf16_offset_to_byte(content: &str, target: usize) -> Option<usize> {
    // Renderer/editor offsets are JS string offsets (UTF-16 code units), while
    // Rust string slicing needs UTF-8 byte boundaries.
    if target == 0 {
        return Some(0);
    }

    let mut utf16_offset = 0;
    for (byte_idx, ch) in content.char_indices() {
        if utf16_offset == target {
            return Some(byte_idx);
        }
        utf16_offset += ch.len_utf16();
        if utf16_offset == target {
            return Some(byte_idx + ch.len_utf8());
        }
        if utf16_offset > target {
            return None;
        }
    }

    if utf16_offset == target {
        Some(content.len())
    } else {
        None
    }
}

fn walk_searchable<F: FnMut(&str, &str, &str)>(nodes: &[Value], visit: &mut F) {
    for node in nodes {
        let kind = node.get("type").and_then(Value::as_str).unwrap_or("local");
        if kind != "group" && kind != "folder" {
            if let Some(id) = node.get("id").and_then(Value::as_str) {
                let title = node.get("title").and_then(Value::as_str).unwrap_or("");
                visit(id, title, kind);
            }
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            walk_searchable(children, visit);
        }
    }
}

// ---- find / replace history persistence -----------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindHistoryEntry {
    pub value: String,
    #[serde(default)]
    pub is_regexp: bool,
    #[serde(default)]
    pub is_ignore_case: bool,
}

fn find_history_path(state: &AppState) -> PathBuf {
    state.paths.histories_dir.join(FIND_HISTORY_FILE)
}

fn replace_history_path(state: &AppState) -> PathBuf {
    state.paths.histories_dir.join(REPLACE_HISTORY_FILE)
}

pub fn get_find_history(state: &AppState) -> Result<Vec<FindHistoryEntry>, StorageError> {
    load_json_array(&find_history_path(state))
}

pub fn set_find_history(state: &AppState, items: &[FindHistoryEntry]) -> Result<(), StorageError> {
    save_json_array(&find_history_path(state), items)
}

pub fn add_find_history(
    state: &AppState,
    entry: FindHistoryEntry,
) -> Result<Vec<FindHistoryEntry>, StorageError> {
    let mut all = get_find_history(state).unwrap_or_default();
    all.retain(|i| i.value != entry.value);
    all.push(entry);
    while all.len() > HISTORY_MAX {
        all.remove(0);
    }
    set_find_history(state, &all)?;
    Ok(all)
}

pub fn get_replace_history(state: &AppState) -> Result<Vec<String>, StorageError> {
    load_json_array(&replace_history_path(state))
}

pub fn set_replace_history(state: &AppState, items: &[String]) -> Result<(), StorageError> {
    save_json_array(&replace_history_path(state), items)
}

pub fn add_replace_history(state: &AppState, value: String) -> Result<Vec<String>, StorageError> {
    let mut all = get_replace_history(state).unwrap_or_default();
    all.retain(|v| v != &value);
    all.push(value);
    while all.len() > HISTORY_MAX {
        all.remove(0);
    }
    set_replace_history(state, &all)?;
    Ok(all)
}

fn load_json_array<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Vec<T>, StorageError> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(path).map_err(|e| StorageError::io(path.display().to_string(), e))?;
    serde_json::from_slice::<Vec<T>>(&bytes).or_else(|_| {
        // Tolerate slight schema drift: anything that doesn't decode
        // as the expected list shape resets to empty rather than
        // crashing the find window.
        log::warn!("{} could not be parsed; treating as empty.", path.display());
        Ok(Vec::new())
    })
}

fn save_json_array<T: Serialize>(path: &Path, items: &[T]) -> Result<(), StorageError> {
    let bytes = serde_json::to_vec_pretty(items)
        .map_err(|e| StorageError::serialize(path.display().to_string(), e))?;
    atomic_write(path, &bytes)
}

// ---- window create + show -------------------------------------------------

/// Bring the find webview to the front, lazy-creating it the first time.
/// A newly-created webview stays hidden until the renderer applies its
/// theme and emits `find_window_ready`; after a user closes it, the next
/// call creates a fresh one.
pub fn show_find_window<R: Runtime + 'static>(app: &AppHandle<R>) -> Result<(), tauri::Error> {
    if let Some(window) = app.get_webview_window(FIND_WINDOW_LABEL) {
        // Existing window. If its ready gate is still pending the
        // listener/fallback will show it; don't preempt them or we'd
        // re-introduce the dark-theme flash this gate exists to avoid.
        let pending = FIND_GATE
            .lock()
            .expect("find gate mutex poisoned")
            .as_ref()
            .map(|g| g.is_pending())
            .unwrap_or(false);
        if pending {
            return Ok(());
        }
        show_find_window_now(&window)?;
        return Ok(());
    }

    // Window was destroyed (or never existed). Abandon any leftover
    // gate from a previous lifecycle so a stale listener/fallback can't
    // race against the new window we're about to create.
    {
        let mut slot = FIND_GATE.lock().expect("find gate mutex poisoned");
        if let Some(old) = slot.take() {
            old.abandon(app);
        }
    }

    let window = create_find_window(app)?;
    let gate = install_find_window_ready_handlers(app, &window);
    *FIND_GATE.lock().expect("find gate mutex poisoned") = Some(gate);
    Ok(())
}

pub fn refresh_find_window_title<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(FIND_WINDOW_LABEL) else {
        return;
    };
    let _ = window.set_title(i18n::find_window_title(app));
    hide_find_window_menu(&window);
}

pub fn set_find_window_title<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
) -> Result<(), tauri::Error> {
    let Some(window) = app.get_webview_window(FIND_WINDOW_LABEL) else {
        return Ok(());
    };
    window.set_title(title)
}

fn show_find_window_now<R: Runtime>(window: &tauri::WebviewWindow<R>) -> Result<(), tauri::Error> {
    window.unminimize().ok();
    window.show()?;
    window.set_focus()?;
    Ok(())
}

fn show_find_window_once<R: Runtime>(
    app: &AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
    did_show: &AtomicBool,
    listener_id: &Arc<Mutex<Option<EventId>>>,
) {
    // `compare_exchange` here doubles as the "abandoned" check: when a
    // newer window supersedes us, the old gate's `did_show` is forced
    // to true by `FindGate::abandon`, so this exchange returns Err and
    // we exit without touching anything.
    if did_show
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    if let Err(e) = show_find_window_now(window) {
        // Reset so the fallback (or a future caller) can try again.
        did_show.store(false, Ordering::SeqCst);
        log::warn!("failed to show find window: {e}");
        return;
    }

    unlisten_find_window_ready(app, listener_id);
}

fn unlisten_find_window_ready<R: Runtime>(
    app: &AppHandle<R>,
    listener_id: &Arc<Mutex<Option<EventId>>>,
) {
    if let Some(id) = listener_id
        .lock()
        .expect("find listener mutex poisoned")
        .take()
    {
        app.unlisten(id);
    }
}

fn install_find_window_ready_handlers<R: Runtime + 'static>(
    app: &AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> FindGate {
    let did_show = Arc::new(AtomicBool::new(false));
    let listener_id = Arc::new(Mutex::new(None));

    let ready_app = app.clone();
    let ready_window = window.clone();
    let ready_flag = did_show.clone();
    let ready_listener_id = listener_id.clone();
    let id = app.listen(FIND_WINDOW_READY_EVENT, move |event| {
        show_find_window_once(&ready_app, &ready_window, &ready_flag, &ready_listener_id);
        ready_app.unlisten(event.id());
    });
    *listener_id.lock().expect("find listener mutex poisoned") = Some(id);

    let fallback_app = app.clone();
    let fallback_window = window.clone();
    let fallback_flag = did_show.clone();
    let fallback_listener_id = listener_id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(FIND_WINDOW_READY_FALLBACK_MS));
        if fallback_flag.load(Ordering::SeqCst) {
            return;
        }

        let app = fallback_app.clone();
        let window = fallback_window.clone();
        let flag = fallback_flag.clone();
        let listener_id = fallback_listener_id.clone();
        // Show the exact window this gate was created for, never
        // `app.get_webview_window(LABEL)` — after close-then-reopen the
        // label resolves to a brand-new window whose renderer hasn't
        // emitted ready yet, and showing it would re-introduce the
        // flash. If the captured window has been destroyed, the show
        // call simply fails and we log + bail.
        let _ = fallback_app.run_on_main_thread(move || {
            show_find_window_once(&app, &window, &flag, &listener_id);
        });
    });

    FindGate {
        did_show,
        listener_id,
    }
}

fn configured_theme(state: &AppState) -> Option<Theme> {
    let cfg = state.config.lock().expect("config mutex poisoned");
    match cfg.theme.as_str() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

fn background_color_for_theme(theme: Theme) -> Color {
    match theme {
        Theme::Dark => Color(26, 27, 30, 255),
        _ => Color(248, 249, 250, 255),
    }
}

#[cfg_attr(target_os = "macos", allow(unused_variables))]
fn hide_find_window_menu<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    #[cfg(not(target_os = "macos"))]
    if let Err(e) = window.hide_menu() {
        log::warn!("failed to hide find window menu: {e}");
    }
}

fn create_find_window<R: Runtime + 'static>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let url = WebviewUrl::App("#/find".into());
    let configured_theme = configured_theme(app.state::<AppState>().inner());
    let initial_theme = configured_theme.unwrap_or(Theme::Light);
    let builder = WebviewWindowBuilder::new(app, FIND_WINDOW_LABEL, url)
        .title(i18n::find_window_title(app))
        .inner_size(FIND_WINDOW_WIDTH, FIND_WINDOW_HEIGHT)
        .min_inner_size(FIND_WINDOW_MIN_WIDTH, FIND_WINDOW_MIN_HEIGHT)
        .resizable(true)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .theme(configured_theme)
        .background_color(background_color_for_theme(initial_theme))
        .visible(false);

    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);

    let window = builder.build()?;

    if let Ok(theme) = window.theme() {
        let _ = window.set_background_color(Some(background_color_for_theme(theme)));
    }
    hide_find_window_menu(&window);

    Ok(window)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicU64};
    use std::sync::Mutex;

    use serde_json::json;

    use crate::storage::{AppConfig, V5Paths};

    fn re(pattern: &str) -> Regex {
        Regex::new(pattern).unwrap()
    }

    fn temp_state(name: &str) -> AppState {
        let root = std::env::temp_dir().join(format!(
            "switchhosts-find-test-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let paths = V5Paths::under(root);
        paths.ensure_dirs().unwrap();
        AppState {
            paths,
            config: Mutex::new(AppConfig::default()),
            store_lock: Mutex::new(()),
            is_will_quit: AtomicBool::new(false),
            last_geometry_persist_ms: AtomicU64::new(0),
        }
    }

    #[test]
    fn positions_are_utf16_for_non_ascii_prefix() {
        // "前缀" is 6 bytes / 2 UTF-16 units; "😀" is 4 bytes / 2 UTF-16
        // units (surrogate pair). The byte offset of "match" is 10 but
        // CodeMirror sees it at UTF-16 index 4.
        let content = "前缀😀match";
        let positions = find_positions_in_content(content, &re("match"));
        assert_eq!(positions.len(), 1);
        let p = &positions[0];
        assert_eq!(p.start, 4);
        assert_eq!(p.end, 9);
        assert_eq!(p.line_pos, 4);
        assert_eq!(p.end_line_pos, 9);
        assert_eq!(p.match_text, "match");
    }

    #[test]
    fn line_pos_resets_on_each_line() {
        let content = "abc\n中文 abc";
        let positions = find_positions_in_content(content, &re("abc"));
        assert_eq!(positions.len(), 2);
        assert_eq!(positions[0].line, 1);
        assert_eq!(positions[0].line_pos, 0);
        assert_eq!(positions[1].line, 2);
        // "中文 " is 3 UTF-16 units before the second "abc"
        assert_eq!(positions[1].line_pos, 3);
    }

    #[test]
    fn multiline_match_reports_end_line_and_column() {
        let content = "before α\nβ after";
        let positions = find_positions_in_content(content, &re("α\nβ"));
        assert_eq!(positions.len(), 1);
        let p = &positions[0];
        assert_eq!(p.line, 1);
        assert_eq!(p.line_pos, 7);
        assert_eq!(p.end_line, 2);
        assert_eq!(p.end_line_pos, 1);
        assert_eq!(p.before, "before ");
        assert_eq!(p.after, " after");
    }

    #[test]
    fn many_matches_are_collected_without_prefix_rescans() {
        let content = "127.0.0.1 example.test\n".repeat(10_000);
        let positions = find_positions_in_content(&content, &re("127"));
        assert_eq!(positions.len(), 10_000);
        assert_eq!(positions[9_999].line, 10_000);
        assert_eq!(positions[9_999].line_pos, 0);
    }

    #[test]
    fn replace_all_treats_replacement_as_literal_text() {
        let (content, count) = replace_all_in_content("one 123 two 456", &re(r"\d+"), "$1");
        assert_eq!(count, 2);
        assert_eq!(content, "one $1 two $1");
    }

    #[test]
    fn replace_one_uses_utf16_offsets() {
        let state = temp_state("replace-one");
        let manifest = Manifest {
            root: vec![json!({
                "id": "local-one",
                "title": "Local",
                "type": "local",
            })],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        entries::write_entry(&state.paths.entries_dir, "local-one", "前缀😀match tail").unwrap();

        let replaced = replace_one_in_manifest(
            &state,
            FindReplaceOneArgs {
                item_id: "local-one".into(),
                start: 4,
                end: 9,
                expected: "match".into(),
                replace_to: "done".into(),
            },
        )
        .unwrap();

        assert!(replaced);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "local-one").unwrap(),
            "前缀😀done tail"
        );
    }

    #[test]
    fn replace_one_treats_missing_type_as_local() {
        let state = temp_state("replace-one-missing-type");
        let manifest = Manifest {
            root: vec![json!({
                "id": "local-one",
                "title": "Local",
            })],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        entries::write_entry(&state.paths.entries_dir, "local-one", "foo local").unwrap();

        let replaced = replace_one_in_manifest(
            &state,
            FindReplaceOneArgs {
                item_id: "local-one".into(),
                start: 0,
                end: 3,
                expected: "foo".into(),
                replace_to: "bar".into(),
            },
        )
        .unwrap();

        assert!(replaced);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "local-one").unwrap(),
            "bar local"
        );
    }

    #[test]
    fn replace_one_skips_remote_items() {
        let state = temp_state("replace-one-remote");
        let manifest = Manifest {
            root: vec![json!({
                "id": "remote-one",
                "title": "Remote",
                "type": "remote",
            })],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        entries::write_entry(&state.paths.entries_dir, "remote-one", "foo remote").unwrap();

        let replaced = replace_one_in_manifest(
            &state,
            FindReplaceOneArgs {
                item_id: "remote-one".into(),
                start: 0,
                end: 3,
                expected: "foo".into(),
                replace_to: "bar".into(),
            },
        )
        .unwrap();

        assert!(!replaced);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "remote-one").unwrap(),
            "foo remote"
        );
    }

    #[test]
    fn replace_one_returns_false_when_expected_text_changed() {
        let state = temp_state("replace-one-stale");
        let manifest = Manifest {
            root: vec![json!({
                "id": "local-one",
                "title": "Local",
                "type": "local",
            })],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        entries::write_entry(&state.paths.entries_dir, "local-one", "foo local").unwrap();

        let replaced = replace_one_in_manifest(
            &state,
            FindReplaceOneArgs {
                item_id: "local-one".into(),
                start: 0,
                end: 3,
                expected: "bar".into(),
                replace_to: "baz".into(),
            },
        )
        .unwrap();

        assert!(!replaced);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "local-one").unwrap(),
            "foo local"
        );
    }

    #[test]
    fn replace_all_skips_remote_items() {
        let state = temp_state("replace-all-remote");
        let manifest = Manifest {
            root: vec![
                json!({
                    "id": "local-one",
                    "title": "Local",
                    "type": "local",
                }),
                json!({
                    "id": "remote-one",
                    "title": "Remote",
                    "type": "remote",
                }),
            ],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        entries::write_entry(&state.paths.entries_dir, "local-one", "foo local").unwrap();
        entries::write_entry(&state.paths.entries_dir, "remote-one", "foo remote").unwrap();

        let outcome =
            replace_all_in_manifest(&state, "foo", &FindOptions::default(), "bar").unwrap();

        assert_eq!(outcome.item_ids, vec!["local-one"]);
        assert_eq!(outcome.replaced_count, 1);
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "local-one").unwrap(),
            "bar local"
        );
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "remote-one").unwrap(),
            "foo remote"
        );
    }

    #[test]
    fn replace_all_reports_local_read_errors() {
        let state = temp_state("replace-all-read-error");
        let manifest = Manifest {
            root: vec![json!({
                "id": "bad/id",
                "title": "Bad",
                "type": "local",
            })],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();

        let error = replace_all_in_manifest(&state, "foo", &FindOptions::default(), "bar")
            .expect_err("invalid local entry id should fail replace all");

        assert!(error.contains("bad/id"));
    }

    #[test]
    fn replace_all_does_not_write_before_read_preflight_succeeds() {
        let state = temp_state("replace-all-read-error-preflight");
        let manifest = Manifest {
            root: vec![
                json!({
                    "id": "local-one",
                    "title": "Local",
                    "type": "local",
                }),
                json!({
                    "id": "bad/id",
                    "title": "Bad",
                    "type": "local",
                }),
            ],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        entries::write_entry(&state.paths.entries_dir, "local-one", "foo local").unwrap();

        let error = replace_all_in_manifest(&state, "foo", &FindOptions::default(), "bar")
            .expect_err("invalid later local entry id should fail replace all");

        assert!(error.contains("bad/id"));
        assert_eq!(
            entries::read_entry(&state.paths.entries_dir, "local-one").unwrap(),
            "foo local"
        );
    }

    #[test]
    fn find_offsets_match_lf_view_when_disk_has_crlf() {
        // Regression for plan.md §1: a v4-migrated or hand-written
        // entry file may still hold CRLF on disk. The renderer feeds
        // CodeMirror an LF-normalized view, so find_in_manifest must
        // report UTF-16 offsets against that same view — otherwise
        // selections drift by one column per preceding CRLF.
        let state = temp_state("find-crlf");
        let manifest = Manifest {
            root: vec![json!({
                "id": "local-one",
                "title": "Local",
                "type": "local",
            })],
            ..Manifest::default()
        };
        manifest.save(&state.paths).unwrap();
        // Bypass write_entry so the on-disk bytes really are CRLF; we
        // want to exercise read_entry's normalization on the read path.
        let path = entries::entry_path(&state.paths.entries_dir, "local-one").unwrap();
        std::fs::write(&path, b"foo\r\nbar\r\nbaz").unwrap();

        let result = find_in_manifest(&state, "bar", &FindOptions::default()).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].positions.len(), 1);
        let p = &result[0].positions[0];
        // LF view: "foo\n" is 4 UTF-16 units. With raw CRLF the offset
        // would be 5 and the renderer's selection would be off by one.
        assert_eq!(p.start, 4);
        assert_eq!(p.end, 7);
        assert_eq!(p.line, 2);
        assert_eq!(p.line_pos, 0);
    }
}
