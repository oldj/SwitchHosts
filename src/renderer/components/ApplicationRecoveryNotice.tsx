import clsx from 'clsx'
import styles from './ApplicationRecoveryNotice.module.scss'
import events from '@common/events'
import { agent } from '@renderer/core/agent'
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
      <button type="button" onClick={() => agent.broadcast(events.reapply_saved_hosts)}>
        {lang.hosts_reapply_saved}
      </button>
    </div>
  )
}
