/**
 * Tests for hosts comment toggling — single-line / multi-line / gutter-index.
 * Verifies cursor adjustment, blank-line no-op behavior, CRLF normalization,
 * and that the returned `changes` array forms a valid CodeMirror ChangeSpec list.
 */

import { EditorState } from '@codemirror/state'
import {
  toggleCommentByLine,
  toggleCommentBySelection,
  toggleCommentBySelections,
} from './hosts_highlight'
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

  it('toggles disjoint selections without changing the lines between them', () => {
    const doc = 'first\nuntouched\n  # last'
    const state = EditorState.create({ doc })
    const changes = toggleCommentBySelections(doc, [
      { from: 0, to: 5 },
      { from: doc.indexOf('last'), to: doc.length },
    ])
    expect(state.update({ changes }).newDoc.toString()).toBe('# first\nuntouched\n  last')
  })

  it('toggles a line only once when multiple ranges touch it', () => {
    const doc = 'first second\nthird'
    const state = EditorState.create({ doc })
    const changes = toggleCommentBySelections(doc, [
      { from: 0, to: 5 },
      { from: 6, to: doc.length },
    ])
    expect(state.update({ changes }).newDoc.toString()).toBe('# first second\n# third')
  })

  it('handles empty ranges, blank lines, and selections ending at a line start', () => {
    const doc = 'first\nsecond\n\nlast'
    const state = EditorState.create({ doc })
    const changes = toggleCommentBySelections(doc, [
      { from: 0, to: 6 },
      { from: 13, to: 13 },
      { from: doc.length, to: doc.length },
    ])
    expect(state.update({ changes }).newDoc.toString()).toBe('# first\nsecond\n\n# last')
  })
})
