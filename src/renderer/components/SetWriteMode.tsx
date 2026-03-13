/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { WriteModeType } from '@common/default_configs'
import events from '@common/events'
import { Button, Group, Modal, Radio, Text } from '@mantine/core'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'
import useConfigs from '../models/useConfigs'
import styles from './SetWriteMode.module.scss'

interface Props {}

interface IPendingData {
  id: string
  on: boolean
}

const SetWriteMode = () => {
  const { updateConfigs } = useConfigs()
  const { lang } = useI18n()
  const [opened, setOpened] = useState(false)
  const [writeMode, setWriteMode] = useState<WriteModeType>(null)
  const [pendingData, setPendingData] = useState<IPendingData | undefined>(undefined)

  const onCancel = () => {
    setOpened(false)
  }

  const onOk = async () => {
    await updateConfigs({ write_mode: writeMode })
    setOpened(false)

    if (pendingData && pendingData.id) {
      agent.broadcast(events.toggle_item, pendingData.id, pendingData.on)
    }
  }

  useOnBroadcast(
    events.show_set_write_mode,
    (data?: IPendingData) => {
      setOpened(true)
      setPendingData(data)
      agent.broadcast(events.active_main_window)
    },
    [],
  )

  return (
    <Modal opened={opened} onClose={onCancel} centered padding={0} withCloseButton={false}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Modal.CloseButton />
        <div style={{ padding: 'var(--mantine-spacing-md)', paddingBottom: 24 }}>
          <div className={styles.label}>{lang.write_mode_set}</div>
          <Radio.Group
            value={writeMode || ''}
            onChange={(v) => setWriteMode((v || null) as WriteModeType)}
          >
            <Group gap="40px">
              <Radio value="append" label={lang.append} />
              <Radio value="overwrite" label={lang.overwrite} />
            </Group>
          </Radio.Group>

          <Text size="sm" mt="16px" mih="32px" c="dimmed">
            {writeMode === 'append' && lang.write_mode_append_help}
            {writeMode === 'overwrite' && lang.write_mode_overwrite_help}
          </Text>
        </div>
        <Group
          justify="flex-end"
          gap="12px"
          style={{
            borderTop: '1px solid var(--swh-border-color-1)',
            padding: 'var(--mantine-spacing-md)',
          }}
        >
          <Button variant="outline" onClick={onCancel}>
            {lang.btn_cancel}
          </Button>
          <Button color="blue" onClick={onOk}>
            {lang.btn_ok}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}

export default SetWriteMode
