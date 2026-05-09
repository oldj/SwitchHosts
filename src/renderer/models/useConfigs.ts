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
    const next = await actions.configAll()
    setConfigs(next)
    return next
  }

  const updateConfigs = async (kv: Partial<ConfigsType>) => {
    setConfigs((prev) => (prev ? { ...prev, ...kv } : prev))
    try {
      await actions.configUpdate(kv)
    } catch (e) {
      console.error('configUpdate failed', kv, e)
      // Optimistic merge above means atom is now showing values the
      // backend rejected. Pull the disk snapshot back so every
      // subscriber (including callers that don't catch this rejection)
      // sees the truth, not a phantom save.
      try {
        await loadConfigs()
      } catch (reloadError) {
        console.error('failed to reload configs after configUpdate failed', reloadError)
      }
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
