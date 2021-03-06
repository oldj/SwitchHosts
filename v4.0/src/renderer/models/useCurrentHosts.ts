/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsListObject } from '@root/common/data'
import { useState } from 'react'

export default function useCurrentHosts() {
  const [current_hosts, setCurrentHosts] = useState<IHostsListObject | null>(null)

  return {
    current_hosts,
    setCurrentHosts,
  }
}
