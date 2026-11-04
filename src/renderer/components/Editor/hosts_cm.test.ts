// @vitest-environment jsdom
import { Compartment, EditorState } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { boundaryLabels, hostsHighlighter } from './hosts_cm'

let view: EditorView | undefined
afterEach(() => view?.destroy())

it('preserves errors before an inline comment and updates both ranges as the entry is edited', () => {
  const prefix = '127.0.0.1 '
  const comment = '; missing name # TODO'
  view = new EditorView({
    doc: prefix + comment,
    extensions: [hostsHighlighter],
    parent: document.body,
  })
  const content = view.contentDOM
  expect(content.querySelector('.hl-error')?.textContent).toBe(prefix)
  expect(content.querySelector('.hl-comment')?.textContent).toBe(comment)

  view.dispatch({ changes: { from: prefix.length, insert: 'localhost' } })
  expect(content.querySelector('.hl-error')).toBeNull()
  expect(content.querySelector('.hl-ip')?.textContent).toBe('127.0.0.1')
  expect(content.querySelector('.hl-comment')?.textContent).toBe(comment)
  const marker = prefix.length + 'localhost'.length
  view.dispatch({ changes: { from: marker, to: marker + 1 } })
  expect(content.querySelector('.hl-comment')?.textContent).toBe('# TODO')
  view.dispatch({ changes: { from: marker, to: view.state.doc.length } })
  expect(content.querySelector('.hl-comment')).toBeNull()
})

it('decorates a hosts entry only once when its visible range is split', () => {
  const prefix = '127.0.0.1 localhost '
  const aliases = 'another-hostname '.repeat(10)
  const gap = Decoration.replace({}).range(prefix.length, prefix.length + aliases.length)
  view = new EditorView({
    doc: prefix + aliases + '# comment',
    extensions: [EditorView.decorations.of(Decoration.set([gap])), hostsHighlighter],
    parent: document.body,
  })
  expect(view.visibleRanges).toHaveLength(2)
  expect(view.contentDOM.querySelectorAll('.hl-ip')).toHaveLength(1)
  expect(view.contentDOM.querySelector('.hl-comment')?.textContent).toBe('# comment')
  expect(view.plugin(hostsHighlighter)?.decorations.size).toBe(2)
})

describe('managed boundary decorations', () => {
  it('keeps source and selection intact when labels change, and removes stale decorations on edits', () => {
    const doc =
      '# --- SWITCHHOSTS_CONTENT_START ---\n127.0.0.1 localhost\n# --- SWITCHHOSTS_CONTENT_END ---'
    const labels = new Compartment()
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 0, head: doc.length },
        extensions: [
          hostsHighlighter,
          labels.of(boundaryLabels.of({ start: 'Managed start', end: 'Managed end' })),
        ],
      }),
      parent: document.body,
    })
    expect(view.dom.querySelectorAll('.swh-boundary')).toHaveLength(2)
    view.dispatch({
      effects: labels.reconfigure(boundaryLabels.of({ start: '托管开始', end: '托管结束' })),
    })
    expect(view.dom.querySelector('.swh-boundary-label')?.textContent).toBe('托管开始')
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(
      doc,
    )
    view.dispatch({ changes: { from: 0, to: 1, insert: '##' } })
    expect(view.dom.querySelectorAll('.swh-boundary')).toHaveLength(1)
    expect(view.dom.querySelector('.hl-comment')?.textContent).toContain(
      '## --- SWITCHHOSTS_CONTENT_START ---',
    )
  })
})
