/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@root/common/default_configs'
import { useEffect, useState } from 'react'

export default function useCurrentHosts() {
  const [ configs, setConfigs ] = useState<ConfigsType | null>(null)

  const loadConfigs = async () => {
    setConfigs(await actions.configAll())
  }

  const updateConfigs = async (kv: Partial<ConfigsType>) => {
    if (!configs) return
    // console.log('update configs:', kv)
    let new_configs = { ...configs, ...kv }
    setConfigs(new_configs)
    await actions.configUpdate(new_configs)
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  return {
    configs,
    updateConfigs,
  }
}
