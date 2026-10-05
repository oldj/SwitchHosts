/**
 * CodeMirror 6 extensions for the hosts editor:
 *   - viewport-aware syntax highlighter that reuses `hl-comment` / `hl-ip` / `hl-error`
 *     CSS classes via Decoration.line / Decoration.mark
 *   - line-number gutter with mousedown handler for toggle-comment
 *   - theme bound to existing --swh-editor-* CSS variables (so dark/light switches
 *     for free without compartment reconfigure)
 *   - history + default keymap, no Tab binding (preserves accessibility focus nav)
 */

import { Compartment, EditorState, type Extension, Facet, RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  crosshairCursor,
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
  rectangularSelection,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { getHostsBoundary, isHostsCommentLine, isValidHostsLine } from './hosts_highlight'

export interface BoundaryLabels {
  start: string
  end: string
}

export const boundaryLabels = Facet.define<BoundaryLabels, BoundaryLabels>({
  combine: (values) => values[0] ?? { start: 'Managed start', end: 'Managed end' },
})

class BoundaryLabel extends WidgetType {
  constructor(readonly label: string) {
    super()
  }

  eq(other: BoundaryLabel) {
    return this.label === other.label
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'swh-boundary-label'
    span.textContent = this.label
    return span
  }
}

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
        const boundary = getHostsBoundary(text)
        if (boundary) {
          builder.add(
            line.from,
            line.from,
            Decoration.line({
              class: `swh-boundary swh-boundary-${boundary}`,
            }),
          )
          builder.add(
            line.to,
            line.to,
            Decoration.widget({
              widget: new BoundaryLabel(view.state.facet(boundaryLabels)[boundary]),
              side: 1,
            }),
          )
        } else if (isHostsCommentLine(text)) {
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
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.startState.facet(boundaryLabels) !== u.state.facet(boundaryLabels)
      ) {
        this.decorations = buildDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// drawSelection paints only the background. Mark the selected characters too so
// their foreground can retain syntax hues at a readable lightness.
const selectedTextDeco = Decoration.mark({ class: 'hl-selection' })
const selectedText = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      for (const range of view.state.selection.ranges) {
        if (range.empty) continue
        for (const visible of view.visibleRanges) {
          const from = Math.max(range.from, visible.from)
          const to = Math.min(range.to, visible.to)
          if (from < to) builder.add(from, to, selectedTextDeco)
        }
      }
      return builder.finish()
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = this.build(u.view)
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
  '.cm-line.swh-boundary': {
    color: 'var(--swh-editor-boundary-color)',
    boxShadow:
      'inset 0 1px var(--swh-editor-boundary-rule), inset 0 -1px var(--swh-editor-boundary-rule)',
    paddingRight: '8px',
    minWidth: 'max-content',
  },
  '.cm-line.swh-boundary-start': {
    boxShadow: 'inset 0 1px var(--swh-primary-color), inset 0 -1px var(--swh-editor-boundary-rule)',
  },
  '.cm-line.swh-boundary-end': {
    boxShadow: 'inset 0 1px var(--swh-editor-boundary-rule), inset 0 -1px var(--swh-primary-color)',
  },
  '.swh-boundary-label': {
    // Stick to the scrollport edge, rather than the end of the widest code line.
    position: 'sticky',
    right: '8px',
    zIndex: '1',
    float: 'right',
    marginLeft: '24px',
    marginTop: '0.15em',
    padding: '0 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--swh-accent-soft-bg)',
    color: 'var(--swh-accent-soft-color)',
    fontFamily: 'var(--mantine-font-family)',
    fontSize: '0.8em',
    lineHeight: '1.4em',
    userSelect: 'none',
  },
  '.swh-boundary .hl-selection': { color: '#fff' },
  '.cm-cursor': {
    borderLeftColor: 'var(--swh-editor-text-color)',
  },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    {
      backgroundColor: 'var(--swh-tree-selected-bg)',
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
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    drawSelection(),
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
    selectedText,
    hostsTheme,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onDocChange(u.state.doc.toString())
    }),
    readOnlyCompartment.of(readOnlyExtensions(initialReadOnly)),
  ]

  return { extensions, readOnlyCompartment }
}

export function readOnlyExtensions(readOnly: boolean): Extension {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    // Keep selection/keyboard events in the viewer instead of the page (for
    // example, WebKit otherwise treats Backspace as browser navigation).
    readOnly ? EditorView.contentAttributes.of({ tabindex: '0' }) : [],
    // Read-only viewers may still select text, but must not show editing cursors.
    readOnly ? EditorView.theme({ '.cm-cursor': { display: 'none !important' } }) : [],
  ]
}
