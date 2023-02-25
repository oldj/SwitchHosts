/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@common/events'
import React, { useState } from 'react'
import { WriteModeType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import useConfigs from '@renderer/models/useConfigs'
import { Button, Group, Modal, Radio } from '@mantine/core'

interface Props {}

interface IPendingData {
  id: string
  on: boolean
}

const SetWriteMode = () => {
  const { updateConfigs } = useConfigs()
  const { lang } = useI18n()
  const [is_show, setIsShow] = useState(false)
  const [write_mode, setWriteMode] = useState<WriteModeType>(null)
  const [pending_data, setPendingData] = useState<IPendingData | undefined>(undefined)

  const onCancel = () => {
    setIsShow(false)
  }

  const onOk = async () => {
    await updateConfigs({ write_mode })
    setIsShow(false)

    if (pending_data && pending_data.id) {
      agent.broadcast(events.toggle_item, pending_data.id, pending_data.on)
    }
  }

  useOnBroadcast(
    events.show_set_write_mode,
    (data?: IPendingData) => {
      setIsShow(true)
      setPendingData(data)
      agent.broadcast(events.active_main_window)
    },
    [],
  )

  if (!is_show) return null

  return (
    <Modal opened={is_show} onClose={onCancel} title={lang.write_mode_set}>
      <Radio.Group
        value={write_mode || undefined}
        onChange={(v) => setWriteMode(v as WriteModeType)}
      >
        <Group spacing={20}>
          <Radio value={'append'} label={lang.append} />
          <Radio value={'overwrite'} label={lang.overwrite} />
        </Group>
      </Radio.Group>

      <Group mt={8} opacity={0.5}>
        {write_mode === 'append' && lang.write_mode_append_help}
        {write_mode === 'overwrite' && lang.write_mode_overwrite_help}
      </Group>

      <Group mt={20} position={'center'}>
        <Button variant="outline" onClick={onCancel}>
          {lang.btn_cancel}
        </Button>
        <Button onClick={onOk}>{lang.btn_ok}</Button>
      </Group>
    </Modal>
  )
}

export default SetWriteMode
