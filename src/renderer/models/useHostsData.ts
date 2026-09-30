/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import version from '@/version.json'
import { IHostsListObject } from '@common/data'
import { flatten } from '@common/hostsFn'
import events from '@common/events'
import { actions, agent } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import { currentHostsAtom, hostsDataAtom } from '@renderer/stores/hosts_data'
import { atom, useAtom, useStore } from 'jotai'
import lodash from 'lodash'
import { useMemo } from 'react'
import useI18n from './useI18n'

export type ListChange = IHostsListObject[] | ((list: IHostsListObject[]) => IHostsListObject[])
// If both persistence and compensation fail, retain the actual applied switches
// across reloads. Keep saved metadata separate so it remains usable as a CAS base.
const appliedSelectionAtom = atom<Record<string, boolean> | null>(null)

// Share the queue across hook consumers in the same window/store. A failed
// save must not poison subsequent saves or let responses publish out of order.
const saves = new WeakMap<ReturnType<typeof useStore>, { tail: Promise<void>; revision: number }>()

export default function useHostsData() {
  const [savedHostsData, setHostsData] = useAtom(hostsDataAtom)
  const [currentHosts, setCurrentHosts] = useAtom(currentHostsAtom)
  const [appliedSelection, setAppliedSelection] = useAtom(appliedSelectionAtom)
  const hostsData = useMemo(() => {
    if (!appliedSelection) return savedHostsData
    const list = lodash.cloneDeep(savedHostsData.list)
    for (const node of flatten(list)) {
      if (node.id in appliedSelection) node.on = appliedSelection[node.id]
    }
    return { ...savedHostsData, list }
  }, [savedHostsData, appliedSelection])
  const store = useStore()
  const { lang } = useI18n()
  if (!saves.has(store)) saves.set(store, { tail: Promise.resolve(), revision: 0 })
  const queue = saves.get(store)!

  const loadHostsData = async () => {
    // Discard a read that started before a more recent save was requested.
    for (;;) {
      const revision = queue.revision
      await queue.tail
      const data = await actions.getBasicData()
      if (revision === queue.revision) {
        setHostsData(data)
        return
      }
    }
  }

  const notify = (error: unknown) => {
    const conflict = (error as { kind?: string })?.kind === 'conflict'
    showErrorNotification({
      title: lang.fail,
      message: conflict ? lang.storage_conflict : getErrorMessage(error, lang.fail),
    })
  }

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    queue.revision += 1
    const task = queue.tail.then(operation)
    queue.tail = task.then(
      () => {},
      () => {},
    )
    return task
  }

  const prepare = (change: ListChange) => {
    // Snapshot array arguments and their base at submission. Updaters are run
    // inside the queue against a fresh backend read, never a render-time closure.
    const snapshot = typeof change === 'function' ? change : lodash.cloneDeep(change)
    const base = lodash.cloneDeep(savedHostsData.list)
    return async () => {
      try {
        const expected: IHostsListObject[] =
          typeof snapshot === 'function' ? await actions.getList() : base
        const working = lodash.cloneDeep(typeof snapshot === 'function' ? expected : snapshot)
        const applied = store.get(appliedSelectionAtom)
        if (applied) {
          for (const node of flatten(working)) {
            if (node.id in applied) node.on = applied[node.id]
          }
        }
        const list = (typeof snapshot === 'function' ? snapshot(working) : working).filter(
          (i) => !i.is_sys,
        )
        return { list, expected }
      } catch (error) {
        notify(error)
        throw error
      }
    }
  }

  const persist = async (list: IHostsListObject[], expected: IHostsListObject[]) => {
    try {
      await actions.setList(list, expected)
    } catch (error) {
      notify(error)
      // A delete/restore/import may have bypassed this window's queue. The
      // backend rejects stale snapshots under its lock; refresh for a retry.
      if ((error as { kind?: string })?.kind === 'conflict') {
        await actions.getBasicData().then(setHostsData).catch(console.error)
      }
      throw error
    }
    setHostsData((previous) => ({ ...previous, list, version }))
    // Tray UI work must not hold up storage operations.
    void actions.updateTrayTitle().catch(notify)
  }

  const setList = (change: ListChange) => {
    const resolve = prepare(change)
    return enqueue(async () => {
      const { list, expected } = await resolve()
      await persist(list, expected)
      setAppliedSelection(null)
    })
  }

  const applyList = (change: ListChange = (list) => list): Promise<boolean> => {
    const resolve = prepare(change)
    return enqueue(async () => {
      // Fail before changing the system file when the latest list cannot be
      // read or aggregated. resolve() already reports its own read errors.
      const prepared = await resolve().catch(() => null)
      if (!prepared) return false
      const { list, expected } = prepared
      let result
      try {
        const content: string = await actions.getContentOfList(list)
        result = await actions.setSystemHosts(content)
      } catch (error) {
        notify(error)
        return false
      }
      if (!result.success) {
        if (result.code !== 'cancelled') {
          notify(
            new Error(
              result.code === 'no_access' ? lang.no_access_to_hosts : result.message || lang.fail,
            ),
          )
        }
        return false
      }
      try {
        await persist(list, expected)
        setAppliedSelection(null)
      } catch {
        try {
          const restored = await actions.restoreSystemHosts(result.old_content, result.new_content)
          if (!restored.success) throw new Error(restored.message || lang.fail)
          return false
        } catch (error) {
          // The OS write remains applied. Never signal an off/rollback state
          // unless compensation actually succeeded.
          console.error(error)
          const selection = Object.fromEntries(flatten(list).map((item) => [item.id, !!item.on]))
          setAppliedSelection(selection)
          showErrorNotification({ title: lang.fail, message: lang.hosts_applied_save_failed })
        }
      }
      const current = store.get(currentHostsAtom)
      const appliedCurrent = current && flatten(list).find((item) => item.id === current.id)
      if (appliedCurrent) {
        await Promise.resolve(
          agent.broadcast(events.set_hosts_on_status, appliedCurrent.id, appliedCurrent.on),
        ).catch(notify)
      }
      await Promise.resolve(
        agent.broadcast(events.tray_list_updated, store.get(appliedSelectionAtom)),
      ).catch(notify)
      return true
    })
  }

  const isHostsInTrashcan = (id: string): boolean => {
    return hostsData.trashcan.findIndex((i) => i.data.id === id) > -1
  }

  const isReadOnly = (hosts?: IHostsListObject | null): boolean => {
    hosts = hosts || currentHosts

    if (!hosts) {
      return true
    }

    if (hosts.id === '0') {
      return true // system hosts
    }

    if (hosts.type && ['group', 'remote', 'folder', 'trashcan'].includes(hosts.type)) {
      return true
    }

    if (isHostsInTrashcan(hosts.id)) {
      return true
    }

    // ..
    return false
  }

  return {
    hostsData,
    setHostsData,
    loadHostsData,

    setList,
    applyList,
    setAppliedSelection,

    currentHosts,
    setCurrentHosts,

    isHostsInTrashcan,
    isReadOnly,
  }
}
