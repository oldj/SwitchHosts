/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { IHostsBasicData, IHostsListObject, VersionType } from '@root/common/data'
import version from '@root/version.json'
import { useState } from 'react'

export default function useHostsData() {
  const [ hosts_data, setHostsData ] = useState<IHostsBasicData>({
    list: [],
    trashcan: [],
    version: version as VersionType,
  })
  const [ current_hosts, setCurrentHosts ] = useState<IHostsListObject | null>(null)

  const loadHostsData = async () => {
    setHostsData(await actions.getBasicData())
  }

  const setList = async (list: IHostsListObject[]) => {
    list = list.filter(i => !i.is_sys)

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
    return hosts_data.trashcan.findIndex(i => i.data.id === id) > -1
  }

  return {
    hosts_data,
    setHostsData,
    loadHostsData,
    setList,
    isHostsInTrashcan,
    current_hosts,
    setCurrentHosts,
  }
}
