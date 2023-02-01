/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
} from '@chakra-ui/react'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import React, { useState } from 'react'
import useI18n from '../models/useI18n'
import styles from './SudoPasswordInput.module.scss'

const SudoPasswordInput = () => {
  const { lang } = useI18n()
  const [is_show, setIsShow] = useState(false)
  const [pswd, setPswd] = useState('')
  const [tmp_list, setTmpList] = useState<IHostsListObject[] | undefined>()
  const ipt_ref = React.useRef<HTMLInputElement>(null)

  const onCancel = () => {
    setIsShow(false)
    setPswd('')
  }

  const onOk = async () => {
    setIsShow(false)
    setPswd('')
    agent.broadcast(events.write_hosts_to_system, tmp_list, { sudo_pswd: pswd })
  }

  useOnBroadcast(
    events.show_sudo_password_input,
    (tmp_list?: IHostsListObject[]) => {
      setTmpList(tmp_list)
      setIsShow(true)
      // console.log(tmp_list)
      agent.broadcast(events.active_main_window)
    },
    [tmp_list],
  )

  if (!is_show) return null

  return (
    <Modal initialFocusRef={ipt_ref} isOpen={is_show} onClose={onCancel}>
      <ModalOverlay />
      <ModalContent>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <div className={styles.label}>{lang.sudo_prompt_title}</div>
          <Input
            ref={ipt_ref}
            type="password"
            value={pswd}
            onChange={(e) => setPswd(e.target.value)}
            autoFocus={true}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOk()
            }}
          />
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

export default SudoPasswordInput
