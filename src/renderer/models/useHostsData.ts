/**
 * useHostsData
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import {
  IHostsBasicData,
  IHostsListObject,
  VersionType,
} from '@root/common/data'
import version from '@root/version.json'
import { useState } from 'react'

export default function useHostsData() {
  const [hosts_data, setHostsData] = useState<IHostsBasicData>({
    list: [],
    trashcan: [],
    version: version as VersionType,
  })
  const [current_hosts, setCurrentHosts] = useState<IHostsListObject | null>(
    null,
  )

  const loadHostsData = async () => {
    setHostsData(await actions.getBasicData())
  }

  const setList = async (list: IHostsListObject[]) => {
    list = list.filter((i) => !i.is_sys)

    let data: IHostsBasicData = {
      list,
      trashcan: hosts_data.trashcan,
      version: version as VersionType,
    }

    setHostsData(data)
    await actions.setList(list)
    await actions.updateTrayTitle()
  }

  const isHostsInTrashcan = (id: string): boolean => {
    return hosts_data.trashcan.findIndex((i) => i.data.id === id) > -1
  }

  const isReadOnly = (hosts?: IHostsListObject | null): boolean => {
    hosts = hosts || current_hosts

    if (!hosts) {
      return true
    }

    if (hosts.id === '0') {
      return true // system hosts
    }

    if (
      hosts.type &&
      ['group', 'remote', 'folder', 'trashcan'].includes(hosts.type)
    ) {
      return true
    }

    if (isHostsInTrashcan(hosts.id)) {
      return true
    }

    // ..
    return false
  }

  return {
    hosts_data,
    setHostsData,
    loadHostsData,
    setList,
    isHostsInTrashcan,
    isReadOnly,
    current_hosts,
    setCurrentHosts,
  }
}
