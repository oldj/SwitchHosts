/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import events from '@common/events'
import { ActionIcon, Box, Flex } from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import ConfigMenu from '@renderer/components/TopBar/ConfigMenu'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import {
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import styles from './index.module.scss'

interface IProps {
  show_left_panel: boolean
  use_system_window_frame: boolean
}

export default (props: IProps) => {
  const { show_left_panel, use_system_window_frame } = props
  const { lang } = useI18n()
  const { isHostsInTrashcan, current_hosts, isReadOnly } = useHostsData()
  const [is_on, setIsOn] = useState(!!current_hosts?.on)
  const iconSize = 20

  const show_toggle_switch =
    !show_left_panel && current_hosts && !isHostsInTrashcan(current_hosts.id)
  const show_history = !current_hosts
  const show_close_button =
    (agent.platform === 'linux' && !use_system_window_frame) ||
    (agent.platform !== 'darwin' && agent.platform !== 'linux')

  useEffect(() => {
    setIsOn(!!current_hosts?.on)
  }, [current_hosts])

  useOnBroadcast(
    events.set_hosts_on_status,
    (id: string, on: boolean) => {
      if (current_hosts && current_hosts.id === id) {
        setIsOn(on)
      }
    },
    [current_hosts],
  )

  return (
    <div className={styles.root}>
      <Flex align="center" justify="center" gap={8}>
        <ActionIcon
          aria-label="Toggle sidebar"
          onClick={() => {
            agent.broadcast(events.toggle_left_panel, !show_left_panel)
          }}
          variant="subtle"
          color="gray"
        >
          {show_left_panel ? (
            <IconLayoutSidebarLeftCollapse size={iconSize} />
          ) : (
            <IconLayoutSidebarLeftExpand size={iconSize} />
          )}
        </ActionIcon>
        <ActionIcon
          aria-label="Add"
          onClick={() => agent.broadcast(events.add_new)}
          variant="subtle"
          color="gray"
        >
          <IconPlus size={iconSize} />
        </ActionIcon>
      </Flex>

      <Box className={styles.title_wrapper}>
        <Flex className={styles.title} gap={8} align="center" justify="center">
          {current_hosts ? (
            <>
              <span className={styles.hosts_icon}>
                <ItemIcon type={current_hosts.type} is_collapsed={!current_hosts.folder_open} />
              </span>
              <span className={styles.hosts_title}>{current_hosts.title || lang.untitled}</span>
            </>
          ) : (
            <>
              <span className={styles.hosts_icon}>
                <ItemIcon type="system" />
              </span>
              <span className={styles.hosts_title}>{lang.system_hosts}</span>
            </>
          )}

          {isReadOnly(current_hosts) ? (
            <span className={styles.read_only}>{lang.read_only}</span>
          ) : null}
        </Flex>
      </Box>

      <Flex align="center" justify="flex-end" gap={8}>
        {show_toggle_switch ? (
          <Box mr="12px">
            <SwitchButton
              on={is_on}
              onChange={(on) => {
                current_hosts && agent.broadcast(events.toggle_item, current_hosts.id, on)
              }}
            />
          </Box>
        ) : null}
        {show_history ? (
          <ActionIcon
            aria-label="Show history"
            variant="subtle"
            color="gray"
            onClick={() => agent.broadcast(events.show_history)}
          >
            <IconHistory size={iconSize} />
          </ActionIcon>
        ) : null}

        <ConfigMenu iconSize={iconSize} />

        {show_close_button ? (
          <ActionIcon
            aria-label="Close window"
            variant="subtle"
            color="gray"
            onClick={() => actions.closeMainWindow()}
          >
            <IconX size={iconSize} />
          </ActionIcon>
        ) : null}
      </Flex>
    </div>
  )
}
