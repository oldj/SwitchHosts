// @vitest-environment jsdom

import type { IHostsListObject } from '@common/data'
import { EditorView } from '@codemirror/view'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  current: { id: 'group', type: 'group', include: ['local'] } as IHostsListObject,
  list: [] as IHostsListObject[],
  getHostsContent: vi.fn(),
  getSystemHosts: vi.fn(),
  setHostsContent: vi.fn(),
  handlers: new Map<string, (...args: any[]) => void>(),
}))
vi.mock('@renderer/core/agent', () => ({
  actions: {
    getHostsContent: mocks.getHostsContent,
    getSystemHosts: mocks.getSystemHosts,
    setHostsContent: mocks.setHostsContent,
  },
  agent: { platform: 'darwin' },
}))
vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: (event: string, handler: (...args: any[]) => void) => mocks.handlers.set(event, handler),
}))
vi.mock('@renderer/models/useHostsData', () => ({
  default: () => ({
    currentHosts: mocks.current,
    hostsData: { list: mocks.list },
    isReadOnly: (item: IHostsListObject) => item.type !== 'local',
  }),
}))
vi.mock('@renderer/models/useI18n', () => ({
  default: () => ({ lang: { fail: 'Read failed', history_retry: 'Retry' } }),
}))
vi.mock('@renderer/components/StatusBar', () => ({ default: () => null }))
vi.mock('@renderer/core/notify', () => ({
  getErrorMessage: String,
  showErrorNotification: vi.fn(),
}))
vi.mock('./hosts_cm', async () => {
  const { Compartment, EditorState, Facet } = await import('@codemirror/state')
  const { EditorView } = await import('@codemirror/view')
  return {
    boundaryLabels: Facet.define(),
    readOnlyExtensions: (readOnly: boolean) => EditorState.readOnly.of(readOnly),
    buildExtensions: ({ initialReadOnly, onDocChange }: any) => {
      const readOnlyCompartment = new Compartment()
      return {
        readOnlyCompartment,
        extensions: [
          readOnlyCompartment.of(EditorState.readOnly.of(initialReadOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onDocChange(update.state.doc.toString())
          }),
        ],
      }
    },
  }
})

import HostsEditor from './HostsEditor'

function deferred() {
  let resolve!: (value: string) => void
  const promise = new Promise<string>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const content = () => document.querySelector('.cm-content')?.textContent

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  mocks.current = { id: 'group', type: 'group', include: ['local'] }
  mocks.list = [mocks.current, { id: 'local', type: 'local' }]
  mocks.handlers.clear()
  mocks.getHostsContent.mockReset().mockResolvedValue('original.test')
  mocks.setHostsContent.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('ignores an older group read that completes after a newer refresh', async () => {
  await act(async () => {
    render(<HostsEditor />)
  })
  const oldRead = deferred()
  mocks.getHostsContent.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce('latest.test')
  await act(async () => {
    mocks.handlers.get('hosts_content_changed')?.('local')
    await vi.advanceTimersByTimeAsync(50)
    mocks.handlers.get('hosts_content_changed_batch')?.(['local'])
    await vi.advanceTimersByTimeAsync(50)
  })
  expect(content()).toBe('latest.test')
  await act(async () => {
    oldRead.resolve('outdated.test')
  })
  expect(content()).toBe('latest.test')
})

it('keeps an unsaved local edit when an earlier read finishes', async () => {
  mocks.current = { id: 'local', type: 'local' }
  await act(async () => {
    render(<HostsEditor />)
  })
  const oldRead = deferred()
  mocks.getHostsContent.mockReturnValueOnce(oldRead.promise)
  await act(async () => {
    mocks.handlers.get('hosts_refreshed_by_id')?.('local')
  })
  await act(async () => {
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'editing.test' } })
  })
  await act(async () => {
    oldRead.resolve('outdated.test')
  })
  expect(content()).toBe('editing.test')
})

it('reloads a group when a referenced source disappears from the manifest', async () => {
  const ui = render(<HostsEditor />)
  await act(async () => {})
  expect(content()).toBe('original.test')
  mocks.list = [mocks.current]
  mocks.getHostsContent.mockResolvedValue('')
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  expect(content()).toBe('')
})

it('does not save the previous document into an entry that is still loading', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const nextRead = deferred()
  mocks.getHostsContent.mockReturnValueOnce(nextRead.promise)
  mocks.current = { id: 'next', type: 'local' }
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  expect(view.state.readOnly).toBe(true)
  // Programmatic changes bypass CodeMirror's readOnly facet, so the save
  // callback must also reject changes until the selected document is loaded.
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'wrong.test' } })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(mocks.setHostsContent).not.toHaveBeenCalled()
  await act(async () => {
    nextRead.resolve('next.test')
  })
  expect(content()).toBe('next.test')
})

it('coalesces a burst of group content events into one aggregation', async () => {
  render(<HostsEditor />)
  await act(async () => {})
  mocks.getHostsContent.mockClear().mockResolvedValue('batch.test')
  await act(async () => {
    for (const id of ['a', 'b', 'c']) mocks.handlers.get('hosts_content_changed')?.(id)
    mocks.handlers.get('hosts_content_changed_batch')?.(['a', 'b', 'c'])
    await vi.advanceTimersByTimeAsync(50)
  })
  expect(mocks.getHostsContent).toHaveBeenCalledTimes(1)
  expect(content()).toBe('batch.test')
})

it('flushes edits to their original entry before switching documents', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  await act(async () => {
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'saved.test' } })
  })
  mocks.current = { id: 'next', type: 'local' }
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  expect(mocks.setHostsContent).toHaveBeenCalledWith('local', 'saved.test')
})

it('flushes the loaded document before unmount cancels its pending save', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  await act(async () => {
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'last.test' } })
  })
  ui.unmount()
  expect(mocks.setHostsContent).toHaveBeenCalledWith('local', 'last.test')
})

it('clears the old document on a failed entry switch and allows retry', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  expect(content()).toBe('original.test')
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockRejectedValueOnce(new Error('disk unavailable'))
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  expect(content()).toBe('')
  expect(ui.getByRole('alert').textContent).toContain('disk unavailable')
  expect(EditorView.findFromDOM(document.querySelector('.cm-editor')!)!.state.readOnly).toBe(true)
  expect(mocks.setHostsContent).not.toHaveBeenCalled()
  mocks.getHostsContent.mockResolvedValueOnce('next.test')
  await act(async () => {
    fireEvent.click(ui.getByRole('button', { name: 'Retry' }))
  })
  expect(ui.queryByRole('alert')).toBeNull()
  expect(content()).toBe('next.test')
  expect(EditorView.findFromDOM(document.querySelector('.cm-editor')!)!.state.readOnly).toBe(false)
})

it.each([
  'hosts_refreshed',
  'hosts_refreshed_by_id',
  'hosts_content_changed',
  'hosts_content_changed_batch',
])('ignores an obsolete %s handler while another entry is loading', async (event) => {
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const staleHandler = mocks.handlers.get(event)!
  const nextRead = deferred()
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockReturnValueOnce(nextRead.promise)
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  const calls = mocks.getHostsContent.mock.calls.length
  await act(async () => {
    staleHandler(
      event === 'hosts_refreshed'
        ? { id: 'group' }
        : event === 'hosts_content_changed_batch'
          ? ['group']
          : 'group',
    )
    await vi.advanceTimersByTimeAsync(50)
    nextRead.resolve('next.test')
  })
  expect(mocks.getHostsContent).toHaveBeenCalledTimes(calls)
  expect(content()).toBe('next.test')
  expect(EditorView.findFromDOM(document.querySelector('.cm-editor')!)!.state.readOnly).toBe(false)
})

it('does not clear a loaded document when an obsolete source handler fires', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const staleHandler = mocks.handlers.get('hosts_refreshed_by_id')!
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockResolvedValueOnce('next.test')
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  await act(async () => {
    staleHandler('local')
  })
  expect(content()).toBe('next.test')
})

it('does not apply an old show-source offset to the current document', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const staleHandler = mocks.handlers.get('show_source')!
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockResolvedValueOnce('next.test')
  await act(async () => { ui.rerender(<HostsEditor />) })
  await act(async () => { staleHandler({ item_id: 'local', start: 2, end: 5 }) })
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  expect(view.state.selection.main.from).toBe(0)
  expect(view.state.selection.main.to).toBe(0)
  // A valid event delivered through the same old listener uses the current id.
  await act(async () => { staleHandler({ item_id: 'next', start: 1, end: 4 }) })
  expect(view.state.selection.main.from).toBe(1)
  expect(view.state.selection.main.to).toBe(4)
})

it('defers show-source offsets until the selected document has loaded', async () => {
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const nextRead = deferred()
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockReturnValueOnce(nextRead.promise)
  await act(async () => { ui.rerender(<HostsEditor />) })
  await act(async () => {
    mocks.handlers.get('show_source')!({ item_id: 'next', start: 1, end: 4 })
    nextRead.resolve('next.test')
  })
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  expect(view.state.selection.main.from).toBe(1)
  expect(view.state.selection.main.to).toBe(4)
})

it('retains the new target selection when an old target event arrives later', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const oldHandler = mocks.handlers.get('show_source')!
  const nextRead = deferred()
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockReturnValueOnce(nextRead.promise)
  await act(async () => { ui.rerender(<HostsEditor />) })
  await act(async () => {
    mocks.handlers.get('show_source')!({ item_id: 'next', start: 1, end: 4 })
    oldHandler({ item_id: 'local', start: 2, end: 5 })
    nextRead.resolve('next.test')
  })
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  expect(view.state.selection.main.from).toBe(1)
  expect(view.state.selection.main.to).toBe(4)
})
