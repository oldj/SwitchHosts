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

use crate::storage::{
    atomic::atomic_write, entries, error::StorageError, manifest::Manifest, AppState,
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
        if let Some(id) = self.listener_id.lock().expect("find listener mutex poisoned").take() {
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
pub struct FindSplitter {
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
    pub positions: Vec<FindPosition>,
    pub splitters: Vec<FindSplitter>,
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
        let (positions, byte_spans) = find_positions_in_content(&content, &regex);
        if positions.is_empty() {
            return;
        }
        let splitters = split_content(&content, &byte_spans);
        out.push(FindItem {
            item_id: id.to_string(),
            item_title: title.to_string(),
            item_type: kind.to_string(),
            positions,
            splitters,
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
/// Returns `(positions, byte_spans)`. `byte_spans` carries the raw
/// `(start, end)` byte offsets per match so `split_content` can slice
/// the original `content` correctly — the public `FindPosition.start /
/// end` fields are UTF-16 offsets and would mis-slice on non-ASCII.
fn find_positions_in_content(
    content: &str,
    regex: &Regex,
) -> (Vec<FindPosition>, Vec<(usize, usize)>) {
    let mut positions = Vec::new();
    let mut byte_spans = Vec::new();
    for mat in regex.find_iter(content) {
        let start = mat.start();
        let end = mat.end();
        let match_text = mat.as_str().to_string();

        let prefix = &content[..start];
        let line = prefix.matches('\n').count() + 1;
        let last_nl_before = prefix.rfind('\n').map(|i| i + 1).unwrap_or(0);
        let before = content[last_nl_before..start].to_string();

        let match_lines = match_text.split('\n').count();
        let end_line = line + match_lines - 1;

        let after_start = end;
        let next_nl = content[after_start..]
            .find('\n')
            .map(|i| after_start + i)
            .unwrap_or(content.len());
        let after = content[after_start..next_nl].to_string();

        // CodeMirror counts offsets in UTF-16 code units (== JS string
        // length); the regex crate returns UTF-8 byte offsets. Convert
        // every outgoing offset / position so non-ASCII content (CJK,
        // emoji) doesn't skew the find-window jump or the result list's
        // column display.
        let start_u16 = content[..start].encode_utf16().count();
        let match_u16 = match_text.encode_utf16().count();
        let end_u16 = start_u16 + match_u16;
        let line_pos = before.encode_utf16().count();
        let end_line_pos = if match_lines > 1 {
            match_text
                .rsplit('\n')
                .next()
                .unwrap_or("")
                .encode_utf16()
                .count()
        } else {
            line_pos + match_u16
        };

        positions.push(FindPosition {
            start: start_u16,
            end: end_u16,
            line,
            line_pos,
            end_line,
            end_line_pos,
            before,
            match_text,
            after,
        });
        byte_spans.push((start, end));
    }
    (positions, byte_spans)
}

/// Mirror of `src/main/actions/find/splitContent.ts`. Slices the
/// content into `[before-of-match-1] [match-1] [before-of-match-2]
/// [match-2] ... [last-after]` so the renderer can render the
/// result with the matched substrings highlighted. `byte_spans` are
/// raw byte offsets into `content` (not the UTF-16 offsets carried in
/// `FindPosition`) so the slicing stays valid for non-ASCII text.
fn split_content(content: &str, byte_spans: &[(usize, usize)]) -> Vec<FindSplitter> {
    let mut splitters = Vec::with_capacity(byte_spans.len());
    let mut last_end = 0;
    for (idx, &(start, end)) in byte_spans.iter().enumerate() {
        let before = content[last_end..start].to_string();
        let match_text = content[start..end].to_string();
        last_end = end;
        let after = if idx == byte_spans.len() - 1 {
            content[last_end..].to_string()
        } else {
            String::new()
        };
        splitters.push(FindSplitter {
            before,
            match_text,
            after,
        });
    }
    splitters
}

fn walk_searchable<F: FnMut(&str, &str, &str)>(nodes: &[Value], visit: &mut F) {
    for node in nodes {
        let kind = node
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("local");
        if kind != "group" && kind != "folder" {
            if let Some(id) = node.get("id").and_then(Value::as_str) {
                let title = node
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("");
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

pub fn set_find_history(
    state: &AppState,
    items: &[FindHistoryEntry],
) -> Result<(), StorageError> {
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

pub fn add_replace_history(
    state: &AppState,
    value: String,
) -> Result<Vec<String>, StorageError> {
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
    let bytes = std::fs::read(path)
        .map_err(|e| StorageError::io(path.display().to_string(), e))?;
    serde_json::from_slice::<Vec<T>>(&bytes).or_else(|_| {
        // Tolerate slight schema drift: anything that doesn't decode
        // as the expected list shape resets to empty rather than
        // crashing the find window.
        log::warn!(
            "{} could not be parsed; treating as empty.",
            path.display()
        );
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
    if let Some(id) = listener_id.lock().expect("find listener mutex poisoned").take() {
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

fn create_find_window<R: Runtime + 'static>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let url = WebviewUrl::App("#/find".into());
    let configured_theme = configured_theme(app.state::<AppState>().inner());
    let initial_theme = configured_theme.unwrap_or(Theme::Light);
    let builder = WebviewWindowBuilder::new(app, FIND_WINDOW_LABEL, url)
        .title("Find")
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

    Ok(window)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn re(pattern: &str) -> Regex {
        Regex::new(pattern).unwrap()
    }

    #[test]
    fn positions_are_utf16_for_non_ascii_prefix() {
        // "前缀" is 6 bytes / 2 UTF-16 units; "😀" is 4 bytes / 2 UTF-16
        // units (surrogate pair). The byte offset of "match" is 10 but
        // CodeMirror sees it at UTF-16 index 4.
        let content = "前缀😀match";
        let (positions, spans) = find_positions_in_content(content, &re("match"));
        assert_eq!(positions.len(), 1);
        let p = &positions[0];
        assert_eq!(p.start, 4);
        assert_eq!(p.end, 9);
        assert_eq!(p.line_pos, 4);
        assert_eq!(p.end_line_pos, 9);
        assert_eq!(p.match_text, "match");
        assert_eq!(spans, vec![(10, 15)]);
    }

    #[test]
    fn line_pos_resets_on_each_line() {
        let content = "abc\n中文 abc";
        let (positions, _) = find_positions_in_content(content, &re("abc"));
        assert_eq!(positions.len(), 2);
        assert_eq!(positions[0].line, 1);
        assert_eq!(positions[0].line_pos, 0);
        assert_eq!(positions[1].line, 2);
        // "中文 " is 3 UTF-16 units before the second "abc"
        assert_eq!(positions[1].line_pos, 3);
    }

    #[test]
    fn split_content_round_trips_with_byte_spans() {
        // The splitter stream concatenated back must equal the source,
        // proving byte-span slicing stayed correct after the UTF-16
        // refactor.
        let content = "前 abc 缀 abc 尾";
        let (_, spans) = find_positions_in_content(content, &re("abc"));
        let splitters = split_content(content, &spans);
        let joined: String = splitters
            .iter()
            .map(|s| format!("{}{}{}", s.before, s.match_text, s.after))
            .collect();
        assert_eq!(joined, content);
    }
}
