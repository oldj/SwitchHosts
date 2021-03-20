/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Center, Flex, IconButton } from '@chakra-ui/react'
import { agent } from '@renderer/core/agent'
import React from 'react'
import { BiSidebar } from 'react-icons/bi'
import styles from './index.less'

export default () => {
  return (
    <div className={styles.root}>
      <Flex align="center" className={styles.left}>
        <IconButton
          aria-label="Toggle sidebar"
          icon={<BiSidebar/>}
          onClick={() => {
            agent.broadcast('toggle_left_pannel', !has_left_panel)
          }}
          variant="ghost"
        />
      </Flex>
      <Center>
        center
      </Center>
      <Flex align="center" justifyContent="flex-end">
        right
      </Flex>
    </div>
  )
}
