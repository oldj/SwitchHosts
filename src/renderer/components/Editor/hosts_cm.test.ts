// @vitest-environment jsdom
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { boundaryLabels, hostsHighlighter } from './hosts_cm'

let view: EditorView | undefined
afterEach(() => view?.destroy())

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
