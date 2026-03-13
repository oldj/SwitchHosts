/**
 * Hosts file syntax highlighting and comment toggling for CodeJar.
 *
 * Highlighting: converts plain-text hosts content into HTML with
 * `hl-comment`, `hl-ip`, and `hl-error` spans for styling.
 *
 * Comment toggling: adds/removes `# ` prefixes while preserving
 * cursor/selection positions via offset-based transforms.
 */

import type { Position } from 'codejar'
import { normalizeLineEndings } from '@common/newlines'

/** Matches a valid hosts entry: optional whitespace, an IPv4/IPv6 address, then a hostname. */
const HOSTS_LINE_RE = /^\s*([\d.]+|[\da-f:.%lo]+)\s+\w/i
/** Captures the leading indent and `# ` prefix of a comment line for removal. */
const COMMENT_LINE_RE = /^(\s*)#\s*/

/** A single line with its byte offsets within the full document. */
interface LineInfo {
  start: number
  end: number
  text: string
}

/**
 * Transform records describe how a single toggle operation shifted characters.
 * They are collected per-line and then applied to map the original cursor/selection
 * offsets to their new positions in the modified text.
 */
interface InsertTransform {
  type: 'insert'
  at: number
  length: number
}

interface RemoveTransform {
  type: 'remove'
  start: number
  end: number
}

type Transform = InsertTransform | RemoveTransform

export interface CommentToggleResult {
  content: string
  selectionStart: number
  selectionEnd: number
  changed: boolean
}

interface ToggleLineResult {
  nextText: string
  changed: boolean
  transform?: Transform
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function isHostsCommentLine(line: string): boolean {
  return /^\s*#/.test(line)
}

export function isValidHostsLine(line: string): boolean {
  return HOSTS_LINE_RE.test(line)
}

export function highlightHostsLine(line: string): string {
  if (!line) return ''

  if (isHostsCommentLine(line)) {
    return `<span class="hl-comment">${escapeHtml(line)}</span>`
  }

  if (!isValidHostsLine(line)) {
    return `<span class="hl-error">${escapeHtml(line)}</span>`
  }

  const match = line.match(/^(\s*)([\w.:%]+)/)
  if (!match) {
    return escapeHtml(line)
  }

  const [, indent, ip] = match
  const rest = line.slice(indent.length + ip.length)
  return `${escapeHtml(indent)}<span class="hl-ip">${escapeHtml(ip)}</span>${escapeHtml(rest)}`
}

export function highlightHostsText(code: string): string {
  return normalizeLineEndings(code)
    .split('\n')
    .map((line) => highlightHostsLine(line))
    .join('\n')
}

/** CodeJar highlight callback — replaces the editor's innerHTML with syntax-highlighted HTML. */
export function highlightHosts(editor: HTMLElement, _pos?: Position): void {
  editor.innerHTML = highlightHostsText(editor.textContent || '')
}

function getLines(code: string): LineInfo[] {
  const parts = normalizeLineEndings(code).split('\n')
  let start = 0

  return parts.map((text) => {
    const line = {
      start,
      end: start + text.length,
      text,
    }
    start += text.length + 1
    return line
  })
}

function getLineIndexAtOffset(lines: LineInfo[], offset: number): number {
  if (lines.length === 0) return 0

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (offset >= lines[i].start) {
      return i
    }
  }

  return 0
}

function toggleLine(line: string, lineStart: number): ToggleLineResult {
  if (/^\s*$/.test(line)) {
    return {
      nextText: line,
      changed: false,
    }
  }

  const commentMatch = line.match(COMMENT_LINE_RE)
  if (commentMatch) {
    const indent = commentMatch[1]
    return {
      nextText: line.replace(COMMENT_LINE_RE, '$1'),
      changed: true,
      transform: {
        type: 'remove',
        start: lineStart + indent.length,
        end: lineStart + commentMatch[0].length,
      },
    }
  }

  return {
    nextText: `# ${line}`,
    changed: true,
    transform: {
      type: 'insert',
      at: lineStart,
      length: 2,
    },
  }
}

/** Map an original document offset through a series of insert/remove transforms. */
function mapOffset(offset: number, transforms: Transform[]): number {
  let mapped = offset

  for (const transform of transforms) {
    if (transform.type === 'insert') {
      if (offset >= transform.at) {
        mapped += transform.length
      }
      continue
    }

    if (offset <= transform.start) continue

    if (offset < transform.end) {
      mapped -= offset - transform.start
      continue
    }

    mapped -= transform.end - transform.start
  }

  return mapped
}

function getLineStartOffsets(lines: string[]): number[] {
  const starts: number[] = []
  let start = 0

  for (const line of lines) {
    starts.push(start)
    start += line.length + 1
  }

  return starts
}

function getSelectionRange(selectionStart: number, selectionEnd: number) {
  return {
    start: Math.min(selectionStart, selectionEnd),
    end: Math.max(selectionStart, selectionEnd),
  }
}

/**
 * Core toggle implementation: comment/uncomment lines in [startLineIndex, endLineIndex],
 * returning the updated text and adjusted selection offsets.
 * When `moveToNextLine` is true and the selection is collapsed (cursor), the cursor
 * is moved to the start of the next line after toggling (mimics IDE behavior).
 */
function toggleCommentLines(
  code: string,
  selectionStart: number,
  selectionEnd: number,
  startLineIndex: number,
  endLineIndex: number,
  moveToNextLine: boolean,
): CommentToggleResult {
  const lines = getLines(code)
  const nextLines = lines.map((line) => line.text)
  const transforms: Transform[] = []
  let changed = false

  for (let i = startLineIndex; i <= endLineIndex; i += 1) {
    const line = lines[i]
    const result = toggleLine(line.text, line.start)
    nextLines[i] = result.nextText
    changed ||= result.changed
    if (result.transform) {
      transforms.push(result.transform)
    }
  }

  if (!changed) {
    return {
      content: code,
      selectionStart,
      selectionEnd,
      changed: false,
    }
  }

  const nextContent = nextLines.join('\n')
  if (moveToNextLine && selectionStart === selectionEnd) {
    const nextStarts = getLineStartOffsets(nextLines)
    const nextLineIndex = startLineIndex + 1
    const nextOffset = nextStarts[nextLineIndex] ?? nextContent.length
    return {
      content: nextContent,
      selectionStart: nextOffset,
      selectionEnd: nextOffset,
      changed: true,
    }
  }

  return {
    content: nextContent,
    selectionStart: mapOffset(selectionStart, transforms),
    selectionEnd: mapOffset(selectionEnd, transforms),
    changed: true,
  }
}

/** Toggle comment on all lines touched by the current selection range. */
export function toggleCommentBySelection(
  code: string,
  selectionStart: number,
  selectionEnd: number,
  moveToNextLine = false,
): CommentToggleResult {
  const normalizedCode = normalizeLineEndings(code)
  const lines = getLines(normalizedCode)
  const { start, end } = getSelectionRange(selectionStart, selectionEnd)
  const startLineIndex = getLineIndexAtOffset(lines, start)
  const endLineIndex =
    start === end ? startLineIndex : getLineIndexAtOffset(lines, Math.max(start, end - 1))

  return toggleCommentLines(
    normalizedCode,
    selectionStart,
    selectionEnd,
    startLineIndex,
    endLineIndex,
    moveToNextLine,
  )
}

/** Toggle comment on a single line identified by its zero-based index (used for gutter clicks). */
export function toggleCommentByLine(
  code: string,
  lineIndex: number,
  selectionStart: number,
  selectionEnd: number,
): CommentToggleResult {
  const normalizedCode = normalizeLineEndings(code)
  const lines = getLines(normalizedCode)
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      content: normalizedCode,
      selectionStart,
      selectionEnd,
      changed: false,
    }
  }

  return toggleCommentLines(
    normalizedCode,
    selectionStart,
    selectionEnd,
    lineIndex,
    lineIndex,
    false,
  )
}
