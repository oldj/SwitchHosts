/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { actions } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import { configsAtom } from '@renderer/stores/configs'
import { useAtom } from 'jotai'

export default function useConfigs() {
  const [configs, setConfigs] = useAtom(configsAtom)

  const loadConfigs = async () => {
    setConfigs(await actions.configAll())
  }

  const updateConfigs = async (kv: Partial<ConfigsType>) => {
    setConfigs((prev) => (prev ? { ...prev, ...kv } : prev))
    try {
      await actions.configUpdate(kv)
    } catch (e) {
      console.error('configUpdate failed', kv, e)
      showErrorNotification({
        title: 'Failed to save configuration',
        message: getErrorMessage(e, 'Unknown error'),
      })
      throw e
    }
  }

  return {
    configs,
    loadConfigs,
    updateConfigs,
  }
}
