/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import version from '@/version.json'
import { IApplicationRecovery, IHostsListObject } from '@common/data'
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
// Cached only for rendering; the backend owns the session-wide recovery state.
const applicationRecoveryAtom = atom<IApplicationRecovery | null>(null)

// Share the queue across hook consumers in the same window/store. A failed
// save must not poison subsequent saves or let responses publish out of order.
const saves = new WeakMap<
  ReturnType<typeof useStore>,
  { tail: Promise<void>; revision: number; loadGeneration: number }
>()

export default function useHostsData() {
  const [savedHostsData, setHostsData] = useAtom(hostsDataAtom)
  const [savedCurrentHosts, setCurrentHosts] = useAtom(currentHostsAtom)
  const [applicationRecovery, setApplicationRecovery] = useAtom(applicationRecoveryAtom)
  const hostsData = useMemo(
    () =>
      applicationRecovery?.status === 'applied'
        ? { ...savedHostsData, list: applicationRecovery.list }
        : savedHostsData,
    [savedHostsData, applicationRecovery],
  )
  const currentHosts =
    applicationRecovery?.status === 'applied' && savedCurrentHosts
      ? flatten(applicationRecovery.list).find((item) => item.id === savedCurrentHosts.id) ||
        savedCurrentHosts
      : savedCurrentHosts
  const store = useStore()
  const { lang } = useI18n()
  if (!saves.has(store)) {
    saves.set(store, { tail: Promise.resolve(), revision: 0, loadGeneration: 0 })
  }
  const queue = saves.get(store)!

  const loadHostsData = async () => {
    // Background refreshes can trigger overlapping loads in separate consumers.
    // Only the latest load may publish; saves still make that load retry.
    const generation = ++queue.loadGeneration
    for (;;) {
      const revision = queue.revision
      await queue.tail
      if (generation !== queue.loadGeneration) return
      const data = await actions.getBasicData()
      if (generation !== queue.loadGeneration) return
      if (revision === queue.revision) {
        setHostsData(data)
        setApplicationRecovery(data.application_recovery ?? null)
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

  const prepare = (change: ListChange, resolving = false) => {
    // Snapshot array arguments and their base at submission. Updaters are run
    // inside the queue against a fresh backend read, never a render-time closure.
    const snapshot = typeof change === 'function' ? change : lodash.cloneDeep(change)
    const base = lodash.cloneDeep(savedHostsData.list)
    return async () => {
      try {
        const recovery: IApplicationRecovery | null = await actions.getApplicationRecovery()
        setApplicationRecovery(recovery)
        // Ordinary edits must not silently acknowledge or overwrite an apply
        // whose persistence/recovery failed. Explicit reapply uses saved data.
        if (recovery && !resolving) {
          throw new Error(
            recovery.status === 'unknown'
              ? lang.hosts_application_unknown
              : lang.hosts_applied_save_failed,
          )
        }
        const expected: IHostsListObject[] =
          typeof snapshot === 'function' ? await actions.getList() : base
        const working = lodash.cloneDeep(typeof snapshot === 'function' ? expected : snapshot)
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
        await actions
          .getBasicData()
          .then((data) => {
            setHostsData(data)
            setApplicationRecovery(data.application_recovery ?? null)
          })
          .catch(console.error)
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
    })
  }

  const apply = (change: ListChange, resolving = false): Promise<boolean | null> => {
    const resolve = prepare(change, resolving)
    return enqueue(async () => {
      // Fail before changing the system file when the latest list cannot be
      // read or aggregated. resolve() already reports its own read errors.
      const prepared = await resolve().catch(() => null)
      if (!prepared) return store.get(applicationRecoveryAtom) ? null : false
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
      } catch {
        let recovery: IApplicationRecovery | null
        try {
          const restored = await actions.restoreSystemHosts(
            result.old_content,
            result.new_content,
            list,
            result.old_content_bytes,
          )
          if (restored.success) {
            setApplicationRecovery(restored.application_recovery ?? null)
            return restored.application_recovery ? null : false
          }
          // The backend re-reads system hosts before returning this view. In
          // particular, content_changed must never be presented as our apply.
          recovery = restored.application_recovery ?? { status: 'unknown' }
        } catch (error) {
          console.error(error)
          recovery = { status: 'unknown' }
        }
        setApplicationRecovery(recovery)
        showErrorNotification({
          title: lang.fail,
          message:
            recovery?.status === 'applied'
              ? lang.hosts_applied_save_failed
              : lang.hosts_application_unknown,
        })
        await Promise.resolve(agent.broadcast(events.tray_list_updated)).catch(notify)
        return recovery?.status === 'applied' ? true : null
      }
      // Verifies the system content before clearing any prior pending state.
      // A metadata-only save never reaches this acknowledgement.
      let recovery: IApplicationRecovery | null
      try {
        recovery = await actions.finishHostsApplication(result.new_content)
      } catch (error) {
        notify(error)
        recovery = { status: 'unknown' }
      }
      setApplicationRecovery(recovery)
      if (recovery) {
        showErrorNotification({ title: lang.fail, message: lang.hosts_application_unknown })
        return null
      }
      const current = store.get(currentHostsAtom)
      const appliedCurrent = current && flatten(list).find((item) => item.id === current.id)
      if (appliedCurrent) {
        await Promise.resolve(
          agent.broadcast(events.set_hosts_on_status, appliedCurrent.id, appliedCurrent.on),
        ).catch(notify)
      }
      await Promise.resolve(agent.broadcast(events.tray_list_updated)).catch(notify)
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
    applyList: (change: ListChange = (list) => list) => apply(change),
    reapplySavedList: () => apply((list) => list, true),
    applicationRecovery,

    currentHosts,
    setCurrentHosts,

    isHostsInTrashcan,
    isReadOnly,
  }
}
