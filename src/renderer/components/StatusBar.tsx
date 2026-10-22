/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Box, Button, Flex, Group, Tooltip } from '@mantine/core'
import { agent } from '@renderer/core/agent'
import prettyBytes from 'pretty-bytes'
import useI18n from '../models/useI18n'
import styles from './StatusBar.module.scss'

interface Props {
  lineCount: number
  bytes: number
  readOnly?: boolean
  pendingDraft?: boolean
  isApplying?: boolean
  isDiscarding?: boolean
  onApply?: () => void
  onDiscard?: () => void
}

const StatusBar = (props: Props) => {
  const { lineCount, bytes, readOnly } = props
  const { i18n } = useI18n()
  const applyHint = i18n.trans('editor_draft_apply_hint', [
    agent.platform === 'darwin' ? 'Cmd+S' : 'Ctrl+S',
  ])

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
      {props.pendingDraft && (
        <Group gap="8px" data-draft-action="apply">
          <span role="status">{i18n.lang.editor_draft_pending}</span>
          <Tooltip
            label={applyHint}
            multiline
            w={320}
            withArrow
            position="top-end"
            events={{ hover: true, focus: true, touch: false }}
          >
            <Button
              className={styles.draftButton}
              variant="subtle"
              size="compact-xs"
              onClick={props.onApply}
              loading={props.isApplying}
              disabled={props.isDiscarding}
            >
              {i18n.lang.editor_draft_apply}
            </Button>
          </Tooltip>
          <Button
            className={styles.draftButton}
            variant="subtle"
            size="compact-xs"
            onClick={props.onDiscard}
            disabled={props.isApplying}
            loading={props.isDiscarding}
          >
            {i18n.lang.editor_draft_discard}
          </Button>
        </Group>
      )}
    </Flex>
  )
}

export default StatusBar
