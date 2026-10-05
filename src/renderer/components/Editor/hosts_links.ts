import { RangeSetBuilder, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'

interface CommentLink {
  from: number
  to: number
  url: string
}

/** Offsets are relative to the line; only text after the first # is a comment. */
export function getCommentLinks(line: string): CommentLink[] {
  const commentStart = line.indexOf('#')
  if (commentStart < 0) return []

  const links: CommentLink[] = []
  const pattern = /\bhttps?:\/\/[^\s<>"'`，。；：！？（）【】「」“”‘’]+/gi
  for (const match of line.slice(commentStart + 1).matchAll(pattern)) {
    let url = match[0]
    // Exclude prose punctuation and unmatched closing brackets, while retaining
    // balanced brackets in paths (and IPv6 addresses).
    const opening: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
    while (url) {
      const last = url.at(-1)!
      if (/[.,;:!?]/.test(last)) {
        url = url.slice(0, -1)
      } else if (opening[last] && url.split(last).length > url.split(opening[last]).length) {
        url = url.slice(0, -1)
      } else {
        break
      }
    }
    try {
      if (!new URL(url).hostname) continue
    } catch {
      continue
    }
    const from = commentStart + 1 + match.index
    links.push({ from, to: from + url.length, url })
  }
  return links
}

function buildLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let lastLine = 0
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos)
      // A long line may occur in more than one visible range.
      if (line.number > lastLine) {
        for (const link of getCommentLinks(line.text)) {
          builder.add(
            line.from + link.from,
            line.from + link.to,
            Decoration.mark({ class: 'hl-comment-link', attributes: { 'data-url': link.url } }),
          )
        }
        lastLine = line.number
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

export function commentLinks(isMac: boolean, onOpenUrl: (url: string) => void): Extension {
  const modifierHeld = (event: MouseEvent | KeyboardEvent): boolean =>
    !event.altKey &&
    !event.shiftKey &&
    (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)

  const clickedUrl = (event: MouseEvent, view: EditorView): string | undefined => {
    if (event.button !== 0 || !modifierHeld(event)) return
    const link = event.target instanceof Element ? event.target.closest('.hl-comment-link') : null
    if (link && view.contentDOM.contains(link)) return link.getAttribute('data-url') ?? undefined
  }

  const links = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      modifierDown = false

      constructor(readonly view: EditorView) {
        this.decorations = buildLinkDecorations(view)
        // Listen outside the content DOM too: hovering a read-only or unfocused
        // editor must respond to modifier changes without moving the mouse.
        view.dom.ownerDocument.defaultView!.addEventListener('keydown', this.onKey, true)
        view.dom.ownerDocument.defaultView!.addEventListener('keyup', this.onKey, true)
        view.dom.ownerDocument.defaultView!.addEventListener('blur', this.onBlur)
      }

      setModifier(down: boolean) {
        if (this.modifierDown === down) return
        this.modifierDown = down
        this.view.update([])
      }

      onKey = (event: KeyboardEvent) => this.setModifier(modifierHeld(event))
      onBlur = () => this.setModifier(false)

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildLinkDecorations(update.view)
        }
      }

      destroy() {
        this.view.dom.ownerDocument.defaultView!.removeEventListener('keydown', this.onKey, true)
        this.view.dom.ownerDocument.defaultView!.removeEventListener('keyup', this.onKey, true)
        this.view.dom.ownerDocument.defaultView!.removeEventListener('blur', this.onBlur)
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventObservers: {
        mousemove(event) {
          this.setModifier(modifierHeld(event))
        },
        mouseenter(event) {
          this.setModifier(modifierHeld(event))
        },
      },
    },
  )

  return [
    links,
    EditorView.editorAttributes.of((view) =>
      view.plugin(links)?.modifierDown ? { class: 'swh-link-modifier' } : null,
    ),
    EditorView.domEventHandlers({
      // Preserve the selection and avoid CodeMirror's modifier-click cursors.
      mousedown: (event, view) => !!clickedUrl(event, view),
      click(event, view) {
        const url = clickedUrl(event, view)
        if (!url) return false
        onOpenUrl(url)
        return true
      },
    }),
    EditorView.baseTheme({
      '.hl-comment-link': { textDecoration: 'underline', textUnderlineOffset: '3px' },
      '&.swh-link-modifier .hl-comment-link:hover': {
        cursor: 'pointer',
        color: 'color-mix(in srgb, currentColor 70%, var(--swh-editor-link-hover-tint))',
      },
    }),
  ]
}
