import events from '@common/events'
import { ActionIcon, Indicator, Stack, Tooltip } from '@mantine/core'
import ConfigMenu from '@renderer/components/TopBar/ConfigMenu'
import { agent } from '@renderer/core/agent'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { leftPanelViewAtom } from '@renderer/stores/ui'
import { IconHistory, IconList, IconTrash } from '@tabler/icons-react'
import { useAtom } from 'jotai'
import styles from './index.module.scss'

const LeftSidebar = () => {
  const { lang } = useI18n()
  const { hostsData } = useHostsData()
  const [view, setView] = useAtom(leftPanelViewAtom)

  return (
    <div className={styles.root}>
      <Stack gap={20} align="center" pt={8}>
        <Tooltip label={'Hosts'} position="right">
          <ActionIcon
            variant={view === 'list' ? 'light' : 'subtle'}
            color={view === 'list' ? undefined : 'gray'}
            size={28}
            onClick={() => setView('list')}
            aria-label={'Hosts'}
          >
            <IconList size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={lang.trashcan} position="right">
          <Indicator
            label={hostsData.trashcan.length}
            size={14}
            disabled={hostsData.trashcan.length === 0}
            color="gray"
            offset={4}
          >
            <ActionIcon
              variant={view === 'trashcan' ? 'light' : 'subtle'}
              color={view === 'trashcan' ? undefined : 'gray'}
              size={28}
              onClick={() => setView('trashcan')}
              aria-label={lang.trashcan}
            >
              <IconTrash size={18} stroke={1.5} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Stack>

      <div className={styles.spacer} />

      <Stack gap={20} align="center">
        <Tooltip label={lang.show_history} position="right">
          <ActionIcon
            variant="subtle"
            color="gray"
            size={28}
            onClick={() => agent.broadcast(events.show_history)}
            aria-label={lang.show_history}
          >
            <IconHistory size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
        <ConfigMenu
          size={28}
          iconSize={18}
          menuPosition="right-end"
          tooltip={lang.settings}
        />
      </Stack>
    </div>
  )
}

export default LeftSidebar
