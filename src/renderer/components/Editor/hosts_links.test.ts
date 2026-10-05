// @vitest-environment jsdom
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commentLinks, getCommentLinks } from './hosts_links'

let view: EditorView | undefined
afterEach(() => view?.destroy())

describe('comment URL recognition', () => {
  it('limits links to comments, including inline comments, and keeps source offsets', () => {
    const line =
      '127.0.0.1 example.test # 文档 https://example.test/a?q=1&b=2#part http://localhost:8080/'
    const links = getCommentLinks(line)
    expect(links.map((link) => link.url)).toEqual([
      'https://example.test/a?q=1&b=2#part',
      'http://localhost:8080/',
    ])
    for (const link of links) expect(line.slice(link.from, link.to)).toBe(link.url)
    expect(getCommentLinks('https://example.test/')).toEqual([])
    expect(getCommentLinks('https://example.test/#fragment')).toEqual([])
    expect(getCommentLinks('# javascript:alert(1) file:///etc/hosts https://')).toEqual([])
  })

  it('excludes surrounding punctuation while preserving balanced URL brackets', () => {
    const line =
      '# (https://example.test/wiki/Test_(page)). <HTTP://[::1]:8080/a> “https://例子.测试/文档”，'
    expect(getCommentLinks(line).map((link) => link.url)).toEqual([
      'https://example.test/wiki/Test_(page)',
      'HTTP://[::1]:8080/a',
      'https://例子.测试/文档',
    ])
  })
})

describe.each([true, false])('comment link gestures (macOS: %s)', (isMac) => {
  it.each([true, false])('opens only with the platform modifier (read-only: %s)', (readOnly) => {
    const onOpenUrl = vi.fn()
    const doc = '# https://example.test/'
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 0, head: 1 },
        extensions: [
          commentLinks(isMac, onOpenUrl),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ],
      }),
      parent: document.body,
    })
    const link = view.dom.querySelector('.hl-comment-link')!
    const modifier = isMac ? { metaKey: true } : { ctrlKey: true }
    for (const options of [
      {},
      isMac ? { ctrlKey: true } : { metaKey: true },
      { ...modifier, button: 1 },
      { ...modifier, shiftKey: true },
      { ...modifier, altKey: true },
    ]) {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }))
    }
    expect(onOpenUrl).not.toHaveBeenCalled()
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...modifier })
    link.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifier }))
    expect(onOpenUrl).toHaveBeenCalledExactlyOnceWith('https://example.test/')
    expect(view.state.selection.main.from).toBe(0)
    expect(view.state.selection.main.to).toBe(1)
    expect(view.state.doc.toString()).toBe(doc)

    view.dispatch({ changes: { from: 0, to: doc.length, insert: '# http://localhost:8080/new' } })
    expect(view.dom.querySelector('.hl-comment-link')?.getAttribute('data-url')).toBe(
      'http://localhost:8080/new',
    )
    view.dispatch({ changes: { from: 0, to: 2 } })
    expect(view.dom.querySelector('.hl-comment-link')).toBeNull()
  })
})
