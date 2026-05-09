import events from '@common/events'
import { ActionIcon, Indicator, Stack, Tooltip } from '@mantine/core'
import ConfigMenu from '@renderer/components/TopBar/ConfigMenu'
import { actions, agent } from '@renderer/core/agent'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { leftPanelViewAtom } from '@renderer/stores/ui'
import { IconHistory, IconList, IconSearch, IconTrash } from '@tabler/icons-react'
import { useAtom } from 'jotai'
import styles from './index.module.scss'

interface IProps {
  showLeftPanel: boolean
}

type LeftPanelView = 'list' | 'trashcan'

const LeftSidebar = (props: IProps) => {
  const { showLeftPanel } = props
  const { lang } = useI18n()
  const { hostsData } = useHostsData()
  const [view, setView] = useAtom(leftPanelViewAtom)

  const handleClick = (target: LeftPanelView) => {
    if (!showLeftPanel) {
      setView(target)
      agent.broadcast(events.toggle_left_panel, true)
    } else if (view === target) {
      agent.broadcast(events.toggle_left_panel, false)
    } else {
      setView(target)
    }
  }

  return (
    <div className={styles.root} data-tauri-drag-region>
      <Stack gap={20} align="center" pt={8}>
        {/* "Hosts" is a product proper noun — kept in English across all locales. */}
        <Tooltip label={'Hosts'} position="right">
          <ActionIcon
            variant={view === 'list' ? 'light' : 'subtle'}
            color={view === 'list' ? undefined : 'gray'}
            size={28}
            onClick={() => handleClick('list')}
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
              onClick={() => handleClick('trashcan')}
              aria-label={lang.trashcan}
            >
              <IconTrash size={18} stroke={1.5} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Stack>

      <div className={styles.spacer} />

      <Stack gap={20} align="center">
        <Tooltip label={lang.search} position="right">
          <ActionIcon
            variant="subtle"
            color="gray"
            size={28}
            onClick={() => actions.findShow().catch((e) => console.error(e))}
            aria-label={lang.search}
          >
            <IconSearch size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
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
