import clsx from 'clsx'
import styles from './ApplicationRecoveryNotice.module.scss'
import { actions } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'

export default function ApplicationRecoveryNotice({ compact = false }: { compact?: boolean }) {
  const { applicationRecovery } = useHostsData()
  const { lang } = useI18n()
  if (!applicationRecovery) return null
  const message =
    applicationRecovery.status === 'applied'
      ? lang.hosts_applied_save_failed
      : lang.hosts_application_unknown
  return (
    <div role="alert" className={clsx(styles.root, compact && styles.compact)} title={message}>
      {!compact && <p>{message}</p>}
      <button
        type="button"
        onClick={() => {
          actions.requestHostsRecovery().catch((error: unknown) => {
            showErrorNotification({ title: lang.fail, message: getErrorMessage(error, lang.fail) })
          })
        }}
      >
        {lang.hosts_reapply_saved}
      </button>
    </div>
  )
}
