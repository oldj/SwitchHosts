/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Box, Center, Flex, HStack, IconButton } from '@chakra-ui/react'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import React, { useEffect, useState } from 'react'
import { BiHistory, BiPlus, BiSidebar, BiSliderAlt } from 'react-icons/bi'
import styles from './index.less'

interface IProps {
  show_left_panel: boolean;
}

export default (props: IProps) => {
  const { show_left_panel } = props
  const { i18n } = useModel('useI18n')
  const { isHostsInTrashcan, current_hosts } = useModel('useHostsData')
  const [ is_on, setIsOn ] = useState(!!current_hosts?.on)

  const show_toggle_switch = current_hosts && !isHostsInTrashcan(current_hosts.id)
  const show_history = !current_hosts

  useEffect(() => {
    setIsOn(!!current_hosts?.on)
  }, [ current_hosts ])

  useOnBroadcast('set_hosts_on_status', (id: string, on: boolean) => {
    if (current_hosts && current_hosts.id === id) {
      setIsOn(on)
    }
  }, [ current_hosts ])

  return (
    <div className={styles.root}>
      <Flex align="center" className={styles.left}>
        <IconButton
          aria-label="Toggle sidebar"
          icon={<BiSidebar/>}
          onClick={() => {
            agent.broadcast('toggle_left_pannel', !show_left_panel)
          }}
          variant="ghost"
          mr={1}
        />
        <IconButton
          aria-label="Add"
          icon={<BiPlus/>}
          onClick={() => agent.broadcast('add_new')}
          variant="ghost"
        />
      </Flex>

      <Center>
        <div className={styles.hosts_title}>
          {current_hosts ? (
            <>
              <HStack>
              <span className={styles.hosts_icon}>
                <ItemIcon type={current_hosts.type} is_collapsed={!current_hosts.folder_open}/>
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
      </Center>

      <Flex align="center" justifyContent="flex-end">
        <Center>
          {show_toggle_switch ? (
            <Box mr={3}>
              <SwitchButton on={is_on} onChange={on => {
                current_hosts && agent.broadcast('toggle_item', current_hosts.id, on)
              }}/>
            </Box>
          ) : null}
          {show_history ? (
            <IconButton
              aria-label="Show history"
              icon={<BiHistory/>}
              variant="ghost"
              onClick={() => agent.broadcast('show_history')}
            />
          ) : null}
        </Center>

        <Center>
          <IconButton
            aria-label="Toggle preference panel"
            icon={<BiSliderAlt/>}
            variant="ghost"
            onClick={() => agent.broadcast('show_preferences')}
          />
        </Center>
      </Flex>
    </div>
  )
}
