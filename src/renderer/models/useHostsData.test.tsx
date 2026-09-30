// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { hostsDataAtom } from '@renderer/stores/hosts_data'
import events from '@common/events'
import { IHostsListObject } from '@common/data'
import { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  setList: vi.fn(),
  getList: vi.fn(),
  getContentOfList: vi.fn(),
  setSystemHosts: vi.fn(),
  restoreSystemHosts: vi.fn(),
  broadcast: vi.fn(),
  updateTrayTitle: vi.fn(),
  getBasicData: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@renderer/core/agent', () => ({ actions: mocks, agent: { broadcast: mocks.broadcast } }))
vi.mock('@renderer/models/useI18n', () => ({
  default: () => ({
    lang: {
      fail: 'Failed',
      storage_conflict: 'List changed; retry',
      hosts_applied_save_failed: 'Applied but save and recovery failed',
    },
  }),
}))
vi.mock('@renderer/core/notify', () => ({
  showErrorNotification: mocks.notify,
  getErrorMessage: (error: any, fallback: string) => error.reason || error.message || fallback,
}))
import useHostsData from './useHostsData'

let disk: IHostsListObject[]
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
  disk = list('original')
  mocks.getList.mockImplementation(async () => structuredClone(disk))
  mocks.getBasicData.mockImplementation(async () => ({
    list: structuredClone(disk),
    trashcan: [],
    version: 'test',
  }))
  mocks.setList.mockImplementation(async (next, expected) => {
    if (JSON.stringify(expected) !== JSON.stringify(disk)) throw { kind: 'conflict' }
    disk = structuredClone(next)
  })
  mocks.setSystemHosts.mockResolvedValue({
    success: true,
    old_content: 'original system file',
    new_content: 'applied system file',
  })
  mocks.getContentOfList.mockResolvedValue('new managed content')
  mocks.restoreSystemHosts.mockResolvedValue({ success: true })
  mocks.broadcast.mockResolvedValue(undefined)
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
  expect(mocks.setList).toHaveBeenNthCalledWith(2, list('second'), list('original'))
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

it('preserves independent edits submitted through two consumers while the first save is pending', async () => {
  const pending = deferred()
  const { store, result } = setup()
  disk = [...list('a'), ...list('b')]
  await act(async () =>
    store.set(hostsDataAtom, { list: structuredClone(disk), trashcan: [], version: 'test' }),
  )
  mocks.setList.mockImplementationOnce(async (next) => {
    await pending.promise
    disk = structuredClone(next)
  })
  let first!: Promise<void>, second!: Promise<void>
  await act(async () => {
    first = result.current.first.setList((items) => {
      items[0].title = 'New A'
      return items
    })
    second = result.current.second.setList((items) => {
      items[1].title = 'New B'
      return items
    })
  })
  expect(mocks.setList).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve()
    await Promise.all([first, second])
  })
  expect(disk.map((item) => item.title)).toEqual(['New A', 'New B'])
  expect(store.get(hostsDataAtom).list).toEqual(disk)
})

it('rejects an obsolete whole-list snapshot instead of overwriting a successful save', async () => {
  const { store, result } = setup()
  let first!: Promise<void>, second!: Promise<void>
  await act(async () => {
    first = result.current.first.setList(list('first'))
    second = result.current.second.setList(list('second'))
    const rejected = expect(second).rejects.toMatchObject({ kind: 'conflict' })
    await first
    await rejected
  })
  expect(disk).toEqual(list('first'))
  expect(store.get(hostsDataAtom).list).toEqual(disk)
  expect(mocks.notify).toHaveBeenCalledWith({ title: 'Failed', message: 'List changed; retry' })
})

it('does not resurrect a deleted item when a queued snapshot reaches the backend after deletion', async () => {
  const pending = deferred()
  const { store, result } = setup()
  mocks.setList.mockImplementationOnce(async () => {
    await pending.promise
    throw new Error('first save failed')
  })
  let first!: Promise<void>, stale!: Promise<void>
  await act(async () => {
    first = result.current.first.setList(list('edit'))
    stale = result.current.second.setList(list('original'))
  })
  // A move-to-trash command commits while this window still has an old list.
  disk = []
  await act(async () => {
    const failure = expect(first).rejects.toThrow('first save failed')
    const conflict = expect(stale).rejects.toMatchObject({ kind: 'conflict' })
    pending.resolve()
    await failure
    await conflict
  })
  expect(disk).toEqual([])
  expect(store.get(hostsDataAtom).list).toEqual([])
})

it('does not wait for the tray to finish before persisting another edit', async () => {
  const tray = deferred()
  mocks.updateTrayTitle.mockReturnValue(tray.promise)
  const { result } = setup()
  await act(async () => {
    await result.current.first.setList((items) => {
      items[0].title = 'A'
      return items
    })
    await result.current.second.setList((items) => {
      items[0].url = 'B'
      return items
    })
  })
  expect(disk[0]).toMatchObject({ title: 'A', url: 'B' })
  tray.resolve()
})

it('waits for persistence before announcing a successful apply', async () => {
  const pending = deferred()
  mocks.setList.mockReturnValue(pending.promise)
  const { result } = setup()
  let apply!: Promise<boolean>
  await act(async () => {
    apply = result.current.first.applyList((items) => {
      items[0].on = true
      return items
    })
  })
  expect(mocks.broadcast).not.toHaveBeenCalled()
  await act(async () => {
    pending.resolve()
    expect(await apply).toBe(true)
  })
  expect(mocks.broadcast).toHaveBeenCalledWith(events.tray_list_updated, null)
  expect(mocks.restoreSystemHosts).not.toHaveBeenCalled()
})

it('restores the exact pre-apply system file before reporting a reverted switch', async () => {
  const restored = deferred<{ success: boolean }>()
  mocks.setList.mockRejectedValue(new Error('disk full'))
  mocks.restoreSystemHosts.mockReturnValue(restored.promise)
  const { store, result } = setup()
  let apply!: Promise<boolean>
  let done = false
  await act(async () => {
    apply = result.current.first.applyList((items) => {
      items[0].on = true
      return items
    })
    void apply.then(() => {
      done = true
    })
  })
  expect(mocks.setSystemHosts).toHaveBeenCalledWith('new managed content')
  expect(mocks.restoreSystemHosts).toHaveBeenCalledWith(
    'original system file',
    'applied system file',
  )
  expect(done).toBe(false)
  await act(async () => {
    restored.resolve({ success: true })
    expect(await apply).toBe(false)
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('original'))
  expect(mocks.broadcast).not.toHaveBeenCalled()
})

it.each(['rejected', 'cancelled'])(
  'keeps applied switches visible when compensation is %s',
  async (failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.setList.mockRejectedValue(new Error('disk full'))
    if (failure === 'rejected') mocks.restoreSystemHosts.mockRejectedValue(new Error('no access'))
    else mocks.restoreSystemHosts.mockResolvedValue({ success: false, code: 'cancelled' })
    const { store, result } = setup()
    await act(async () => {
      expect(
        await result.current.first.applyList((items) => {
          items[0].on = true
          return items
        }),
      ).toBe(true)
    })
    expect(result.current.first.hostsData.list[0].on).toBe(true)
    expect(store.get(hostsDataAtom).list[0].on).not.toBe(true) // saved metadata is still old
    expect(mocks.broadcast).toHaveBeenCalledWith(events.tray_list_updated, { original: true })
    expect(mocks.notify).toHaveBeenCalledWith({
      title: 'Failed',
      message: 'Applied but save and recovery failed',
    })
    await act(async () => {
      await result.current.first.loadHostsData()
    })
    expect(result.current.first.hostsData.list[0].on).toBe(true)
    // A later successful apply reconciles saved and visible state.
    mocks.setList.mockResolvedValue(undefined)
    await act(async () => {
      await result.current.first.applyList((items) => {
        items[0].on = false
        return items
      })
    })
    expect(result.current.first.hostsData.list[0].on).toBe(false)
    expect(mocks.broadcast).toHaveBeenLastCalledWith(events.tray_list_updated, null)
  },
)

it('does not persist or compensate a cancelled system apply', async () => {
  mocks.setSystemHosts.mockResolvedValue({ success: false, code: 'cancelled' })
  const { result } = setup()
  await act(async () => {
    expect(await result.current.first.applyList()).toBe(false)
  })
  expect(mocks.setList).not.toHaveBeenCalled()
  expect(mocks.restoreSystemHosts).not.toHaveBeenCalled()
  expect(mocks.notify).not.toHaveBeenCalled()
})

it('does not write system hosts when the latest list cannot be read', async () => {
  mocks.getList.mockRejectedValue(new Error('corrupt manifest'))
  const { result } = setup()
  await act(async () => {
    expect(await result.current.first.applyList()).toBe(false)
  })
  expect(mocks.setSystemHosts).not.toHaveBeenCalled()
  expect(mocks.setList).not.toHaveBeenCalled()
  expect(mocks.notify).toHaveBeenCalledWith({ title: 'Failed', message: 'corrupt manifest' })
})

it('serializes a toggle and an independent edit using the newly saved selection', async () => {
  const pending = deferred<any>()
  mocks.setSystemHosts.mockReturnValue(pending.promise)
  const { result } = setup()
  let apply!: Promise<boolean>, edit!: Promise<void>
  await act(async () => {
    apply = result.current.first.applyList((items) => {
      items[0].on = true
      return items
    })
    edit = result.current.second.setList((items) => {
      items[0].title = 'Edited'
      return items
    })
  })
  expect(mocks.setList).not.toHaveBeenCalled()
  await act(async () => {
    pending.resolve({ success: true, old_content: 'before', new_content: 'after' })
    await apply
    await edit
  })
  expect(disk[0]).toMatchObject({ title: 'Edited', on: true })
})

it('does not report an applied selection as failed when only its UI broadcast fails', async () => {
  mocks.broadcast.mockRejectedValue(new Error('event unavailable'))
  const { result } = setup()
  await act(async () => {
    expect(await result.current.first.applyList()).toBe(true)
  })
  expect(mocks.restoreSystemHosts).not.toHaveBeenCalled()
  expect(mocks.notify).toHaveBeenCalledWith({ title: 'Failed', message: 'event unavailable' })
})

it('preserves the applied switches in an already queued tree snapshot after compensation fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.setList.mockRejectedValueOnce(new Error('disk full'))
  mocks.restoreSystemHosts.mockResolvedValue({ success: false, code: 'cancelled' })
  const { result } = setup()
  await act(async () => {
    const apply = result.current.first.applyList((items) => {
      items[0].on = true
      return items
    })
    const treeChange = result.current.second.setList(list('original'))
    await apply
    await treeChange
  })
  expect(disk[0].on).toBe(true)
  expect(result.current.first.hostsData.list[0].on).toBe(true)
})
