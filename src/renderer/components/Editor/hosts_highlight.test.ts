/**
 * Tests for hosts comment toggling — single-line / multi-line / gutter-index.
 * Verifies cursor adjustment, blank-line no-op behavior, CRLF normalization,
 * and that the returned `changes` array forms a valid CodeMirror ChangeSpec list.
 */

import { toggleCommentByLine, toggleCommentBySelection } from './hosts_highlight'
import { describe, expect, it } from 'vitest'

describe('hosts_highlight', () => {
  it('toggles the current line and moves the cursor to the next line', () => {
    const code = '127.0.0.1 localhost\nfoo'
    const result = toggleCommentBySelection(code, 0, 0, true)

    expect(result.content).toBe('# 127.0.0.1 localhost\nfoo')
    expect(result.selectionStart).toBe('# 127.0.0.1 localhost\n'.length)
    expect(result.selectionEnd).toBe('# 127.0.0.1 localhost\n'.length)
    expect(result.changes).toEqual([{ from: 0, insert: '# ' }])
  })

  it('toggles every line touched by a selection', () => {
    const code = '127.0.0.1 localhost\nfoo'
    const result = toggleCommentBySelection(code, 0, code.length)

    expect(result.content).toBe('# 127.0.0.1 localhost\n# foo')
    expect(result.selectionStart).toBe(2)
    expect(result.selectionEnd).toBe(code.length + 4)
    expect(result.changes).toEqual([
      { from: 0, insert: '# ' },
      { from: 20, insert: '# ' },
    ])
  })

  it('keeps blank lines as no-op', () => {
    const code = 'foo\n\nbar'
    const result = toggleCommentBySelection(code, 4, 4, true)

    expect(result.changed).toBe(false)
    expect(result.content).toBe(code)
    expect(result.selectionStart).toBe(4)
    expect(result.selectionEnd).toBe(4)
    expect(result.changes).toEqual([])
  })

  it('adjusts selection offsets when uncommenting indented lines', () => {
    const code = '  # foo\nbar'
    const result = toggleCommentBySelection(code, 4, 7)

    expect(result.content).toBe('  foo\nbar')
    expect(result.selectionStart).toBe(2)
    expect(result.selectionEnd).toBe(5)
    expect(result.changes).toEqual([{ from: 2, to: 4 }])
  })

  it('toggles a single line by gutter index', () => {
    const code = 'foo\nbar'
    const result = toggleCommentByLine(code, 1, 0, 0)

    expect(result.content).toBe('foo\n# bar')
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe(0)
    expect(result.changes).toEqual([{ from: 4, insert: '# ' }])
  })

  it('normalizes CRLF before toggling comments', () => {
    const result = toggleCommentBySelection('foo\r\nbar', 0, 0, true)

    expect(result.content).toBe('# foo\nbar')
    expect(result.selectionStart).toBe('# foo\n'.length)
    expect(result.selectionEnd).toBe('# foo\n'.length)
    expect(result.changes).toEqual([{ from: 0, insert: '# ' }])
  })
})
