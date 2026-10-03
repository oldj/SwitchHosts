// @vitest-environment jsdom

import type { IHostsListObject } from '@common/data'
import { MantineProvider } from '@mantine/core'
import { currentHostsAtom } from '@renderer/stores/hosts_data'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Handler = (...args: any[]) => unknown

const mocks = vi.hoisted(() => ({
  actions: { getHostsContent: vi.fn(), refreshHosts: vi.fn() },
  hostsData: { list: [] as IHostsListObject[] },
  handlers: new Map<string, Handler>(),
  notify: vi.fn(),
}))

vi.mock('@renderer/core/agent', () => ({
  actions: mocks.actions,
  agent: { broadcast: vi.fn() },
}))
vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler),
}))
vi.mock('@renderer/core/notify', () => ({
  getErrorMessage: (error: Error, fallback: string) => error.message || fallback,
  showSuccessNotification: mocks.notify,
  showErrorNotification: mocks.notify,
}))
vi.mock('@renderer/models/useHostsData', async () => {
  const { useAtom } = await import('jotai')
  const { currentHostsAtom } = await import('@renderer/stores/hosts_data')
  return {
    default: function useHostsDataMock() {
      const [currentHosts, setCurrentHosts] = useAtom(currentHostsAtom)
      return {
        currentHosts,
        setCurrentHosts,
        hostsData: mocks.hostsData,
        isHostsInTrashcan: () => false,
        loadHostsData: vi.fn(),
      }
    },
  }
})
vi.mock('@renderer/models/useI18n', async () => {
  const { I18N } = await import('@common/i18n')
  const i18n = new I18N('en')
  return { default: () => ({ lang: i18n.lang, i18n, locale: 'en' }) }
})
vi.mock('@renderer/components/ItemIcon', () => ({ default: () => null }))
vi.mock('@renderer/components/ConfirmModal', () => ({ default: () => null }))
vi.mock('./SystemHostsPanel', () => ({ default: () => null }))

import RightPanel from './index'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }),
})
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const first: IHostsListObject = {
  id: 'a',
  type: 'remote',
  source: 'domain',
  title: 'First',
  domains: ['first.example'],
}
const second: IHostsListObject = {
  id: 'b',
  type: 'remote',
  source: 'domain',
  title: 'Second',
  domains: ['second.example'],
}
const content = (count: number) =>
  Array.from({ length: count }, (_, index) => `127.0.0.1 host${index}.example`).join('\n')
const readCount = () => screen.queryByText('Rules')?.parentElement?.textContent
const refreshButton = () => screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function setup(item: IHostsListObject = first) {
  const store = createStore()
  store.set(currentHostsAtom, item)
  render(
    <Provider store={store}>
      <MantineProvider>
        <RightPanel />
      </MantineProvider>
    </Provider>,
  )
  return (next: IHostsListObject | null) => act(() => store.set(currentHostsAtom, next))
}

beforeEach(() => {
  mocks.hostsData.list = [first, second]
  mocks.handlers.clear()
  mocks.notify.mockClear()
  mocks.actions.getHostsContent.mockReset().mockResolvedValue('')
  mocks.actions.refreshHosts.mockReset().mockResolvedValue({ success: true })
})
afterEach(cleanup)

it('tracks refreshes per item across selection changes and independent completions', async () => {
  const pendingFirst = deferred<{ success: boolean }>()
  const pendingSecond = deferred<{ success: boolean }>()
  mocks.actions.refreshHosts.mockImplementation((id) =>
    id === first.id ? pendingFirst.promise : pendingSecond.promise,
  )
  const select = setup()
  fireEvent.click(refreshButton())
  expect(refreshButton().disabled).toBe(true)
  select(second)
  expect(refreshButton().disabled).toBe(false)
  fireEvent.click(refreshButton())
  expect(mocks.actions.refreshHosts.mock.calls).toEqual([[first.id], [second.id]])
  select(first)
  expect(refreshButton().disabled).toBe(true)
  await act(async () => pendingSecond.resolve({ success: true }))
  expect(refreshButton().disabled).toBe(true)
  select(second)
  expect(refreshButton().disabled).toBe(false)
  select(first)
  expect(refreshButton().disabled).toBe(true)
  await act(async () => pendingFirst.resolve({ success: true }))
  expect(refreshButton().disabled).toBe(false)
})

it('hides the previous item count while the newly selected item is loading', async () => {
  const pending = deferred<string>()
  mocks.actions.getHostsContent.mockImplementation((id) =>
    id === first.id ? Promise.resolve(content(1)) : pending.promise,
  )
  const select = setup()
  await waitFor(() => expect(readCount()).toBe('Rules1'))
  select(second)
  expect(readCount()).toBeUndefined()
  await act(async () => pending.resolve(content(2)))
  expect(readCount()).toBe('Rules2')
})

it.each(['success', 'failure'])(
  'ignores an older same-item count response after a newer read (%s)',
  async (outcome) => {
    const older = deferred<string>()
    const newer = deferred<string>()
    mocks.actions.getHostsContent
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    setup()
    act(() => mocks.handlers.get('hosts_content_changed')?.(first.id))
    await act(async () => newer.resolve(content(2)))
    expect(readCount()).toBe('Rules2')
    await act(async () => {
      if (outcome === 'success') older.resolve(content(1))
      else older.reject(new Error('old read failed'))
    })
    expect(readCount()).toBe('Rules2')
  },
)

it('ignores a pending count read after selecting a different item', async () => {
  const older = deferred<string>()
  const newer = deferred<string>()
  mocks.actions.getHostsContent
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise)
  const select = setup()
  select(second)
  await act(async () => older.resolve(content(1)))
  expect(readCount()).toBeUndefined()
  await act(async () => newer.resolve(content(2)))
  expect(readCount()).toBe('Rules2')
})

it('renders imported malformed domain fields without crashing the details panel', async () => {
  const imported = {
    ...first,
    domains: ['valid.example', null, { invalid: true }],
    domain_results: [
      null,
      { domain: 'valid.example', status: 'failed' },
      { domain: {}, status: 'resolved', ips: ['127.0.0.1'] },
    ],
  } as unknown as IHostsListObject
  mocks.hostsData.list = [imported]
  setup(imported)
  await waitFor(() => expect(mocks.actions.getHostsContent).toHaveBeenCalledWith(first.id))
  expect(screen.getByTestId('right-panel-title').textContent).toBe('First')
  expect(screen.getAllByText('valid.example').length).toBeGreaterThan(0)
  expect(refreshButton().disabled).toBe(false)
})

const oldSnapshot = {
  ...first,
  last_attempt_ms: 100,
  last_attempt: 'OLDER-ATTEMPT',
  last_refresh_ms: 100,
  last_refresh: 'OLDER-SUCCESS',
  domain_results: [{ domain: 'first.example', status: 'resolved', ips: ['1.1.1.1'] }],
}

it('ignores an older response after receiving newer refresh metadata', async () => {
  const pending = deferred<any>()
  mocks.actions.refreshHosts.mockReturnValueOnce(pending.promise)
  setup()
  fireEvent.click(refreshButton())
  act(() =>
    mocks.handlers.get('hosts_refreshed')?.({
      ...oldSnapshot,
      last_attempt_ms: 200,
      last_attempt: 'NEWER-ATTEMPT',
      last_refresh_ms: 200,
      last_refresh: 'NEWER-SUCCESS',
    }),
  )
  expect(screen.queryByText('NEWER-ATTEMPT')).not.toBeNull()
  await act(async () => pending.resolve({ success: true, data: oldSnapshot }))
  expect(screen.queryByText('NEWER-ATTEMPT')).not.toBeNull()
  expect(screen.queryByText('OLDER-ATTEMPT')).toBeNull()
})

it('ignores results from an old saved domain list', async () => {
  const select = setup()
  select({ ...first, domains: ['new.example'], domain_results: [] })
  expect(screen.queryByText('first.example')).toBeNull()
  act(() => mocks.handlers.get('hosts_refreshed')?.(oldSnapshot))
  expect(screen.queryAllByText('new.example').length).toBeGreaterThan(0)
  expect(screen.queryByText('first.example')).toBeNull()
  expect(screen.queryByText('OLDER-ATTEMPT')).toBeNull()
})

it('ignores a refresh from the previous saved source', async () => {
  const select = setup()
  select({
    ...first,
    source: 'url',
    url: 'https://new.example/hosts',
    domains: undefined,
    domain_results: [],
  })
  expect(screen.queryByText('OLDER-SUCCESS')).toBeNull()
  act(() => mocks.handlers.get('hosts_refreshed')?.(oldSnapshot))
  expect(screen.queryByText('https://new.example/hosts')).not.toBeNull()
  expect(screen.queryByText('OLDER-SUCCESS')).toBeNull()
})

it('renders safe fallbacks for malformed imported refresh timestamps', async () => {
  const imported = { ...first, last_attempt: {}, last_refresh: [] } as unknown as IHostsListObject
  mocks.hostsData.list = [imported]
  setup(imported)
  await waitFor(() => expect(mocks.actions.getHostsContent).toHaveBeenCalledWith(first.id))
  expect(screen.getByText('N/A')).toBeTruthy()
  expect(screen.queryByText('Last attempt')).toBeNull()
})
