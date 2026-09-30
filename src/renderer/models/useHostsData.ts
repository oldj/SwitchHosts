/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import version from '@/version.json'
import { IHostsListObject } from '@common/data'
import { actions } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import { currentHostsAtom, hostsDataAtom } from '@renderer/stores/hosts_data'
import { useAtom, useStore } from 'jotai'
import lodash from 'lodash'
import useI18n from './useI18n'

// Share the queue across hook consumers in the same window/store. A failed
// save must not poison subsequent saves or let responses publish out of order.
const saves = new WeakMap<ReturnType<typeof useStore>, { tail: Promise<void>; revision: number }>()

export default function useHostsData() {
  const [hostsData, setHostsData] = useAtom(hostsDataAtom)
  const [currentHosts, setCurrentHosts] = useAtom(currentHostsAtom)
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

  const setList = (list: IHostsListObject[]) => {
    const snapshot = lodash.cloneDeep(list.filter((i) => !i.is_sys))
    queue.revision += 1
    const save = queue.tail.then(async () => {
      try {
        await actions.setList(snapshot)
      } catch (error) {
        showErrorNotification({ title: lang.fail, message: getErrorMessage(error, lang.fail) })
        throw error
      }
      setHostsData((previous) => ({ ...previous, list: snapshot, version }))
      // Persistence has succeeded. A tray refresh failure must not masquerade
      // as a failed save and cause callers to roll back an already saved list.
      await actions.updateTrayTitle().catch((error: unknown) => {
        console.error(error)
        showErrorNotification({ title: lang.fail, message: getErrorMessage(error, lang.fail) })
      })
    })
    queue.tail = save.catch(() => {})
    return save
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

    currentHosts,
    setCurrentHosts,

    isHostsInTrashcan,
    isReadOnly,
  }
}
