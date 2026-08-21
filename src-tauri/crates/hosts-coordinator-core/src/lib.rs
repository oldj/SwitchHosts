use encoding_rs::GBK;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub const PROTOCOL_VERSION: u32 = 1;
pub const PROTOCOL_SOURCE_ID: &str = "cfmind-hosts-v1-simple-20260821";
pub const OWNER_LOCAL_AGENT: &str = "easyclaw.local-agent";
pub const OWNER_ENVIRONMENT: &str = "easyclaw.environment";
pub const SWITCHHOSTS_MARKER: &str = "# --- SWITCHHOSTS_CONTENT_START ---";

const BLOCK_START_PREFIX: &str = "# >>> CFMIND-HOSTS v1 owner=";
const BLOCK_END_PREFIX: &str = "# <<< CFMIND-HOSTS v1 owner=";
const META_PREFIX: &str = "# cfmind-meta: ";
const SHADOW_PREFIX: &str = "# cfmind-shadowed-by=";
const LEGACY_START: &str = "# BEGIN EasyClaw Gateway";
const LEGACY_END: &str = "# END EasyClaw Gateway";
const LEGACY_DISABLED: &str = "# EasyClaw Gateway disabled: ";
const MUTEX_NAME: &str = "Global\\CFMind.HostsCoordinator.v1";
const HISTORY_LIMIT: usize = 50;

#[derive(Debug, Error)]
pub enum CoordinatorError {
    #[error("I/O error at {path}: {reason}")]
    Io { path: String, reason: String },
    #[error("invalid hosts encoding: {0}")]
    Encoding(String),
    #[error("invalid managed hosts structure: {0}")]
    InvalidStructure(String),
    #[error("hosts conflict: {0}")]
    Conflict(String),
    #[error("concurrent edit conflict: {0}")]
    ConcurrentEdit(String),
    #[error("administrator permission is required: {0}")]
    PermissionDenied(String),
    #[error("invalid coordinator request: {0}")]
    InvalidIntent(String),
    #[error("history error: {0}")]
    History(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostsEncoding {
    Utf8,
    Utf8Bom,
    Gbk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HostsIntentV1 {
    UpsertOwner {
        owner: String,
        content: String,
        writer: String,
        profile: Option<String>,
    },
    RemoveOwner {
        owner: String,
        writer: String,
    },
    EditUnmanaged {
        unmanaged_content: String,
        environment_content: Option<String>,
        expected_unmanaged_sha256: String,
        expected_environment_sha256: String,
        writer: String,
    },
    ApplySwitchHosts {
        content: String,
        write_mode: String,
        writer: String,
    },
    RestoreSnapshot {
        snapshot_sha256: String,
        writer: String,
    },
}

impl HostsIntentV1 {
    pub fn writer(&self) -> &str {
        match self {
            Self::UpsertOwner { writer, .. }
            | Self::RemoveOwner { writer, .. }
            | Self::EditUnmanaged { writer, .. }
            | Self::ApplySwitchHosts { writer, .. }
            | Self::RestoreSnapshot { writer, .. } => writer,
        }
    }

    pub fn action(&self) -> &'static str {
        match self {
            Self::UpsertOwner { .. } => "upsert_owner",
            Self::RemoveOwner { .. } => "remove_owner",
            Self::EditUnmanaged { .. } => "edit_unmanaged",
            Self::ApplySwitchHosts { .. } => "apply_switchhosts",
            Self::RestoreSnapshot { .. } => "restore_snapshot",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResultV1 {
    pub success: bool,
    pub changed: bool,
    pub revision: String,
    pub warnings: Vec<String>,
    pub shadowed: Vec<String>,
    pub conflicts: Vec<String>,
    pub history_id: Option<String>,
    pub old_content: String,
    pub new_content: String,
    pub encoding: HostsEncoding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntryV1 {
    pub id: String,
    pub timestamp_ms: u128,
    pub writer: String,
    pub action: String,
    pub sha256: String,
    pub previous_sha256: Option<String>,
    pub encoding: HostsEncoding,
    pub size: usize,
}

#[derive(Debug, Clone)]
pub struct HostsInspection {
    pub encoding: HostsEncoding,
    pub unmanaged_content: String,
    pub unmanaged_sha256: String,
    pub environment_content: Option<String>,
    pub environment_sha256: String,
    pub local_agent_enabled: bool,
    pub local_agent_content: Option<String>,
    pub switchhosts_content: Option<String>,
    pub switchhosts_sha256: String,
}

#[derive(Debug, Clone)]
struct OwnerBlock {
    content: String,
}

#[derive(Debug, Clone)]
struct Document {
    blocks: BTreeMap<String, OwnerBlock>,
    unmanaged: String,
    switchhosts: Option<String>,
}

#[derive(Debug)]
struct DecodedHosts {
    text: String,
    encoding: HostsEncoding,
    eol: &'static str,
}

#[derive(Debug)]
struct TransformOutcome {
    bytes: Vec<u8>,
    text: String,
    encoding: HostsEncoding,
    shadowed: Vec<String>,
    warnings: Vec<String>,
}

pub fn shared_state_dir() -> PathBuf {
    std::env::var_os("ProgramData")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"))
        .join("CFMind")
        .join("HostsCoordinator")
        .join("v1")
}

pub fn decode_fragment(bytes: &[u8]) -> Result<String, CoordinatorError> {
    Ok(decode_hosts(bytes)?.text)
}

pub fn inspect_bytes(bytes: &[u8]) -> Result<HostsInspection, CoordinatorError> {
    let decoded = decode_hosts(bytes)?;
    let document = parse_document(&decoded.text)?;
    let environment_content = document
        .blocks
        .get(OWNER_ENVIRONMENT)
        .map(|block| block.content.clone());
    let local_agent_content = document
        .blocks
        .get(OWNER_LOCAL_AGENT)
        .map(|block| block.content.clone());
    let switchhosts_content = document.switchhosts;
    Ok(HostsInspection {
        encoding: decoded.encoding,
        unmanaged_sha256: sha256_text(&document.unmanaged),
        environment_sha256: sha256_text(environment_content.as_deref().unwrap_or("")),
        unmanaged_content: document.unmanaged,
        environment_content,
        local_agent_enabled: local_agent_content.is_some(),
        local_agent_content,
        switchhosts_sha256: sha256_text(switchhosts_content.as_deref().unwrap_or("")),
        switchhosts_content,
    })
}

pub fn inspect_path(path: &Path) -> Result<HostsInspection, CoordinatorError> {
    let bytes = read_or_empty(path)?;
    inspect_bytes(&bytes)
}

pub fn extract_owner(bytes: &[u8], owner: &str) -> Result<Option<String>, CoordinatorError> {
    let decoded = decode_hosts(bytes)?;
    let document = parse_document(&decoded.text)?;
    Ok(document
        .blocks
        .get(owner)
        .map(|block| block.content.clone()))
}

pub fn transform_bytes(
    current: &[u8],
    intent: &HostsIntentV1,
) -> Result<ApplyResultV1, CoordinatorError> {
    let outcome = transform(current, intent, None)?;
    let old_decoded = decode_hosts(current)?;
    let changed = current != outcome.bytes;
    Ok(ApplyResultV1 {
        success: true,
        changed,
        revision: sha256_bytes(&outcome.bytes),
        warnings: outcome.warnings,
        shadowed: outcome.shadowed,
        conflicts: Vec::new(),
        history_id: None,
        old_content: old_decoded.text,
        new_content: outcome.text,
        encoding: outcome.encoding,
    })
}

pub fn execute_transaction(
    target: &Path,
    state_dir: &Path,
    intent: &HostsIntentV1,
) -> Result<ApplyResultV1, CoordinatorError> {
    let _guard = GlobalHostsMutex::acquire()?;
    let current = read_or_empty(target)?;
    let restore_bytes = match intent {
        HostsIntentV1::RestoreSnapshot {
            snapshot_sha256, ..
        } => Some(load_snapshot(state_dir, snapshot_sha256)?),
        _ => None,
    };
    let outcome = transform(&current, intent, restore_bytes.as_deref())?;
    let before_sha = sha256_bytes(&current);
    let after_sha = sha256_bytes(&outcome.bytes);
    let old_decoded = decode_hosts(&current)?;

    if before_sha == after_sha {
        return Ok(ApplyResultV1 {
            success: true,
            changed: false,
            revision: after_sha,
            warnings: outcome.warnings,
            shadowed: outcome.shadowed,
            conflicts: Vec::new(),
            history_id: None,
            old_content: old_decoded.text,
            new_content: outcome.text,
            encoding: outcome.encoding,
        });
    }

    ensure_snapshot(state_dir, &before_sha, &current)?;
    let mut history = load_history(state_dir)?;
    append_history_if_missing(
        &mut history,
        intent.writer(),
        "before_change",
        &before_sha,
        None,
        old_decoded.encoding,
        current.len(),
    );

    if let Err(error) = replace_file_atomic(target, &outcome.bytes) {
        return Err(map_write_error(target, error));
    }
    let verified = match read_or_empty(target) {
        Ok(bytes) => bytes,
        Err(error) => {
            let _ = replace_file_atomic(target, &current);
            return Err(error);
        }
    };
    if sha256_bytes(&verified) != after_sha {
        let _ = replace_file_atomic(target, &current);
        return Err(CoordinatorError::Io {
            path: target.display().to_string(),
            reason: "write verification failed; original content was restored".to_string(),
        });
    }

    if let Err(error) = ensure_snapshot(state_dir, &after_sha, &outcome.bytes) {
        let _ = replace_file_atomic(target, &current);
        return Err(error);
    }
    let history_id = append_history_if_missing(
        &mut history,
        intent.writer(),
        intent.action(),
        &after_sha,
        Some(before_sha),
        outcome.encoding,
        outcome.bytes.len(),
    );
    if let Err(error) = trim_history_and_snapshots(state_dir, &mut history) {
        let _ = replace_file_atomic(target, &current);
        return Err(error);
    }
    if let Err(error) = save_history(state_dir, &history) {
        let _ = replace_file_atomic(target, &current);
        return Err(error);
    }

    Ok(ApplyResultV1 {
        success: true,
        changed: true,
        revision: after_sha,
        warnings: outcome.warnings,
        shadowed: outcome.shadowed,
        conflicts: Vec::new(),
        history_id: Some(history_id),
        old_content: old_decoded.text,
        new_content: outcome.text,
        encoding: outcome.encoding,
    })
}

pub fn load_shared_history(state_dir: &Path) -> Result<Vec<HistoryEntryV1>, CoordinatorError> {
    load_history(state_dir)
}

pub fn load_shared_snapshot(state_dir: &Path, sha256: &str) -> Result<Vec<u8>, CoordinatorError> {
    load_snapshot(state_dir, sha256)
}

pub fn delete_shared_history_entry(state_dir: &Path, id: &str) -> Result<bool, CoordinatorError> {
    let _guard = GlobalHostsMutex::acquire()?;
    let mut history = load_history(state_dir)?;
    let before = history.len();
    history.retain(|entry| entry.id != id);
    if history.len() == before {
        return Ok(false);
    }
    trim_history_and_snapshots(state_dir, &mut history)?;
    save_history(state_dir, &history)?;
    Ok(true)
}

/// Imports a legacy history payload without touching the system Hosts file.
/// Identical payloads are de-duplicated by SHA-256 and the shared journal is
/// always trimmed to the protocol-wide history limit.
pub fn import_shared_snapshot(
    state_dir: &Path,
    bytes: &[u8],
    writer: &str,
    action: &str,
) -> Result<Option<String>, CoordinatorError> {
    let decoded = decode_hosts(bytes)?;
    parse_document(&decoded.text)?;
    let sha256 = sha256_bytes(bytes);
    let _guard = GlobalHostsMutex::acquire()?;
    let mut history = load_history(state_dir)?;
    if history.iter().any(|entry| entry.sha256 == sha256) {
        return Ok(None);
    }
    ensure_snapshot(state_dir, &sha256, bytes)?;
    let id = append_history_if_missing(
        &mut history,
        writer,
        action,
        &sha256,
        None,
        decoded.encoding,
        bytes.len(),
    );
    trim_history_and_snapshots(state_dir, &mut history)?;
    save_history(state_dir, &history)?;
    Ok(Some(id))
}

fn transform(
    current: &[u8],
    intent: &HostsIntentV1,
    restore_bytes: Option<&[u8]>,
) -> Result<TransformOutcome, CoordinatorError> {
    if let Some(bytes) = restore_bytes {
        let decoded = decode_hosts(bytes)?;
        parse_document(&decoded.text)?;
        return Ok(TransformOutcome {
            bytes: bytes.to_vec(),
            text: decoded.text,
            encoding: decoded.encoding,
            shadowed: Vec::new(),
            warnings: vec!["restored a complete system hosts snapshot".to_string()],
        });
    }

    let decoded = decode_hosts(current)?;
    let mut document = parse_document(&decoded.text)?;
    let mut warnings = Vec::new();

    match intent {
        HostsIntentV1::UpsertOwner { owner, content, .. } => {
            validate_owner(owner)?;
            validate_managed_content(content)?;
            if owner == OWNER_LOCAL_AGENT
                && remove_exact_legacy_local_mapping(&mut document.unmanaged, content)
            {
                warnings.push("adopted a legacy standalone local-agent mapping".to_string());
            }
            if owner == OWNER_ENVIRONMENT
                && !content.trim().is_empty()
                && normalize_lf(&document.unmanaged).trim_matches('\n')
                    == normalize_lf(content).trim_matches('\n')
            {
                document.unmanaged.clear();
                warnings.push("adopted an exact legacy EasyClaw environment profile".to_string());
            }
            document.blocks.insert(
                owner.clone(),
                OwnerBlock {
                    content: normalize_lf(content).trim_matches('\n').to_string(),
                },
            );
        }
        HostsIntentV1::RemoveOwner { owner, .. } => {
            validate_owner(owner)?;
            document.blocks.remove(owner);
        }
        HostsIntentV1::EditUnmanaged {
            unmanaged_content,
            environment_content,
            expected_unmanaged_sha256,
            expected_environment_sha256,
            ..
        } => {
            let current_unmanaged = sha256_text(&document.unmanaged);
            let current_environment = sha256_text(
                document
                    .blocks
                    .get(OWNER_ENVIRONMENT)
                    .map(|block| block.content.as_str())
                    .unwrap_or(""),
            );
            if &current_unmanaged != expected_unmanaged_sha256
                || &current_environment != expected_environment_sha256
            {
                return Err(CoordinatorError::ConcurrentEdit(
                    "ordinary or EasyClaw environment content changed after the editor loaded"
                        .to_string(),
                ));
            }
            validate_managed_content(unmanaged_content)?;
            document.unmanaged = normalize_lf(unmanaged_content)
                .trim_matches('\n')
                .to_string();
            match environment_content {
                Some(content) if !content.trim().is_empty() => {
                    validate_managed_content(content)?;
                    document.blocks.insert(
                        OWNER_ENVIRONMENT.to_string(),
                        OwnerBlock {
                            content: normalize_lf(content).trim_matches('\n').to_string(),
                        },
                    );
                }
                _ => {
                    document.blocks.remove(OWNER_ENVIRONMENT);
                }
            }
        }
        HostsIntentV1::ApplySwitchHosts {
            content,
            write_mode,
            ..
        } => {
            validate_managed_content(content)?;
            match write_mode.as_str() {
                "append" | "" => {}
                "overwrite" => document.unmanaged.clear(),
                other => {
                    return Err(CoordinatorError::InvalidIntent(format!(
                        "unknown SwitchHosts write mode: {other}"
                    )))
                }
            }
            document.switchhosts = Some(normalize_lf(content).trim_matches('\n').to_string());
        }
        HostsIntentV1::RestoreSnapshot { .. } => {
            return Err(CoordinatorError::InvalidIntent(
                "restore intent requires a snapshot payload".to_string(),
            ));
        }
    }

    if decoded.text.contains(LEGACY_START) {
        warnings.push("migrated the legacy EasyClaw Gateway block".to_string());
    }
    let (rendered_lf, shadowed) = compose_document(&document)?;
    let rendered = if decoded.eol == "\r\n" {
        rendered_lf.replace('\n', "\r\n")
    } else {
        rendered_lf
    };
    #[cfg(target_os = "windows")]
    let output_encoding = HostsEncoding::Gbk;
    #[cfg(not(target_os = "windows"))]
    let output_encoding = decoded.encoding;
    let bytes = encode_hosts(&rendered, output_encoding)?;
    Ok(TransformOutcome {
        bytes,
        text: rendered,
        encoding: output_encoding,
        shadowed,
        warnings,
    })
}

fn remove_exact_legacy_local_mapping(unmanaged: &mut String, local_content: &str) -> bool {
    let active_local = normalize_lf(local_content)
        .lines()
        .filter_map(parse_active_record)
        .collect::<Vec<_>>();
    if active_local.len() != 1 || active_local[0].1.len() != 1 {
        return false;
    }
    let (expected_ip, expected_domains) = &active_local[0];
    let expected_domain = &expected_domains[0];
    let mut removed = false;
    let kept = normalize_lf(unmanaged)
        .lines()
        .filter(|line| {
            let is_exact = parse_active_record(line).is_some_and(|(ip, domains)| {
                ip == *expected_ip
                    && domains.len() == 1
                    && domains[0].eq_ignore_ascii_case(expected_domain)
            });
            if is_exact && !removed {
                removed = true;
                false
            } else {
                true
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    if removed {
        *unmanaged = kept.trim_matches('\n').to_string();
    }
    removed
}

fn parse_document(text: &str) -> Result<Document, CoordinatorError> {
    let restored = restore_shadow_lines(&normalize_lf(text));
    let lines: Vec<&str> = restored.split('\n').collect();
    let mut blocks = BTreeMap::<String, OwnerBlock>::new();
    let mut outside = Vec::<String>::new();
    let mut index = 0usize;

    while index < lines.len() {
        let line = lines[index];
        if let Some(owner) = line.trim().strip_prefix(BLOCK_START_PREFIX) {
            validate_owner(owner)?;
            if blocks.contains_key(owner) {
                return Err(CoordinatorError::InvalidStructure(format!(
                    "duplicate managed owner block: {owner}"
                )));
            }
            let expected_end = format!("{BLOCK_END_PREFIX}{owner}");
            index += 1;
            let mut content = Vec::new();
            let mut closed = false;
            while index < lines.len() {
                let nested = lines[index].trim();
                if nested.starts_with(BLOCK_START_PREFIX) {
                    return Err(CoordinatorError::InvalidStructure(format!(
                        "nested managed block inside {owner}"
                    )));
                }
                if nested == expected_end {
                    closed = true;
                    break;
                }
                if nested.starts_with(BLOCK_END_PREFIX) {
                    return Err(CoordinatorError::InvalidStructure(format!(
                        "mismatched end marker inside {owner}: {nested}"
                    )));
                }
                if let Some(json) = nested.strip_prefix(META_PREFIX) {
                    let _ = json;
                } else {
                    content.push(lines[index].to_string());
                }
                index += 1;
            }
            if !closed {
                return Err(CoordinatorError::InvalidStructure(format!(
                    "missing end marker for {owner}"
                )));
            }
            blocks.insert(
                owner.to_string(),
                OwnerBlock {
                    content: content.join("\n").trim_matches('\n').to_string(),
                },
            );
        } else if line.trim() == LEGACY_START {
            if blocks.contains_key(OWNER_LOCAL_AGENT) {
                return Err(CoordinatorError::InvalidStructure(
                    "both legacy and v1 local-agent blocks exist".to_string(),
                ));
            }
            index += 1;
            let mut content = Vec::new();
            let mut closed = false;
            while index < lines.len() {
                if lines[index].trim() == LEGACY_END {
                    closed = true;
                    break;
                }
                content.push(lines[index].to_string());
                index += 1;
            }
            if !closed {
                return Err(CoordinatorError::InvalidStructure(
                    "legacy EasyClaw block has no end marker".to_string(),
                ));
            }
            blocks.insert(
                OWNER_LOCAL_AGENT.to_string(),
                OwnerBlock {
                    content: content.join("\n").trim_matches('\n').to_string(),
                },
            );
        } else if line.trim().starts_with(BLOCK_END_PREFIX) {
            return Err(CoordinatorError::InvalidStructure(format!(
                "orphan managed end marker: {}",
                line.trim()
            )));
        } else {
            outside.push(line.to_string());
        }
        index += 1;
    }

    let marker_indices: Vec<usize> = outside
        .iter()
        .enumerate()
        .filter_map(|(index, line)| (line.trim() == SWITCHHOSTS_MARKER).then_some(index))
        .collect();
    if marker_indices.len() > 1 {
        return Err(CoordinatorError::InvalidStructure(
            "multiple SwitchHosts content markers".to_string(),
        ));
    }
    let (unmanaged_lines, switchhosts) = match marker_indices.first().copied() {
        Some(marker) => (
            outside[..marker].to_vec(),
            Some(
                outside[marker + 1..]
                    .join("\n")
                    .trim_matches('\n')
                    .to_string(),
            ),
        ),
        None => (outside, None),
    };

    Ok(Document {
        blocks,
        unmanaged: unmanaged_lines.join("\n").trim_matches('\n').to_string(),
        switchhosts,
    })
}

fn compose_document(document: &Document) -> Result<(String, Vec<String>), CoordinatorError> {
    let mut output_sections = Vec::<String>::new();

    for owner in [OWNER_LOCAL_AGENT, OWNER_ENVIRONMENT] {
        if let Some(block) = document.blocks.get(owner) {
            output_sections.push(render_block(owner, &block.content));
        }
    }
    for (owner, block) in &document.blocks {
        if owner != OWNER_LOCAL_AGENT && owner != OWNER_ENVIRONMENT {
            output_sections.push(render_block(owner, &block.content));
        }
    }
    if !document.unmanaged.trim().is_empty() {
        output_sections.push(document.unmanaged.trim_matches('\n').to_string());
    }
    if let Some(content) = &document.switchhosts {
        let switch_section = if content.trim().is_empty() {
            SWITCHHOSTS_MARKER.to_string()
        } else {
            format!("{SWITCHHOSTS_MARKER}\n\n{}", content.trim_matches('\n'))
        };
        output_sections.push(switch_section);
    }

    let mut output = output_sections
        .into_iter()
        .filter(|section| !section.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if !output.is_empty() {
        output.push('\n');
    }
    Ok((output, Vec::new()))
}

fn render_block(owner: &str, content: &str) -> String {
    let mut lines = vec![format!("{BLOCK_START_PREFIX}{owner}")];
    if !content.trim().is_empty() {
        lines.push(content.trim_matches('\n').to_string());
    }
    lines.push(format!("{BLOCK_END_PREFIX}{owner}"));
    lines.join("\n")
}

fn parse_active_record(line: &str) -> Option<(IpAddr, Vec<String>)> {
    let active = line.split('#').next()?.trim();
    if active.is_empty() {
        return None;
    }
    let mut fields = active.split_whitespace();
    let ip = fields.next()?.parse::<IpAddr>().ok()?;
    let domains = fields
        .filter(|field| !field.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    (!domains.is_empty()).then_some((ip, domains))
}

fn restore_shadow_lines(text: &str) -> String {
    text.split('\n')
        .map(|line| {
            let trimmed = line.trim_start();
            if trimmed.starts_with(SHADOW_PREFIX) {
                return trimmed
                    .split_once(" | ")
                    .map(|(_, original)| original.to_string())
                    .unwrap_or_else(|| line.to_string());
            }
            if let Some(original) = trimmed.strip_prefix(LEGACY_DISABLED) {
                return original.to_string();
            }
            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn validate_owner(owner: &str) -> Result<(), CoordinatorError> {
    if owner.is_empty()
        || !owner
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return Err(CoordinatorError::InvalidIntent(format!(
            "invalid owner id: {owner}"
        )));
    }
    Ok(())
}

fn validate_managed_content(content: &str) -> Result<(), CoordinatorError> {
    if content.lines().any(|line| {
        let trimmed = line.trim();
        trimmed.starts_with(BLOCK_START_PREFIX)
            || trimmed.starts_with(BLOCK_END_PREFIX)
            || trimmed == SWITCHHOSTS_MARKER
    }) {
        return Err(CoordinatorError::InvalidIntent(
            "content contains coordinator marker lines".to_string(),
        ));
    }
    Ok(())
}

fn decode_hosts(bytes: &[u8]) -> Result<DecodedHosts, CoordinatorError> {
    let (text, encoding) = if let Some(rest) = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
        (
            std::str::from_utf8(rest)
                .map_err(|error| CoordinatorError::Encoding(error.to_string()))?
                .to_string(),
            HostsEncoding::Utf8Bom,
        )
    } else if let Ok(text) = std::str::from_utf8(bytes) {
        (text.to_string(), HostsEncoding::Utf8)
    } else {
        let (decoded, _, had_errors) = GBK.decode(bytes);
        if had_errors {
            return Err(CoordinatorError::Encoding(
                "content is neither valid UTF-8 nor valid GBK/CP936".to_string(),
            ));
        }
        (decoded.into_owned(), HostsEncoding::Gbk)
    };
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count();
    let eol = if crlf > 0 && crlf * 2 >= lf {
        "\r\n"
    } else {
        "\n"
    };
    Ok(DecodedHosts {
        text,
        encoding,
        eol,
    })
}

fn encode_hosts(text: &str, encoding: HostsEncoding) -> Result<Vec<u8>, CoordinatorError> {
    match encoding {
        HostsEncoding::Utf8 => Ok(text.as_bytes().to_vec()),
        HostsEncoding::Utf8Bom => {
            let mut bytes = vec![0xef, 0xbb, 0xbf];
            bytes.extend_from_slice(text.as_bytes());
            Ok(bytes)
        }
        HostsEncoding::Gbk => {
            let (encoded, _, had_errors) = GBK.encode(text);
            if had_errors {
                return Err(CoordinatorError::Encoding(
                    "updated content contains characters that GBK cannot encode".to_string(),
                ));
            }
            Ok(encoded.into_owned())
        }
    }
}

fn normalize_lf(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn sha256_text(value: &str) -> String {
    sha256_bytes(normalize_lf(value).as_bytes())
}

pub fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn read_or_empty(path: &Path) -> Result<Vec<u8>, CoordinatorError> {
    match fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(CoordinatorError::Io {
            path: path.display().to_string(),
            reason: error.to_string(),
        }),
    }
}

fn map_write_error(path: &Path, error: std::io::Error) -> CoordinatorError {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        CoordinatorError::PermissionDenied(path.display().to_string())
    } else {
        CoordinatorError::Io {
            path: path.display().to_string(),
            reason: error.to_string(),
        }
    }
}

fn history_path(state_dir: &Path) -> PathBuf {
    state_dir.join("history").join("index.json")
}

fn snapshots_dir(state_dir: &Path) -> PathBuf {
    state_dir.join("history").join("snapshots")
}

fn ensure_snapshot(state_dir: &Path, sha256: &str, content: &[u8]) -> Result<(), CoordinatorError> {
    let dir = snapshots_dir(state_dir);
    fs::create_dir_all(&dir).map_err(|error| CoordinatorError::History(error.to_string()))?;
    let path = dir.join(format!("{sha256}.hosts"));
    if path.is_file() {
        return Ok(());
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| CoordinatorError::History(error.to_string()))?;
    file.write_all(content)
        .and_then(|_| file.sync_all())
        .map_err(|error| CoordinatorError::History(error.to_string()))
}

fn load_snapshot(state_dir: &Path, sha256: &str) -> Result<Vec<u8>, CoordinatorError> {
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(CoordinatorError::InvalidIntent(
            "snapshot SHA-256 is invalid".to_string(),
        ));
    }
    let path = snapshots_dir(state_dir).join(format!("{sha256}.hosts"));
    let bytes = fs::read(&path).map_err(|error| CoordinatorError::History(error.to_string()))?;
    if sha256_bytes(&bytes) != sha256.to_ascii_lowercase() {
        return Err(CoordinatorError::History(format!(
            "snapshot checksum mismatch: {}",
            path.display()
        )));
    }
    Ok(bytes)
}

fn load_history(state_dir: &Path) -> Result<Vec<HistoryEntryV1>, CoordinatorError> {
    let path = history_path(state_dir);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path).map_err(|error| CoordinatorError::History(error.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|error| CoordinatorError::History(error.to_string()))
}

fn save_history(state_dir: &Path, history: &[HistoryEntryV1]) -> Result<(), CoordinatorError> {
    let path = history_path(state_dir);
    let parent = path
        .parent()
        .ok_or_else(|| CoordinatorError::History("history path has no parent".to_string()))?;
    fs::create_dir_all(parent).map_err(|error| CoordinatorError::History(error.to_string()))?;
    let bytes = serde_json::to_vec_pretty(history)
        .map_err(|error| CoordinatorError::History(error.to_string()))?;
    replace_file_atomic(&path, &bytes).map_err(|error| CoordinatorError::History(error.to_string()))
}

fn append_history_if_missing(
    history: &mut Vec<HistoryEntryV1>,
    writer: &str,
    action: &str,
    sha256: &str,
    previous_sha256: Option<String>,
    encoding: HostsEncoding,
    size: usize,
) -> String {
    if let Some(existing) = history.iter().rev().find(|entry| entry.sha256 == sha256) {
        return existing.id.clone();
    }
    let timestamp_ms = now_ms();
    let id = format!("{timestamp_ms}-{}", &sha256[..12]);
    history.push(HistoryEntryV1 {
        id: id.clone(),
        timestamp_ms,
        writer: writer.to_string(),
        action: action.to_string(),
        sha256: sha256.to_string(),
        previous_sha256,
        encoding,
        size,
    });
    id
}

fn trim_history_and_snapshots(
    state_dir: &Path,
    history: &mut Vec<HistoryEntryV1>,
) -> Result<(), CoordinatorError> {
    if history.len() > HISTORY_LIMIT {
        let remove = history.len() - HISTORY_LIMIT;
        history.drain(0..remove);
    }
    let referenced = history
        .iter()
        .map(|entry| entry.sha256.as_str())
        .collect::<HashSet<_>>();
    let dir = snapshots_dir(state_dir);
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            if !referenced.contains(stem) {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn replace_file_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "target has no parent")
    })?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(
        ".cfmind-hosts-{}-{}.tmp",
        std::process::id(),
        now_ms()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);

    #[cfg(target_os = "windows")]
    let result = replace_file_windows(&temp, path);
    #[cfg(not(target_os = "windows"))]
    let result = fs::rename(&temp, path);

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(target_os = "windows")]
fn replace_file_windows(temp: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let temp_w = temp
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let target_w = target
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let ok = unsafe {
        MoveFileExW(
            temp_w.as_ptr(),
            target_w.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

struct GlobalHostsMutex {
    #[cfg(target_os = "windows")]
    handle: windows_sys::Win32::Foundation::HANDLE,
    #[cfg(not(target_os = "windows"))]
    _guard: std::sync::MutexGuard<'static, ()>,
}

impl GlobalHostsMutex {
    fn acquire() -> Result<Self, CoordinatorError> {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Foundation::{WAIT_ABANDONED, WAIT_OBJECT_0};
            use windows_sys::Win32::System::Threading::{CreateMutexW, WaitForSingleObject};
            let name = std::ffi::OsStr::new(MUTEX_NAME)
                .encode_wide()
                .chain(Some(0))
                .collect::<Vec<_>>();
            let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
            if handle.is_null() {
                return Err(CoordinatorError::Io {
                    path: MUTEX_NAME.to_string(),
                    reason: std::io::Error::last_os_error().to_string(),
                });
            }
            let wait = unsafe { WaitForSingleObject(handle, 120_000) };
            if wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED {
                unsafe { windows_sys::Win32::Foundation::CloseHandle(handle) };
                return Err(CoordinatorError::Io {
                    path: MUTEX_NAME.to_string(),
                    reason: format!("mutex wait failed or timed out: {wait}"),
                });
            }
            Ok(Self { handle })
        }
        #[cfg(not(target_os = "windows"))]
        {
            static MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());
            let guard = MUTEX.lock().map_err(|_| CoordinatorError::Io {
                path: "process hosts mutex".to_string(),
                reason: "mutex poisoned".to_string(),
            })?;
            Ok(Self { _guard: guard })
        }
    }
}

impl Drop for GlobalHostsMutex {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::Foundation::CloseHandle;
            use windows_sys::Win32::System::Threading::ReleaseMutex;
            ReleaseMutex(self.handle);
            CloseHandle(self.handle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn upsert(owner: &str, content: &str, writer: &str) -> HostsIntentV1 {
        HostsIntentV1::UpsertOwner {
            owner: owner.to_string(),
            content: content.to_string(),
            writer: writer.to_string(),
            profile: None,
        }
    }

    #[test]
    fn four_sources_preserve_their_owned_sections() {
        let base = b"127.0.0.1 localhost\r\n";
        let env = transform_bytes(
            base,
            &upsert(OWNER_ENVIRONMENT, "10.0.0.1 test.local", "config-switcher"),
        )
        .unwrap();
        let switch = transform_bytes(
            env.new_content.as_bytes(),
            &HostsIntentV1::ApplySwitchHosts {
                content: "10.0.0.2 switch.local".to_string(),
                write_mode: "append".to_string(),
                writer: "SwitchHosts".to_string(),
            },
        )
        .unwrap();
        let local = transform_bytes(
            switch.new_content.as_bytes(),
            &upsert(
                OWNER_LOCAL_AGENT,
                "127.0.0.2 aibot-srv.easyclaw.com",
                "local-agent",
            ),
        )
        .unwrap();
        assert!(local.new_content.contains(OWNER_LOCAL_AGENT));
        assert!(local.new_content.contains(OWNER_ENVIRONMENT));
        assert!(local.new_content.contains("127.0.0.1 localhost"));
        assert!(local.new_content.contains(SWITCHHOSTS_MARKER));
        assert!(local.new_content.contains("switch.local"));
    }

    #[test]
    fn local_agent_uses_section_order_and_removal_reveals_environment_mapping() {
        let env = transform_bytes(
            b"",
            &upsert(
                OWNER_ENVIRONMENT,
                "43.159.159.176 aibot-srv.easyclaw.com",
                "config-switcher",
            ),
        )
        .unwrap();
        let local = transform_bytes(
            env.new_content.as_bytes(),
            &upsert(
                OWNER_LOCAL_AGENT,
                "127.0.0.2 aibot-srv.easyclaw.com",
                "local-agent",
            ),
        )
        .unwrap();
        let local_pos = local.new_content.find(OWNER_LOCAL_AGENT).unwrap();
        let environment_pos = local.new_content.find(OWNER_ENVIRONMENT).unwrap();
        assert!(local_pos < environment_pos);
        assert!(local
            .new_content
            .contains("43.159.159.176 aibot-srv.easyclaw.com"));
        assert!(!local.new_content.contains("cfmind-shadowed-by"));
        let restored = transform_bytes(
            local.new_content.as_bytes(),
            &HostsIntentV1::RemoveOwner {
                owner: OWNER_LOCAL_AGENT.to_string(),
                writer: "local-agent".to_string(),
            },
        )
        .unwrap();
        assert!(!restored.new_content.contains("cfmind-shadowed-by"));
        assert!(restored
            .new_content
            .contains("43.159.159.176 aibot-srv.easyclaw.com"));
    }

    #[test]
    fn local_agent_adopts_an_exact_legacy_standalone_mapping() {
        let result = transform_bytes(
            b"127.0.0.1 localhost\r\n127.0.0.2 aibot-srv.easyclaw.com\r\n",
            &upsert(
                OWNER_LOCAL_AGENT,
                "127.0.0.2 aibot-srv.easyclaw.com",
                "local-agent",
            ),
        )
        .unwrap();
        let inspection = inspect_bytes(result.new_content.as_bytes()).unwrap();
        assert_eq!(
            inspection.local_agent_content.as_deref(),
            Some("127.0.0.2 aibot-srv.easyclaw.com")
        );
        assert!(!inspection
            .unmanaged_content
            .contains("aibot-srv.easyclaw.com"));
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("legacy standalone")));
    }

    #[test]
    fn environment_adopts_an_exact_legacy_whole_file_profile() {
        let legacy = "10.0.0.1 api.test.local\r\n10.0.0.2 web.test.local\r\n";
        let result = transform_bytes(
            legacy.as_bytes(),
            &upsert(OWNER_ENVIRONMENT, legacy, "config-switcher"),
        )
        .unwrap();
        let inspection = inspect_bytes(result.new_content.as_bytes()).unwrap();
        assert!(inspection.unmanaged_content.is_empty());
        assert_eq!(
            inspection.environment_content.as_deref(),
            Some("10.0.0.1 api.test.local\n10.0.0.2 web.test.local")
        );
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("legacy EasyClaw environment")));
    }

    #[test]
    fn different_ip_records_coexist_without_conflict_detection() {
        let env = transform_bytes(
            b"",
            &upsert(OWNER_ENVIRONMENT, "10.0.0.1 api.local", "config-switcher"),
        )
        .unwrap();
        let result = transform_bytes(
            env.new_content.as_bytes(),
            &HostsIntentV1::ApplySwitchHosts {
                content: "10.0.0.2 api.local".to_string(),
                write_mode: "append".to_string(),
                writer: "SwitchHosts".to_string(),
            },
        )
        .unwrap();
        assert!(result.new_content.contains("10.0.0.1 api.local"));
        assert!(result.new_content.contains("10.0.0.2 api.local"));
        assert!(result.conflicts.is_empty());
    }

    #[test]
    fn one_environment_block_accepts_existing_duplicate_domains() {
        let result = transform_bytes(
            b"",
            &upsert(
                OWNER_ENVIRONMENT,
                "49.233.6.183 api-webchat-enterprise-v2.easyclaw.cn\n140.143.221.64 api-webchat-enterprise-v2.easyclaw.cn",
                "config-switcher",
            ),
        )
        .unwrap();
        assert!(result.new_content.contains("49.233.6.183"));
        assert!(result.new_content.contains("140.143.221.64"));
        assert!(!result.new_content.contains(META_PREFIX));
    }

    #[test]
    fn overwrite_keeps_cfmind_blocks_and_drops_unmanaged_content() {
        let env = transform_bytes(
            b"127.0.0.1 unmanaged.local\n",
            &upsert(OWNER_ENVIRONMENT, "10.0.0.1 test.local", "config-switcher"),
        )
        .unwrap();
        let result = transform_bytes(
            env.new_content.as_bytes(),
            &HostsIntentV1::ApplySwitchHosts {
                content: "10.0.0.2 switch.local".to_string(),
                write_mode: "overwrite".to_string(),
                writer: "SwitchHosts".to_string(),
            },
        )
        .unwrap();
        assert!(result.new_content.contains(OWNER_ENVIRONMENT));
        assert!(!result.new_content.contains("unmanaged.local"));
        assert!(result.new_content.contains("switch.local"));
    }

    #[test]
    fn gbk_input_round_trips_with_chinese_comments() {
        let (encoded, _, _) = GBK.encode("# 测试\r\n10.0.0.1 test.local\r\n");
        let result = transform_bytes(
            encoded.as_ref(),
            &upsert(OWNER_ENVIRONMENT, "10.0.0.2 env.local", "config-switcher"),
        )
        .unwrap();
        assert_eq!(result.encoding, HostsEncoding::Gbk);
        let decoded =
            decode_hosts(&encode_hosts(&result.new_content, result.encoding).unwrap()).unwrap();
        assert!(decoded.text.contains("测试"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_converts_utf8_bom_input_to_gbk() {
        let mut input = vec![0xef, 0xbb, 0xbf];
        input.extend_from_slice("# 中文注释\r\n127.0.0.1 localhost\r\n".as_bytes());
        let result = transform(
            &input,
            &upsert(OWNER_ENVIRONMENT, "10.0.0.1 env.local", "test"),
            None,
        )
        .unwrap();

        assert_eq!(result.encoding, HostsEncoding::Gbk);
        assert!(!result.bytes.starts_with(&[0xef, 0xbb, 0xbf]));
        assert!(std::str::from_utf8(&result.bytes).is_err());
        let decoded = decode_hosts(&result.bytes).unwrap();
        assert_eq!(decoded.encoding, HostsEncoding::Gbk);
        assert!(decoded.text.contains("中文注释"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_rejects_text_that_cannot_be_encoded_as_gbk() {
        let result = transform_bytes(
            "# emoji 😀\r\n127.0.0.1 localhost\r\n".as_bytes(),
            &upsert(OWNER_ENVIRONMENT, "10.0.0.1 env.local", "test"),
        );
        assert!(matches!(result, Err(CoordinatorError::Encoding(_))));
    }

    #[test]
    fn malformed_or_duplicate_blocks_are_rejected() {
        let malformed = format!("{BLOCK_START_PREFIX}{OWNER_ENVIRONMENT}\n10.0.0.1 a.local\n");
        assert!(matches!(
            inspect_bytes(malformed.as_bytes()),
            Err(CoordinatorError::InvalidStructure(_))
        ));
    }

    #[test]
    fn transaction_keeps_only_fifty_history_versions() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("hosts");
        let state = dir.path().join("state");
        for index in 0..55 {
            execute_transaction(
                &target,
                &state,
                &upsert(
                    OWNER_ENVIRONMENT,
                    &format!("10.0.0.1 item-{index}.local"),
                    "test",
                ),
            )
            .unwrap();
        }
        assert_eq!(load_shared_history(&state).unwrap().len(), 50);
    }
}
