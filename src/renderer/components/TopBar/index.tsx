/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import ConfigMenu from '@renderer/components/TopBar/ConfigMenu'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { ActionIcon } from '@mantine/core'
import events from '@common/events'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import styles from './index.module.scss'
import {
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconX,
} from '@tabler/icons-react'

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
      <div className={styles.left}>
        <ActionIcon
          variant="subtle"
          onClick={() => {
            agent.broadcast(events.toggle_left_panel, !show_left_panel)
          }}
        >
          {show_left_panel ? (
            <IconLayoutSidebarLeftCollapse size={20} stroke={1.5} />
          ) : (
            <IconLayoutSidebarLeftExpand size={20} stroke={1.5} />
          )}
        </ActionIcon>
        <ActionIcon variant="subtle" onClick={() => agent.broadcast(events.add_new)}>
          <IconPlus size={20} stroke={1.5} />
        </ActionIcon>
      </div>

      <div className={styles.title_wrapper}>
        <div className={styles.title}>
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
        </div>
      </div>

      <div className={styles.right}>
        {show_toggle_switch ? (
          <div>
            <SwitchButton
              on={is_on}
              onChange={(on) => {
                current_hosts && agent.broadcast(events.toggle_item, current_hosts.id, on)
              }}
            />
          </div>
        ) : null}
        {show_history ? (
          <ActionIcon variant="subtle" onClick={() => agent.broadcast(events.show_history)}>
            <IconHistory stroke={1.5} size={20} />
          </ActionIcon>
        ) : null}

        <ConfigMenu />

        {show_close_button ? (
          <ActionIcon variant="subtle" onClick={() => actions.closeMainWindow()}>
            <IconX stroke={1.5} size={20} />
          </ActionIcon>
        ) : null}
      </div>
    </div>
  )
}
