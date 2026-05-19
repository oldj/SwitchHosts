/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Box, Flex, Group } from '@mantine/core'
import prettyBytes from 'pretty-bytes'
import useI18n from '../models/useI18n'
import styles from './StatusBar.module.scss'

interface Props {
  lineCount: number
  bytes: number
  readOnly?: boolean
}

const StatusBar = (props: Props) => {
  const { lineCount, bytes, readOnly } = props
  const { i18n } = useI18n()

  return (
    <Flex
      className={styles.root}
      style={{ paddingLeft: '10px', paddingRight: '10px', userSelect: 'none' }}
    >
      <Group gap="16px">
        <Box>
          {lineCount} {lineCount > 1 ? i18n.lang.lines : i18n.lang.line}
        </Box>
        <Box>{prettyBytes(bytes)}</Box>
        <Box>{readOnly ? i18n.lang.read_only : ''}</Box>
      </Group>
      <Box style={{ flex: 1 }} />
      <Box>{/* right */}</Box>
    </Flex>
  )
}

export default StatusBar
