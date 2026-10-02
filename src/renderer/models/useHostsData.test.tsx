// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { hostsDataAtom } from '@renderer/stores/hosts_data'
import events from '@common/events'
import { IApplicationRecovery, IHostsListObject } from '@common/data'
import { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  setList: vi.fn(),
  getApplicationRecovery: vi.fn(),
  finishHostsApplication: vi.fn(),
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
      hosts_application_unknown: 'Application state unknown',
    },
  }),
}))
vi.mock('@renderer/core/notify', () => ({
  showErrorNotification: mocks.notify,
  getErrorMessage: (error: any, fallback: string) => error.reason || error.message || fallback,
}))
import useHostsData from './useHostsData'

let disk: IHostsListObject[]
let recovery: IApplicationRecovery | null
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
  recovery = null
  mocks.getApplicationRecovery.mockImplementation(async () => structuredClone(recovery))
  mocks.finishHostsApplication.mockImplementation(async () => {
    recovery = null
    return null
  })
  mocks.getList.mockImplementation(async () => structuredClone(disk))
  mocks.getBasicData.mockImplementation(async () => ({
    list: structuredClone(disk),
    trashcan: [],
    version: 'test',
    application_recovery: structuredClone(recovery),
  }))
  mocks.setList.mockImplementation(async (next, expected) => {
    if (JSON.stringify(expected) !== JSON.stringify(disk)) throw { kind: 'conflict' }
    disk = structuredClone(next)
  })
  mocks.setSystemHosts.mockImplementation(async () => {
    // The apply command records pending recovery before replying. A dropped
    // restore/finish request must not leave the backend reporting null.
    recovery = { status: 'unknown' }
    return {
      success: true,
      old_content: 'original system file',
      new_content: 'applied system file',
    }
  })
  mocks.getContentOfList.mockResolvedValue('new managed content')
  mocks.restoreSystemHosts.mockImplementation(async () => {
    recovery = null
    return { success: true, application_recovery: null }
  })
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

it('keeps newer refresh data when loads from separate consumers finish out of order', async () => {
  const firstRead = deferred<any>()
  const secondRead = deferred<any>()
  mocks.getBasicData.mockReturnValueOnce(firstRead.promise).mockReturnValueOnce(secondRead.promise)
  const { store, result } = setup()
  let firstLoad!: Promise<void>, secondLoad!: Promise<void>
  await act(async () => {
    firstLoad = result.current.first.loadHostsData()
  })
  await act(async () => {
    secondLoad = result.current.second.loadHostsData()
  })
  const refreshed = {
    list: [{ id: 'domain', type: 'remote', last_attempt_ms: 200 }],
    trashcan: [{ data: list('deleted')[0], add_time_ms: 1, parent_id: null }],
    version: 'test',
    application_recovery: null,
  }
  await act(async () => {
    secondRead.resolve(refreshed)
    await secondLoad
  })
  await act(async () => {
    firstRead.resolve({
      list: [{ id: 'domain', type: 'remote', last_attempt_ms: 100 }],
      trashcan: [],
      version: 'test',
      application_recovery: { status: 'unknown' },
    })
    await firstLoad
  })
  expect(store.get(hostsDataAtom)).toEqual(refreshed)
  expect(result.current.first.applicationRecovery).toBeNull()
  expect(result.current.second.applicationRecovery).toBeNull()
  expect(mocks.getBasicData).toHaveBeenCalledTimes(2)
})

it('does not let a load retry after a save supersede a newer consumer reload', async () => {
  const firstRead = deferred<any>()
  const retryRead = deferred<any>()
  mocks.getBasicData
    .mockReturnValueOnce(firstRead.promise)
    .mockReturnValueOnce(retryRead.promise)
    .mockResolvedValueOnce({ list: list('refreshed'), trashcan: [], version: 'test' })
  const { store, result } = setup()
  let oldLoad!: Promise<void>
  await act(async () => {
    oldLoad = result.current.first.loadHostsData()
  })
  await act(async () => {
    await result.current.second.setList(list('saved'))
  })
  await act(async () => {
    firstRead.resolve({ list: list('original'), trashcan: [], version: 'test' })
  })
  expect(mocks.getBasicData).toHaveBeenCalledTimes(2)
  await act(async () => {
    await result.current.second.loadHostsData()
  })
  await act(async () => {
    retryRead.resolve({ list: list('saved'), trashcan: [], version: 'test' })
    await oldLoad
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('refreshed'))
  expect(mocks.getBasicData).toHaveBeenCalledTimes(3)
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
  let apply!: Promise<boolean | null>
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
  expect(mocks.broadcast).toHaveBeenCalledWith(events.tray_list_updated)
  expect(mocks.restoreSystemHosts).not.toHaveBeenCalled()
})

it('restores the exact pre-apply system file before reporting a reverted switch', async () => {
  const restored = deferred<{ success: boolean }>()
  mocks.setList.mockRejectedValue(new Error('disk full'))
  mocks.restoreSystemHosts.mockReturnValue(restored.promise)
  const { store, result } = setup()
  let apply!: Promise<boolean | null>
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
    [{ ...list('original')[0], on: true }],
  )
  expect(done).toBe(false)
  await act(async () => {
    restored.resolve({ success: true })
    expect(await apply).toBe(false)
  })
  expect(store.get(hostsDataAtom).list).toEqual(list('original'))
  expect(mocks.broadcast).not.toHaveBeenCalled()
})

it('retains a complete applied snapshot across window recreation and blocks unrelated saves', async () => {
  const main = setup()
  disk = [
    { id: 'a', on: true },
    { id: 'b', on: true },
  ]
  await act(async () =>
    main.store.set(hostsDataAtom, { list: structuredClone(disk), trashcan: [], version: 'test' }),
  )
  mocks.setList.mockRejectedValueOnce(new Error('disk full'))
  mocks.restoreSystemHosts.mockImplementation(async (_old, _new, applied) => {
    recovery = { status: 'applied', list: structuredClone(applied) }
    return { success: false, code: 'cancelled', application_recovery: recovery }
  })
  await act(async () => {
    expect(await main.result.current.first.applyList([...disk].reverse())).toBe(true)
  })
  expect(main.result.current.first.hostsData.list.map((node) => node.id)).toEqual(['b', 'a'])
  expect(main.store.get(hostsDataAtom).list.map((node) => node.id)).toEqual(['a', 'b'])
  const saves = mocks.setList.mock.calls.length
  await act(async () => {
    await expect(
      main.result.current.first.setList((items) => {
        items[0].title = 'Rename'
        return items
      }),
    ).rejects.toThrow('Applied but save and recovery failed')
  })
  expect(mocks.setList).toHaveBeenCalledTimes(saves)
  expect(main.result.current.first.applicationRecovery?.status).toBe('applied')
  const tray = setup()
  await act(async () => {
    await tray.result.current.first.loadHostsData()
  })
  expect(tray.result.current.first.hostsData.list.map((node) => node.id)).toEqual(['b', 'a'])
  tray.unmount()
  const reopenedTray = setup()
  await act(async () => {
    await reopenedTray.result.current.first.loadHostsData()
  })
  expect(reopenedTray.result.current.first.hostsData.list.map((node) => node.id)).toEqual([
    'b',
    'a',
  ])
  await act(async () => {
    expect(await main.result.current.first.reapplySavedList()).toBe(true)
  })
  expect(mocks.getContentOfList).toHaveBeenLastCalledWith(disk)
  expect(main.result.current.first.applicationRecovery).toBeNull()
  await act(async () => {
    await reopenedTray.result.current.first.loadHostsData()
  })
  expect(reopenedTray.result.current.first.hostsData.list.map((node) => node.id)).toEqual([
    'a',
    'b',
  ])
  expect(reopenedTray.result.current.first.applicationRecovery).toBeNull()
})

it.each(['content_changed', 'unreadable'])(
  'does not claim the old selection is applied after %s',
  async (code) => {
    mocks.setList.mockRejectedValue(new Error('disk full'))
    mocks.restoreSystemHosts.mockImplementation(async () => {
      recovery = { status: 'unknown' }
      return { success: false, code, application_recovery: recovery }
    })
    const { result } = setup()
    await act(async () => {
      expect(
        await result.current.first.applyList((items) => {
          items[0].on = true
          return items
        }),
      ).toBeNull()
    })
    expect(result.current.first.applicationRecovery).toEqual({ status: 'unknown' })
    expect(mocks.broadcast).not.toHaveBeenCalledWith(events.set_hosts_on_status, 'original', true)
    expect(mocks.notify).toHaveBeenCalledWith({
      title: 'Failed',
      message: 'Application state unknown',
    })
    await act(async () => {
      expect(await result.current.first.applyList()).toBeNull()
    })
    expect(mocks.setSystemHosts).toHaveBeenCalledTimes(1)
  },
)

it('retains unknown recovery after a dropped compensation request, reload and window recreation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.setList.mockRejectedValue(new Error('disk full'))
  mocks.restoreSystemHosts.mockRejectedValue(new Error('connection lost'))
  const { result } = setup()
  await act(async () => {
    expect(
      await result.current.first.applyList((items) => {
        items[0].on = true
        return items
      }),
    ).toBeNull()
  })
  expect(result.current.first.applicationRecovery?.status).toBe('unknown')
  expect(mocks.broadcast).toHaveBeenCalledWith(events.tray_list_updated)
  await act(async () => {
    await result.current.first.loadHostsData()
  })
  expect(result.current.first.applicationRecovery?.status).toBe('unknown')
  const reopened = setup()
  await act(async () => {
    await reopened.result.current.first.loadHostsData()
  })
  expect(reopened.result.current.first.applicationRecovery?.status).toBe('unknown')
  await act(async () => {
    await expect(reopened.result.current.first.setList((items) => items)).rejects.toThrow(
      'Application state unknown',
    )
  })
  mocks.setList.mockImplementation(async (next) => {
    disk = structuredClone(next)
  })
  await act(async () => {
    expect(await result.current.first.reapplySavedList()).toBe(true)
  })
  await act(async () => {
    await reopened.result.current.first.loadHostsData()
  })
  expect(reopened.result.current.first.applicationRecovery).toBeNull()
})

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
  let apply!: Promise<boolean | null>, edit!: Promise<void>
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

it('rejects an already queued tree snapshot after compensation fails', async () => {
  mocks.setList.mockRejectedValueOnce(new Error('disk full'))
  mocks.restoreSystemHosts.mockImplementation(async (_old, _new, applied) => {
    recovery = { status: 'applied', list: structuredClone(applied) }
    return { success: false, application_recovery: recovery }
  })
  const { result } = setup()
  await act(async () => {
    const apply = result.current.first.applyList((items) => {
      items[0].on = true
      return items
    })
    const treeChange = result.current.second.setList(list('original'))
    const rejected = expect(treeChange).rejects.toThrow('Applied but save and recovery failed')
    await apply
    await rejected
  })
  expect(mocks.setList).toHaveBeenCalledTimes(1)
  expect(result.current.first.hostsData.list[0].on).toBe(true)
  expect(result.current.first.applicationRecovery?.status).toBe('applied')
})

it('keeps the application unknown if system hosts change between persistence and acknowledgement', async () => {
  mocks.finishHostsApplication.mockImplementation(async () => {
    recovery = { status: 'unknown' }
    return recovery
  })
  const { result } = setup()
  await act(async () => {
    expect(await result.current.first.applyList()).toBeNull()
  })
  expect(result.current.first.applicationRecovery?.status).toBe('unknown')
  expect(mocks.restoreSystemHosts).not.toHaveBeenCalled()
})

it('retains pending recovery if the acknowledgement request never reaches the backend', async () => {
  mocks.finishHostsApplication.mockRejectedValue(new Error('connection lost'))
  const { result } = setup()
  await act(async () => {
    expect(await result.current.first.applyList()).toBeNull()
  })
  await act(async () => {
    await result.current.first.loadHostsData()
  })
  expect(result.current.first.applicationRecovery?.status).toBe('unknown')
})

it('keeps earlier recovery when a failed explicit reapply is compensated', async () => {
  recovery = { status: 'applied', list: [{ ...list('original')[0], on: true }] }
  const previous = structuredClone(recovery)
  mocks.setList.mockRejectedValue(new Error('disk full'))
  mocks.restoreSystemHosts.mockImplementation(async () => {
    recovery = previous
    return { success: true, application_recovery: previous }
  })
  const { result } = setup()
  await act(async () => {
    expect(await result.current.first.reapplySavedList()).toBeNull()
  })
  expect(result.current.first.applicationRecovery).toEqual(previous)
  expect(result.current.first.hostsData.list[0].on).toBe(true)
})
