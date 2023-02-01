/**
 * useConfigs
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@common/default_configs'
import { useAtom } from 'jotai'
import { configs_atom } from '@renderer/stores/configs'

export default function useConfigs() {
  const [configs, setConfigs] = useAtom(configs_atom)

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

  return {
    configs,
    loadConfigs,
    updateConfigs,
  }
}
