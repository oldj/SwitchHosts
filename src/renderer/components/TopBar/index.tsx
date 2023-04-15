/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Box, Flex, HStack, IconButton } from '@chakra-ui/react'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import ConfigMenu from '@renderer/components/TopBar/ConfigMenu'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@common/events'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import { BiX } from 'react-icons/bi'
import {
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
} from '@tabler/icons-react'
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
      <Flex align="center" className={styles.left}>
        <IconButton
          aria-label="Toggle sidebar"
          icon={
            show_left_panel ? (
              <IconLayoutSidebarLeftCollapse size={16} />
            ) : (
              <IconLayoutSidebarLeftExpand size={16} />
            )
          }
          onClick={() => {
            agent.broadcast(events.toggle_left_panel, !show_left_panel)
          }}
          variant="ghost"
          mr={1}
        />
        <IconButton
          aria-label="Add"
          icon={<IconPlus size={16} />}
          onClick={() => agent.broadcast(events.add_new)}
          variant="ghost"
        />
      </Flex>

      <Box className={styles.title_wrapper}>
        <HStack className={styles.title}>
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
        </HStack>
      </Box>

      <Flex align="center" justifyContent="flex-end" className={styles.right}>
        {show_toggle_switch ? (
          <Box mr={3}>
            <SwitchButton
              on={is_on}
              onChange={(on) => {
                current_hosts && agent.broadcast(events.toggle_item, current_hosts.id, on)
              }}
            />
          </Box>
        ) : null}
        {show_history ? (
          <IconButton
            aria-label="Show history"
            icon={<IconHistory size={16} />}
            variant="ghost"
            onClick={() => agent.broadcast(events.show_history)}
          />
        ) : null}

        <ConfigMenu />

        {show_close_button ? (
          <IconButton
            aria-label="Close window"
            fontSize="20px"
            icon={<BiX />}
            variant="ghost"
            onClick={() => actions.closeMainWindow()}
          />
        ) : null}
      </Flex>
    </div>
  )
}
