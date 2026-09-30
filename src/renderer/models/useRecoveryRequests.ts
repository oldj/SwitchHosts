import events from '@common/events'
import { actions } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { useEffect } from 'react'
import useHostsData from './useHostsData'
import useI18n from './useI18n'

// Mount only in the main page. The backend retains requests while the main
// webview is absent/loading; its event only wakes an already ready consumer.
export default function useRecoveryRequests(ready: boolean) {
  const { reapplySavedList } = useHostsData()
  const { lang } = useI18n()
  const consume = async () => {
    if (!ready) return
    try {
      if (await actions.takeHostsRecoveryRequest()) await reapplySavedList()
    } catch (error) {
      showErrorNotification({ title: lang.fail, message: getErrorMessage(error, lang.fail) })
    }
  }
  useOnBroadcast(events.reapply_saved_hosts, consume, [ready])
  useEffect(() => {
    void consume()
    // Check once after loading/recreation; later requests arrive via the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
}
