/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Center, HStack, IconButton } from '@chakra-ui/react'
import History from '@renderer/components/History'
import HostsEditor from '@renderer/components/HostsEditor'
import HostsViewer from '@renderer/components/HostsViewer'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { BiHistory, BiSidebar, BiSliderAlt } from 'react-icons/bi'
import styles from './index.less'

interface Props {
  has_left_panel: boolean;
}

const MainPanel = (props: Props) => {
  const { has_left_panel } = props
  const { i18n } = useModel('useI18n')
  const { isHostsInTrashcan } = useModel('useHostsData')
  const { current_hosts } = useModel('useCurrentHosts')
  const [ system_hosts, setSystemHosts ] = useState('')
  const [ is_on, setIsOn ] = useState(!!current_hosts?.on)

  useEffect(() => {
    if (!current_hosts) {
      actions.getSystemHosts().then(value => setSystemHosts(value))
    }
    setIsOn(!!current_hosts?.on)
  }, [ current_hosts ])

  // useOnBroadcast('toggle_item', (id: string, on: boolean) => {
  //   if (current_hosts && current_hosts.id === id) {
  //     setIsOn(on)
  //   }
  // }, [ current_hosts ])

  useOnBroadcast('system_hosts_updated', () => {
    if (!current_hosts) {
      actions.getSystemHosts().then(value => setSystemHosts(value))
    }
  }, [ current_hosts ])

  useOnBroadcast('set_hosts_on_status', (id: string, on: boolean) => {
    if (current_hosts && current_hosts.id === id) {
      setIsOn(on)
    }
  }, [ current_hosts ])

  return (
    <div className={styles.root}>
      <div className={clsx(styles.topbar, !has_left_panel && styles.without_left_panel)}>
        <Center>
          <IconButton
            aria-label="Toggle sidebar"
            icon={<BiSidebar/>}
            onClick={() => {
              agent.broadcast('toggle_left_pannel', !has_left_panel)
            }}
            variant="ghost"
          />
        </Center>

        <div className={styles.hosts_title}>
          {current_hosts ? (
            <>
              <HStack>
              <span className={styles.hosts_icon}>
                <ItemIcon type={current_hosts.type}/>
              </span>
                <span className={styles.hosts_title}>
                {current_hosts.title || i18n.lang.untitled}
              </span>
              </HStack>
            </>
          ) : (
            <>
              <HStack>
              <span className={styles.hosts_icon}>
                <ItemIcon type="system"/>
              </span>
                <span className={styles.hosts_title}>
                {i18n.lang.system_hosts}
              </span>
              </HStack>
            </>
          )}
        </div>

        <Center>
          {current_hosts && !isHostsInTrashcan(current_hosts.id) ? (
            <SwitchButton on={is_on} onChange={on => {
              agent.broadcast('toggle_item', current_hosts.id, on)
            }}/>
          ) : (
            <IconButton
              aria-label="Show history"
              icon={<BiHistory/>}
              variant="ghost"
              onClick={() => agent.broadcast('show_history')}
            />
          )}
        </Center>

        <Center>
          <IconButton
            aria-label="Toggle preference panel"
            icon={<BiSliderAlt/>}
            variant="ghost"
            onClick={() => agent.broadcast('show_preferences')}
          />
        </Center>
      </div>

      <div className={styles.main}>
        {current_hosts ? (
          <HostsEditor hosts={current_hosts}/>
        ) : (
          <HostsViewer content={system_hosts}/>
        )}
      </div>

      <History/>
    </div>
  )
}

export default MainPanel
