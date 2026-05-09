import events from '@common/events'
import { Button, Group, Text } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useI18n from '@renderer/models/useI18n'
import { useEffect, useRef, useState } from 'react'
import styles from './index.module.scss'
import { InfoRow, countRules } from './shared'

const stripTrailingColon = (s: string) => s.replace(/[:：]\s*$/, '')

const SystemHostsPanel = () => {
  const { lang } = useI18n()
  const [path, setPath] = useState<string | null>(null)
  const [ruleCount, setRuleCount] = useState<number | null>(null)
  const loadIdRef = useRef(0)

  const loadContent = async () => {
    const id = ++loadIdRef.current
    try {
      const content: string = (await actions.getSystemHosts()) || ''
      if (id !== loadIdRef.current) return
      setRuleCount(countRules(content))
    } catch {
      if (id !== loadIdRef.current) return
      setRuleCount(null)
    }
  }

  const loadPath = async () => {
    try {
      const p: string = (await actions.getPathOfSystemHosts()) || ''
      setPath(p || null)
    } catch {
      setPath(null)
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- both loaders setState after awaiting an async call */
    loadPath()
    loadContent()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useOnBroadcast(events.system_hosts_updated, () => {
    loadContent()
  })

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <div className={styles.header}>
          <Group gap="8px" wrap="nowrap" className={styles.title_wrap}>
            <span className={styles.title_icon} data-testid="right-panel-title-icon">
              <ItemIcon type="system" />
            </span>
            <Text
              className={styles.title}
              title={lang.system_hosts}
              data-testid="right-panel-title"
            >
              {lang.system_hosts}
            </Text>
          </Group>
        </div>

        <div className={styles.section}>
          <InfoRow label={lang.hosts_type} value={lang.system} />
          <InfoRow
            label={stripTrailingColon(lang.your_hosts_file_is)}
            value={path || '—'}
            mono
          />
          {ruleCount != null ? (
            <InfoRow label={lang.rules} value={String(ruleCount)} />
          ) : null}
        </div>

        <div className={styles.section}>
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconHistory size={14} stroke={1.5} />}
            onClick={() => agent.broadcast(events.show_history)}
          >
            {lang.show_history}
          </Button>
        </div>
      </div>
      <div className={styles.status_bar} />
    </div>
  )
}

export default SystemHostsPanel
