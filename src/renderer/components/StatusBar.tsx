/**
 * StatusBar
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Box, Flex, HStack, Spacer } from '@chakra-ui/react'
import React from 'react'
import prettyBytes from 'pretty-bytes'
import styles from './StatusBar.module.scss'
import useI18n from '../models/useI18n'

interface Props {
  line_count: number
  bytes: number
  read_only?: boolean
}

const StatusBar = (props: Props) => {
  const { line_count, bytes, read_only } = props
  const { i18n } = useI18n()

  return (
    <Flex className={styles.root} px="10px" userSelect="none">
      <HStack spacing={4}>
        <Box>
          {line_count} {line_count > 1 ? i18n.lang.lines : i18n.lang.line}
        </Box>
        <Box>{prettyBytes(bytes)}</Box>
        <Box>{read_only ? i18n.lang.read_only : ''}</Box>
      </HStack>
      <Spacer />
      <Box>{/* right */}</Box>
    </Flex>
  )
}

export default StatusBar
