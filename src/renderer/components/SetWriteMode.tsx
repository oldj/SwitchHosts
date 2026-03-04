/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Dialog,
  HStack,
  RadioGroup,
  Portal,
} from '@chakra-ui/react'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@common/events'
import React, { useState } from 'react'
import styles from './SetWriteMode.module.scss'
import { WriteModeType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import useConfigs from '../models/useConfigs'

interface Props {}

interface IPendingData {
  id: string
  on: boolean
}

const SetWriteMode = () => {
  const { updateConfigs } = useConfigs()
  const { lang } = useI18n()
  const [is_show, setIsShow] = useState(false)
  const ipt_ref = React.useRef<HTMLInputElement>(null)
  const [write_mode, setWriteMode] = useState<WriteModeType>(null)
  const [pending_data, setPendingData] = useState<IPendingData | undefined>(undefined)
  const DialogPositioner = Dialog.Positioner as unknown as React.FC<React.PropsWithChildren>
  const DialogContent = Dialog.Content as unknown as React.FC<React.PropsWithChildren>
  const RadioItem = RadioGroup.Item as unknown as React.FC<React.PropsWithChildren<{ value: string }>>
  const RadioItemText = RadioGroup.ItemText as unknown as React.FC<React.PropsWithChildren>

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
    <Dialog.Root open={is_show} onOpenChange={(e: { open: boolean }) => setIsShow(e.open)}>
      <Portal>
        <Dialog.Backdrop />
        <DialogPositioner>
          <DialogContent>
            <Dialog.CloseTrigger />
            <Dialog.Body pb={6}>
          <div className={styles.label}>{lang.write_mode_set}</div>
            <RadioGroup.Root
              value={write_mode || undefined}
              onValueChange={(v: { value: string }) => setWriteMode(v.value as WriteModeType)}
            >
              <HStack gap={10}>
                <RadioItem value={'append'}>
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator />
                  <RadioItemText>{lang.append}</RadioItemText>
                </RadioItem>
                <RadioItem value={'overwrite'}>
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator />
                  <RadioItemText>{lang.overwrite}</RadioItemText>
                </RadioItem>
              </HStack>
            </RadioGroup.Root>

            <Box h={8} mt={4} opacity={0.5}>
              {write_mode === 'append' && lang.write_mode_append_help}
              {write_mode === 'overwrite' && lang.write_mode_overwrite_help}
            </Box>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={onCancel} mr={3}>
                {lang.btn_cancel}
              </Button>
              <Button colorPalette="blue" onClick={onOk}>
                {lang.btn_ok}
              </Button>
            </Dialog.Footer>
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </Dialog.Root>
  )
}

export default SetWriteMode
