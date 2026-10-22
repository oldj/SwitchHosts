// @vitest-environment jsdom

import type { IHostsListObject } from '@common/data'
import { EditorView } from '@codemirror/view'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: 'darwin',
  isApplying: false,
  current: { id: 'group', type: 'group', include: ['local'] } as IHostsListObject,
  list: [] as IHostsListObject[],
  getDataDir: vi.fn(),
  getHostsContent: vi.fn(),
  getSystemHosts: vi.fn(),
  setHostsContent: vi.fn(),
  applyDrafts: vi.fn(),
  notify: vi.fn(),
  handlers: new Map<string, (...args: any[]) => void>(),
}))
vi.mock('@renderer/core/agent', () => ({
  actions: {
    getDataDir: mocks.getDataDir,
    getHostsContent: mocks.getHostsContent,
    getSystemHosts: mocks.getSystemHosts,
    setHostsContent: mocks.setHostsContent,
  },
  agent: {
    get platform() {
      return mocks.platform
    },
  },
}))
vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: (event: string, handler: (...args: any[]) => void) => mocks.handlers.set(event, handler),
}))
vi.mock('@renderer/models/useHostsData', () => ({
  default: () => ({
    currentHosts: mocks.current,
    applyDrafts: mocks.applyDrafts,
    isApplying: mocks.isApplying,
    hostsData: { list: mocks.list },
    isReadOnly: (item: IHostsListObject) => item.type !== 'local',
  }),
}))
vi.mock('@renderer/models/useI18n', () => ({
  default: () => ({ lang: { fail: 'Read failed', history_retry: 'Retry' } }),
}))
vi.mock('@renderer/components/StatusBar', () => ({
  default: (props: any) =>
    props.pendingDraft ? (
      <button
        data-draft-action="apply"
        disabled={props.isApplying || props.isDiscarding}
        onClick={props.onDiscard}
      >
        Discard draft
      </button>
    ) : null,
}))
vi.mock('@renderer/components/ConfirmModal', () => ({
  default: (props: any) =>
    props.opened ? (
      <div role="dialog">
        <button onClick={props.onClose}>Cancel</button>
        <button
          onClick={() => {
            props.onConfirm()
            props.onClose()
          }}
        >
          Confirm discard
        </button>
      </div>
    ) : null,
}))
vi.mock('@renderer/core/notify', () => ({
  getErrorMessage: String,
  showErrorNotification: mocks.notify,
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
import { getEditorDrafts } from './editorDrafts'

function deferred() {
  let resolve!: (value: string) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<string>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const content = () => document.querySelector('.cm-content')?.textContent

let directorySequence = 0
beforeEach(() => {
  window.localStorage.clear()
  mocks.getDataDir.mockResolvedValue(`/test-data-${++directorySequence}`)
  vi.useFakeTimers()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  mocks.applyDrafts.mockReset().mockResolvedValue(true)
  mocks.notify.mockClear()
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  mocks.platform = 'darwin'
  mocks.isApplying = false
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
  vi.restoreAllMocks()
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

it('keeps the original draft and requests application when switching documents', async () => {
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
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(mocks.applyDrafts).toHaveBeenCalledTimes(1)
  expect((await getEditorDrafts()).read('local')?.content).toBe('saved.test')
})

it('retains the draft on unmount without requesting application', async () => {
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  await act(async () => {
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'last.test' } })
  })
  ui.unmount()
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
  expect((await getEditorDrafts()).read('local')?.content).toBe('last.test')
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
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  await act(async () => {
    staleHandler({ item_id: 'local', start: 2, end: 5 })
  })
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  expect(view.state.selection.main.from).toBe(0)
  expect(view.state.selection.main.to).toBe(0)
  // A valid event delivered through the same old listener uses the current id.
  await act(async () => {
    staleHandler({ item_id: 'next', start: 1, end: 4 })
  })
  expect(view.state.selection.main.from).toBe(1)
  expect(view.state.selection.main.to).toBe(4)
})

it('defers show-source offsets until the selected document has loaded', async () => {
  const ui = render(<HostsEditor />)
  await act(async () => {})
  const nextRead = deferred()
  mocks.current = { id: 'next', type: 'local' }
  mocks.getHostsContent.mockReturnValueOnce(nextRead.promise)
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
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
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  await act(async () => {
    mocks.handlers.get('show_source')!({ item_id: 'next', start: 1, end: 4 })
    oldHandler({ item_id: 'local', start: 2, end: 5 })
    nextRead.resolve('next.test')
  })
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  expect(view.state.selection.main.from).toBe(1)
  expect(view.state.selection.main.to).toBe(4)
})

async function editDocument(text = 'edited.test') {
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  })
}
async function renderEditor(platform = 'win32') {
  mocks.platform = platform
  mocks.current = { id: 'local', type: 'local' }
  const ui = render(<HostsEditor />)
  await act(async () => {})
  return ui
}
it.each(['win32', 'darwin', 'linux'])(
  'on %s journals typing and only requests application on explicit save/blur',
  async (platform) => {
    await renderEditor(platform)
    await editDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(mocks.applyDrafts).not.toHaveBeenCalled()
    expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
    await act(async () => {
      fireEvent.keyDown(document.querySelector('.cm-content')!, {
        key: 's',
        ctrlKey: platform !== 'darwin',
        metaKey: platform === 'darwin',
      })
    })
    expect(mocks.applyDrafts).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent.blur(document.querySelector('.cm-content')!)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(mocks.applyDrafts).toHaveBeenCalledTimes(2)
  },
)
it('leaves drafts pending when the window loses focus or closes', async () => {
  const ui = await renderEditor()
  await editDocument()
  await act(async () => {
    fireEvent.blur(document.querySelector('.cm-content')!)
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(1)
  })
  ui.unmount()
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
})
it('does not revive a queued blur save after the window is hidden and shown again', async () => {
  await renderEditor()
  await editDocument()
  await act(async () => {
    fireEvent.blur(document.querySelector('.cm-content')!)
    await vi.advanceTimersByTimeAsync(1)
  })
  const isCurrent = mocks.applyDrafts.mock.calls[0][0] as () => boolean
  expect(isCurrent()).toBe(true)
  const visibility = vi.spyOn(document, 'visibilityState', 'get')
  await act(async () => {
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(isCurrent()).toBe(false)
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
})
it('lets a switch own the application instead of also applying on editor blur', async () => {
  await renderEditor()
  await editDocument()
  const toggle = document.createElement('button')
  toggle.dataset.draftAction = 'apply'
  document.body.appendChild(toggle)
  await act(async () => {
    fireEvent.pointerDown(toggle)
    fireEvent.blur(document.querySelector('.cm-content')!, { relatedTarget: toggle })
    fireEvent.pointerUp(toggle)
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
  toggle.remove()
})
it('restores a pending draft after switching away and back despite a failed application', async () => {
  const ui = await renderEditor()
  mocks.applyDrafts.mockResolvedValue(false)
  await editDocument('recover.test')
  mocks.current = { id: 'next', type: 'local' }
  await act(async () => {
    ui.rerender(<HostsEditor />)
    await vi.advanceTimersByTimeAsync(1)
  })
  mocks.current = { id: 'local', type: 'local' }
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  expect(content()).toBe('recover.test')
})
it('keeps a recovered draft after editor unmount without applying it', async () => {
  const ui = await renderEditor()
  await editDocument('survives.test')
  ui.unmount()
  await act(async () => {
    render(<HostsEditor />)
  })
  expect(content()).toBe('survives.test')
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
})

it('requires confirmation before discarding and leaves the draft unchanged on cancel', async () => {
  const ui = await renderEditor()
  await editDocument()
  fireEvent.click(ui.getByText('Discard draft'))
  expect(ui.getByRole('dialog')).toBeTruthy()
  expect(content()).toBe('edited.test')
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
  fireEvent.click(ui.getByText('Cancel'))
  expect(ui.queryByRole('dialog')).toBeNull()
  expect(content()).toBe('edited.test')
  expect(mocks.getHostsContent).toHaveBeenCalledTimes(1)
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
})

it('keeps the existing view and draft visible until confirmed restore has loaded', async () => {
  const ui = await renderEditor()
  await editDocument()
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  const dom = view.contentDOM
  const read = deferred()
  mocks.getHostsContent.mockReturnValueOnce(read.promise)
  fireEvent.click(ui.getByText('Discard draft'))
  fireEvent.click(ui.getByText('Confirm discard'))
  expect(content()).toBe('edited.test')
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
  await act(async () => {
    read.resolve('saved.test')
  })
  expect(content()).toBe('saved.test')
  expect(document.querySelector('.cm-content')).toBe(dom)
  expect(EditorView.findFromDOM(document.querySelector('.cm-editor')!)).toBe(view)
  expect((await getEditorDrafts()).read('local')).toBeUndefined()
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
})

it('keeps the draft and current document when confirmed restore cannot read the source', async () => {
  const ui = await renderEditor()
  await editDocument()
  mocks.getHostsContent.mockRejectedValueOnce(new Error('read failed'))
  fireEvent.click(ui.getByText('Discard draft'))
  await act(async () => {
    fireEvent.click(ui.getByText('Confirm discard'))
  })
  expect(content()).toBe('edited.test')
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
  expect(ui.getByText('Discard draft').hasAttribute('disabled')).toBe(false)
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
})

it.each(['typing', 'switching'])(
  'does not discard newer work after %s during the restore read',
  async (action) => {
    const ui = await renderEditor()
    await editDocument()
    const read = deferred()
    mocks.getHostsContent.mockReturnValueOnce(read.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    fireEvent.click(ui.getByText('Confirm discard'))
    if (action === 'typing') await editDocument('newer.test')
    else {
      mocks.current = { id: 'next', type: 'local' }
      mocks.getHostsContent.mockResolvedValue('next.test')
      await act(async () => {
        ui.rerender(<HostsEditor />)
      })
    }
    await act(async () => {
      read.resolve('saved.test')
    })
    expect(content()).toBe(action === 'typing' ? 'newer.test' : 'next.test')
    expect((await getEditorDrafts()).read('local')?.content).toBe(
      action === 'typing' ? 'newer.test' : 'edited.test',
    )
    expect(mocks.applyDrafts).not.toHaveBeenCalled()
  },
)

it.each(['typing', 'switching'])(
  'releases an obsolete restore immediately after %s',
  async (action) => {
    const ui = await renderEditor()
    await editDocument()
    const read = deferred()
    mocks.getHostsContent.mockReturnValueOnce(read.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    fireEvent.click(ui.getByText('Confirm discard'))
    if (action === 'switching') {
      mocks.current = { id: 'next', type: 'local' }
      await act(async () => {
        ui.rerender(<HostsEditor />)
      })
    }
    await editDocument('newer.test')
    expect(ui.getByText('Discard draft').hasAttribute('disabled')).toBe(false)
    fireEvent.keyDown(document.querySelector('.cm-content')!, { key: 's', ctrlKey: true })
    expect(mocks.applyDrafts).toHaveBeenCalledTimes(1)
    await act(async () => {
      read.resolve('obsolete.test')
    })
    expect(content()).toBe('newer.test')
  },
)

it('dismisses a confirmation for an entry that is no longer selected', async () => {
  const ui = await renderEditor()
  await editDocument()
  fireEvent.click(ui.getByText('Discard draft'))
  mocks.current = { id: 'next', type: 'local' }
  await act(async () => {
    ui.rerender(<HostsEditor />)
  })
  expect(ui.queryByRole('dialog')).toBeNull()
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
  expect(mocks.applyDrafts).not.toHaveBeenCalled()
})

it.each(['success', 'failure'])(
  'ignores an obsolete restore %s while a newer restore is pending',
  async (outcome) => {
    const ui = await renderEditor()
    await editDocument('first draft')
    const oldRead = deferred()
    mocks.getHostsContent.mockReturnValueOnce(oldRead.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    fireEvent.click(ui.getByText('Confirm discard'))
    await editDocument('second draft')
    const newRead = deferred()
    mocks.getHostsContent.mockReturnValueOnce(newRead.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    fireEvent.click(ui.getByText('Confirm discard'))
    await act(async () => {
      if (outcome === 'success') oldRead.resolve('obsolete source')
      else oldRead.reject(new Error('obsolete failure'))
    })
    expect(content()).toBe('second draft')
    expect(ui.getByText('Discard draft').hasAttribute('disabled')).toBe(true)
    expect(mocks.notify).not.toHaveBeenCalled()
    await act(async () => {
      newRead.resolve('current source')
    })
    expect(content()).toBe('current source')
    expect((await getEditorDrafts()).read('local')).toBeUndefined()
  },
)

it.each(['confirmation', 'read'])(
  'cancels discard during %s when another application starts',
  async (phase) => {
    const ui = await renderEditor()
    await editDocument()
    const read = deferred()
    mocks.getHostsContent.mockReturnValueOnce(read.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    if (phase === 'read') fireEvent.click(ui.getByText('Confirm discard'))
    mocks.isApplying = true
    await act(async () => {
      ui.rerender(<HostsEditor />)
    })
    expect(ui.queryByRole('dialog')).toBeNull()
    await act(async () => {
      read.resolve('obsolete source')
    })
    expect(content()).toBe('edited.test')
    expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
  },
)

it('keeps the visible draft if removing its persistent journal fails', async () => {
  const ui = await renderEditor()
  await editDocument()
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
    throw new Error('storage unavailable')
  })
  fireEvent.click(ui.getByText('Discard draft'))
  await act(async () => {
    fireEvent.click(ui.getByText('Confirm discard'))
  })
  expect(content()).toBe('edited.test')
  expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
  expect(mocks.notify).toHaveBeenCalledTimes(1)
  expect(ui.getByText('Discard draft').hasAttribute('disabled')).toBe(false)
})

it.each(['switch away and back', 'unmount and remount'])(
  'does not revive an old restore after %s to the same draft',
  async (action) => {
    let ui = await renderEditor()
    await editDocument()
    const oldRead = deferred()
    mocks.getHostsContent.mockReturnValueOnce(oldRead.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    fireEvent.click(ui.getByText('Confirm discard'))
    if (action === 'switch away and back') {
      mocks.current = { id: 'next', type: 'local' }
      await act(async () => ui.rerender(<HostsEditor />))
      mocks.current = { id: 'local', type: 'local' }
      await act(async () => ui.rerender(<HostsEditor />))
    } else {
      ui.unmount()
      ui = await renderEditor()
    }
    expect(content()).toBe('edited.test')
    const newRead = deferred()
    mocks.getHostsContent.mockReturnValueOnce(newRead.promise)
    fireEvent.click(ui.getByText('Discard draft'))
    fireEvent.click(ui.getByText('Confirm discard'))
    await act(async () => oldRead.resolve('obsolete source'))
    expect(content()).toBe('edited.test')
    expect(ui.getByText('Discard draft').hasAttribute('disabled')).toBe(true)
    expect((await getEditorDrafts()).read('local')?.content).toBe('edited.test')
    expect(mocks.notify).not.toHaveBeenCalled()
    await act(async () => newRead.resolve('current source'))
    expect(content()).toBe('current source')
    expect((await getEditorDrafts()).read('local')).toBeUndefined()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(mocks.applyDrafts).not.toHaveBeenCalled()
  },
)
