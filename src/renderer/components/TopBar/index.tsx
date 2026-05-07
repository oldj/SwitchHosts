/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import events from '@common/events'
import { ActionIcon, Box, Flex } from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMinus,
  IconPlus,
  IconSquare,
  IconX,
} from '@tabler/icons-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'
import styles from './index.module.scss'

interface IProps {
  showLeftPanel: boolean
  showRightPanel: boolean
  useSystemWindowFrame: boolean
}

const TopBar = (props: IProps) => {
  const { showLeftPanel, showRightPanel } = props
  const { lang } = useI18n()
  const { isHostsInTrashcan, currentHosts, isReadOnly } = useHostsData()
  const [isOn, setIsOn] = useState(!!currentHosts?.on)
  const iconSize = 20
  const iconStroke = 1.5

  const showToggleSwitch =
    !showLeftPanel && currentHosts && !isHostsInTrashcan(currentHosts.id)
  const showWindowControls = agent.platform !== 'darwin'

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror prop into local optimistic state; also set by useOnBroadcast
    setIsOn(!!currentHosts?.on)
  }, [currentHosts])

  useOnBroadcast(
    events.set_hosts_on_status,
    (id: string, on: boolean) => {
      if (currentHosts && currentHosts.id === id) {
        setIsOn(on)
      }
    },
    [currentHosts],
  )

  return (
    <div className={styles.root} data-tauri-drag-region>
      <Flex align="center" justify="center" gap={8}>
        <ActionIcon
          aria-label="Toggle sidebar"
          onClick={() => {
            agent.broadcast(events.toggle_left_panel, !showLeftPanel)
          }}
          variant="subtle"
          color="gray"
        >
          {showLeftPanel ? (
            <IconLayoutSidebarLeftCollapse size={iconSize} stroke={iconStroke} />
          ) : (
            <IconLayoutSidebarLeftExpand size={iconSize} stroke={iconStroke} />
          )}
        </ActionIcon>
        <ActionIcon
          aria-label="Add"
          onClick={() => agent.broadcast(events.add_new)}
          variant="subtle"
          color="gray"
        >
          <IconPlus size={iconSize} stroke={iconStroke} />
        </ActionIcon>
      </Flex>

      <Box className={styles.title_wrapper} data-tauri-drag-region>
        <Flex className={styles.title} gap={8} align="center" justify="center">
          {currentHosts ? (
            <>
              <span className={styles.hosts_icon}>
                <ItemIcon type={currentHosts.type} isCollapsed={!currentHosts.folder_open} />
              </span>
              <span className={styles.hosts_title}>{currentHosts.title || lang.untitled}</span>
            </>
          ) : (
            <>
              <span className={styles.hosts_icon}>
                <ItemIcon type="system" />
              </span>
              <span className={styles.hosts_title}>{lang.system_hosts}</span>
            </>
          )}

          {isReadOnly(currentHosts) ? (
            <span className={styles.read_only}>{lang.read_only}</span>
          ) : null}
        </Flex>
      </Box>

      <Flex align="center" justify="flex-end" gap={8}>
        {showToggleSwitch ? (
          <Box mr="12px">
            <SwitchButton
              on={isOn}
              onChange={(on) => {
                if (currentHosts) agent.broadcast(events.toggle_item, currentHosts.id, on)
              }}
            />
          </Box>
        ) : null}
        <ActionIcon
          aria-label="Toggle right panel"
          onClick={() => {
            agent.broadcast(events.toggle_right_panel, !showRightPanel)
          }}
          variant="subtle"
          color="gray"
        >
          {showRightPanel ? (
            <IconLayoutSidebarRightCollapse size={iconSize} stroke={iconStroke} />
          ) : (
            <IconLayoutSidebarRightExpand size={iconSize} stroke={iconStroke} />
          )}
        </ActionIcon>

        {showWindowControls ? (
          <>
            <ActionIcon
              aria-label="Minimize"
              variant="subtle"
              color="gray"
              onClick={() => getCurrentWindow().minimize()}
            >
              <IconMinus size={iconSize} stroke={iconStroke} />
            </ActionIcon>
            <ActionIcon
              aria-label="Maximize"
              variant="subtle"
              color="gray"
              onClick={() => getCurrentWindow().toggleMaximize()}
            >
              <IconSquare size={iconSize - 4} stroke={iconStroke} />
            </ActionIcon>
            <ActionIcon
              aria-label="Close window"
              variant="subtle"
              color="gray"
              onClick={() => actions.closeMainWindow()}
            >
              <IconX size={iconSize} stroke={iconStroke} />
            </ActionIcon>
          </>
        ) : null}
      </Flex>
    </div>
  )
}

export default TopBar
