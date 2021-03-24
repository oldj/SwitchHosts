/**
 * useHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@root/common/default_configs'
import { useEffect, useState } from 'react'

export default function useConfigs() {
  const [ configs, setConfigs ] = useState<ConfigsType | null>(null)

  const loadConfigs = async () => {
    let new_configs = await actions.configAll()
    setConfigs(await actions.configAll())
    return new_configs
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
    loadConfigs,
    updateConfigs,
  }
}
