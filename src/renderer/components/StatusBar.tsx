/**
 * StatusBar
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React from 'react'
import prettyBytes from 'pretty-bytes'
import styles from './StatusBar.module.scss'
import useI18n from '../models/useI18n'
import { Flex, Group, Space } from '@mantine/core'

interface Props {
  line_count: number
  bytes: number
  read_only?: boolean
}

const StatusBar = (props: Props) => {
  const { line_count, bytes, read_only } = props
  const { i18n } = useI18n()

  return (
    <Flex className={styles.root} px="10px">
      <Group spacing={16}>
        <Group>
          {line_count} {line_count > 1 ? i18n.lang.lines : i18n.lang.line}
        </Group>
        <Group>{prettyBytes(bytes)}</Group>
        <Group>{read_only ? i18n.lang.read_only : ''}</Group>
      </Group>
      <Space />
      <Group>{/* right */}</Group>
    </Flex>
  )
}

export default StatusBar
