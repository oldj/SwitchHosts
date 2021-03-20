/**
 * StatusBar
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Box, Flex, HStack, Spacer } from '@chakra-ui/react'
import React from 'react'
import styles from './StatusBar.less'

interface Props {
  line_count: number;
  read_only?: boolean;
}

const StatusBar = (props: Props) => {
  const { i18n } = useModel('useI18n')

  return (
    <Flex
      className={styles.root}
      px="10px"
      userSelect="none"
    >
      <HStack>
        <Box mr={1}>
          {props.line_count} {props.line_count > 1 ? i18n.lang.lines : i18n.lang.line}
        </Box>
        <Box>{props.read_only ? i18n.lang.read_only : ''}</Box>
      </HStack>
      <Spacer/>
      <Box>
        {/* right */}
      </Box>
    </Flex>
  )
}

export default StatusBar
