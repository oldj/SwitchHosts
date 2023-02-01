/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  Radio,
  RadioGroup,
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
    <Modal initialFocusRef={ipt_ref} isOpen={is_show} onClose={onCancel}>
      <ModalOverlay />
      <ModalContent>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <div className={styles.label}>{lang.write_mode_set}</div>
          <RadioGroup
            value={write_mode || undefined}
            onChange={(v) => setWriteMode(v as WriteModeType)}
          >
            <HStack spacing={10}>
              <Radio value={'append'}>{lang.append}</Radio>
              <Radio value={'overwrite'}>{lang.overwrite}</Radio>
            </HStack>
          </RadioGroup>

          <Box h={8} mt={4} opacity={0.5}>
            {write_mode === 'append' && lang.write_mode_append_help}
            {write_mode === 'overwrite' && lang.write_mode_overwrite_help}
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onCancel} mr={3}>
            {lang.btn_cancel}
          </Button>
          <Button colorScheme="blue" onClick={onOk}>
            {lang.btn_ok}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default SetWriteMode
