/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsObjectType } from '@root/common/data'
import { useState } from 'react'

export default function useCurrentHosts() {
  const [current_hosts, setCurrentHosts] = useState<HostsObjectType>()

  return {
    current_hosts,
    setCurrentHosts,
  }
}
