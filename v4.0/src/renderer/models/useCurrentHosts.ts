/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsListObjectType } from '@root/common/data'
import { useState } from 'react'

export default function useCurrentHosts() {
  const [current_hosts, setCurrentHosts] = useState<HostsListObjectType | null>(null)

  return {
    current_hosts,
    setCurrentHosts,
  }
}
