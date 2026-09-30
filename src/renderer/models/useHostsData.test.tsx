// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { hostsDataAtom } from '@renderer/stores/hosts_data'
import { IHostsListObject } from '@common/data'
import { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  setList: vi.fn(),
  updateTrayTitle: vi.fn(),
  getBasicData: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@renderer/core/agent', () => ({ actions: mocks }))
vi.mock('@renderer/models/useI18n', () => ({ default: () => ({ lang: { fail: 'Failed' } }) }))
vi.mock('@renderer/core/notify', () => ({
  showErrorNotification: mocks.notify,
  getErrorMessage: (error: any, fallback: string) => error.reason || error.message || fallback,
}))
import useHostsData from './useHostsData'

const list = (id: string): IHostsListObject[] => [{ id, title: id, type: 'local' }]
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
function setup() {
  const store = createStore()
  store.set(hostsDataAtom, { list: list('original'), trashcan: [], version: 'test' })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return {
    store,
    ...renderHook(() => ({ first: useHostsData(), second: useHostsData() }), { wrapper }),
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.setList.mockResolvedValue(undefined)
  mocks.updateTrayTitle.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the saved list visible until persistence succeeds and preserves concurrent trashcan updates', async () => {
  const pending = deferred()
  mocks.setList.mockReturnValue(pending.promise)
  const { store, result } = setup()
  let save!: Promise<void>
  await act(async () => {
    save = result.current.first.setList(list('new'))
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('original'))
  expect(mocks.updateTrayTitle).not.toHaveBeenCalled()
  const trashcan = [{ data: list('deleted')[0], add_time_ms: 1, parent_id: null }]
  await act(async () => {
    store.set(hostsDataAtom, (data) => ({ ...data, trashcan }))
    pending.resolve()
    await save
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('new'))
  expect(store.get(hostsDataAtom).trashcan).toEqual(trashcan)
})

it('reports a failed save without changing state or running success follow-ups', async () => {
  mocks.setList.mockRejectedValue({ kind: 'parse', reason: 'Corrupt manifest' })
  const { store, result } = setup()
  const before = store.get(hostsDataAtom)
  await act(async () => {
    await expect(result.current.first.setList(list('new'))).rejects.toMatchObject({ kind: 'parse' })
  })
  expect(store.get(hostsDataAtom)).toBe(before)
  expect(mocks.notify).toHaveBeenCalledWith({ title: 'Failed', message: 'Corrupt manifest' })
  expect(mocks.updateTrayTitle).not.toHaveBeenCalled()
})

it('serializes saves across hook consumers, snapshots arguments and continues after failure', async () => {
  const pending = deferred()
  mocks.setList.mockReturnValueOnce(pending.promise)
  const { store, result } = setup()
  let first!: Promise<void>, second!: Promise<void>
  const next = list('second')
  await act(async () => {
    first = result.current.first.setList(list('first'))
    second = result.current.second.setList(next)
  })
  next[0].title = 'mutated after submission'
  expect(mocks.setList).toHaveBeenCalledTimes(1)
  await act(async () => {
    const rejected = expect(first).rejects.toThrow('disk full')
    pending.reject(new Error('disk full'))
    await rejected
    await second
  })
  expect(mocks.setList).toHaveBeenNthCalledWith(2, list('second'))
  expect(store.get(hostsDataAtom).list).toEqual(list('second'))
})

it('does not publish a stale load over a newer save', async () => {
  const pending = deferred<any>()
  mocks.getBasicData
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ list: list('new'), trashcan: [], version: 'test' })
  const { store, result } = setup()
  let load!: Promise<void>
  await act(async () => {
    load = result.current.first.loadHostsData()
  })
  await act(async () => {
    await result.current.second.setList(list('new'))
  })
  await act(async () => {
    pending.resolve({ list: list('stale'), trashcan: [], version: 'test' })
    await load
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('new'))
  expect(mocks.getBasicData).toHaveBeenCalledTimes(2)
})

it('keeps a successful save when only the tray refresh fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.updateTrayTitle.mockRejectedValue(new Error('tray unavailable'))
  const { store, result } = setup()
  await act(async () => {
    await result.current.first.setList(list('new'))
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('new'))
  expect(mocks.notify).toHaveBeenCalledWith({ title: 'Failed', message: 'tray unavailable' })
})
