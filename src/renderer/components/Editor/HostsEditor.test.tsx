// @vitest-environment jsdom

import type { IHostsListObject } from '@common/data'
import { EditorView } from '@codemirror/view'
import { act, cleanup, render } from '@testing-library/react'
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
vi.mock('@renderer/models/useI18n', () => ({ default: () => ({ lang: {} }) }))
vi.mock('@renderer/components/StatusBar', () => ({ default: () => null }))
vi.mock('@renderer/core/notify', () => ({
  getErrorMessage: String,
  showErrorNotification: vi.fn(),
}))
vi.mock('ahooks', () => ({ useDebounceFn: (run: (...args: any[]) => void) => ({ run }) }))
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
})

it('ignores an older group read that completes after a newer refresh', async () => {
  await act(async () => {
    render(<HostsEditor />)
  })
  const oldRead = deferred()
  mocks.getHostsContent.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce('latest.test')
  await act(async () => {
    mocks.handlers.get('hosts_content_changed')?.('local')
    mocks.handlers.get('hosts_content_changed_batch')?.(['local'])
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
