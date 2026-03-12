/**
 * Tests for hosts file syntax highlighting and comment toggling.
 * Covers HTML rendering of comment / IP / error lines,
 * single-line and multi-line comment toggle with cursor adjustment,
 * and gutter (line-index) based toggling.
 */

import {
  highlightHostsLine,
  highlightHostsText,
  toggleCommentByLine,
  toggleCommentBySelection,
} from './hosts_highlight'
import { describe, expect, it } from 'vitest'

describe('hosts_highlight', () => {
  it('highlights comment lines', () => {
    expect(highlightHostsLine('  # localhost')).toBe(
      '<span class="hl-comment">  # localhost</span>',
    )
  })

  it('highlights valid hosts lines with leading whitespace', () => {
    expect(highlightHostsLine('  127.0.0.1 localhost')).toBe(
      '  <span class="hl-ip">127.0.0.1</span> localhost',
    )
  })

  it('marks invalid lines as errors and escapes html', () => {
    expect(highlightHostsLine('foo <bar>')).toBe(
      '<span class="hl-error">foo &lt;bar&gt;</span>',
    )
  })

  it('preserves multiline output including trailing newline', () => {
    expect(highlightHostsText('127.0.0.1 localhost\n# ok\n')).toBe(
      '<span class="hl-ip">127.0.0.1</span> localhost\n<span class="hl-comment"># ok</span>\n',
    )
  })

  it('normalizes CRLF input before highlighting', () => {
    expect(highlightHostsText('127.0.0.1 localhost\r\n# ok\r\n')).toBe(
      '<span class="hl-ip">127.0.0.1</span> localhost\n<span class="hl-comment"># ok</span>\n',
    )
  })

  it('toggles the current line and moves the cursor to the next line', () => {
    const code = '127.0.0.1 localhost\nfoo'
    const result = toggleCommentBySelection(code, 0, 0, true)

    expect(result.content).toBe('# 127.0.0.1 localhost\nfoo')
    expect(result.selectionStart).toBe('# 127.0.0.1 localhost\n'.length)
    expect(result.selectionEnd).toBe('# 127.0.0.1 localhost\n'.length)
  })

  it('toggles every line touched by a selection', () => {
    const code = '127.0.0.1 localhost\nfoo'
    const result = toggleCommentBySelection(code, 0, code.length)

    expect(result.content).toBe('# 127.0.0.1 localhost\n# foo')
    expect(result.selectionStart).toBe(2)
    expect(result.selectionEnd).toBe(code.length + 4)
  })

  it('keeps blank lines as no-op', () => {
    const code = 'foo\n\nbar'
    const result = toggleCommentBySelection(code, 4, 4, true)

    expect(result.changed).toBe(false)
    expect(result.content).toBe(code)
    expect(result.selectionStart).toBe(4)
    expect(result.selectionEnd).toBe(4)
  })

  it('adjusts selection offsets when uncommenting indented lines', () => {
    const code = '  # foo\nbar'
    const result = toggleCommentBySelection(code, 4, 7)

    expect(result.content).toBe('  foo\nbar')
    expect(result.selectionStart).toBe(2)
    expect(result.selectionEnd).toBe(5)
  })

  it('toggles a single line by gutter index', () => {
    const code = 'foo\nbar'
    const result = toggleCommentByLine(code, 1, 0, 0)

    expect(result.content).toBe('foo\n# bar')
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe(0)
  })

  it('normalizes CRLF before toggling comments', () => {
    const result = toggleCommentBySelection('foo\r\nbar', 0, 0, true)

    expect(result.content).toBe('# foo\nbar')
    expect(result.selectionStart).toBe('# foo\n'.length)
    expect(result.selectionEnd).toBe('# foo\n'.length)
  })
})
