/**
 * CodeMirror 6 extensions for the hosts editor:
 *   - viewport-aware syntax highlighter that reuses `hl-comment` / `hl-ip` / `hl-error`
 *     CSS classes via Decoration.line / Decoration.mark
 *   - line-number gutter with mousedown handler for toggle-comment
 *   - theme bound to existing --swh-editor-* CSS variables (so dark/light switches
 *     for free without compartment reconfigure)
 *   - history + default keymap, no Tab binding (preserves accessibility focus nav)
 */

import { Compartment, EditorState, type Extension, RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { isHostsCommentLine, isValidHostsLine } from './hosts_highlight'

const IP_RE = /^(\s*)([\w.:%]+)/

const commentLineDeco = Decoration.line({ class: 'hl-comment' })
const errorLineDeco = Decoration.line({ class: 'hl-error' })
const ipMarkDeco = Decoration.mark({ class: 'hl-ip' })

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const text = line.text

      if (text.length > 0) {
        if (isHostsCommentLine(text)) {
          builder.add(line.from, line.from, commentLineDeco)
        } else if (!isValidHostsLine(text)) {
          builder.add(line.from, line.from, errorLineDeco)
        } else {
          const m = text.match(IP_RE)
          if (m) {
            const ipStart = line.from + m[1].length
            const ipEnd = ipStart + m[2].length
            builder.add(ipStart, ipEnd, ipMarkDeco)
          }
        }
      }

      if (line.to >= to) break
      pos = line.to + 1
    }
  }

  return builder.finish()
}

export const hostsHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// Theme intentionally does NOT touch .cm-scroller — its baseTheme `fontFamily: monospace`
// is fine as a fallback, and the project's editor font is applied via the SCSS module
// (with selector specificity raised above baseTheme's `.cm-scroller`).
const hostsTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--swh-editor-bg-color)',
    color: 'var(--swh-editor-text-color)',
    fontSize: 'var(--swh-editor-font-size)',
    lineHeight: 'var(--swh-editor-line-height)',
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: 'transparent',
  },
  '&.cm-focused .cm-content': {
    caretColor: 'var(--swh-editor-text-color)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--swh-editor-gutter-bg)',
    color: 'var(--swh-editor-line-number-color)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 6px 0 8px',
    cursor: 'pointer',
    fontSize: '12px',
    userSelect: 'none',
  },
})

export interface BuildExtensionsOptions {
  initialReadOnly: boolean
  onDocChange: (next: string) => void
  onGutterClick: (lineIndex: number) => void
}

export interface BuiltExtensions {
  extensions: Extension[]
  readOnlyCompartment: Compartment
}

export function buildExtensions({
  initialReadOnly,
  onDocChange,
  onGutterClick,
}: BuildExtensionsOptions): BuiltExtensions {
  const readOnlyCompartment = new Compartment()

  const extensions: Extension[] = [
    history(),
    lineNumbers({
      domEventHandlers: {
        mousedown(view, line, event) {
          // CM 6 Line.number is 1-based; our toggleCommentByLine wants 0-based.
          const lineIdx = view.state.doc.lineAt(line.from).number - 1
          onGutterClick(lineIdx)
          ;(event as MouseEvent).preventDefault()
          return true
        },
      },
    }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    hostsHighlighter,
    hostsTheme,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onDocChange(u.state.doc.toString())
    }),
    readOnlyCompartment.of(readOnlyExtensions(initialReadOnly)),
  ]

  return { extensions, readOnlyCompartment }
}

export function readOnlyExtensions(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
}
