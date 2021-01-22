/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/agent'
import { HostsDataType, HostsObjectType } from '@root/common/data'
import version from '@root/version.json'
import { useState } from 'react'

export default function useHostsData() {
  const [hosts_data, setHostsData] = useState<HostsDataType>({
    list: [],
    version,
  })

  const getData = async () => {
    setHostsData(await actions.localDataRead())
  }

  const setList = async (list: HostsObjectType[]) => {
    let data: HostsDataType = {
      list,
      version,
    }

    setHostsData(data)
    await actions.localDataWrite(data)
  }

  return {
    hosts_data,
    setHostsData,
    getData,
    setList,
  }
}
