/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@root/common/data'
import {
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
} from '@chakra-ui/react'
import React, { useState } from 'react'
import styles from './SudoPasswordInput.less'

interface Props {

}

const SudoPasswordInput = (props: Props) => {
  const { lang } = useModel('useI18n')
  const [ is_show, setIsShow ] = useState(false)
  const [ pswd, setPswd ] = useState('')
  const [ tmp_list, setTmpList ] = useState<IHostsListObject[] | undefined>()
  const ipt_ref = React.useRef<HTMLInputElement>(null)

  const onCancel = () => {
    setIsShow(false)
    setPswd('')
  }

  const onOk = async () => {
    setIsShow(false)
    setPswd('')
    agent.broadcast('write_hosts_to_system', tmp_list, { sudo_pswd: pswd })
  }

  useOnBroadcast('show_sudo_password_input', (tmp_list?: IHostsListObject[]) => {
    setTmpList(tmp_list)
    setIsShow(true)
    // console.log(tmp_list)
  }, [ tmp_list ])

  if (!is_show) return null

  return (
    <Modal
      initialFocusRef={ipt_ref}
      isOpen={is_show}
      onClose={onCancel}
    >
      <ModalOverlay/>
      <ModalContent>
        <ModalCloseButton/>
        <ModalBody pb={6}>
          <div className={styles.label}>{lang.sudo_prompt_title}</div>
          <Input
            ref={ipt_ref}
            type="password"
            value={pswd}
            onChange={e => setPswd(e.target.value)}
            autoFocus={true}
            onKeyDown={e => {
              if (e.key === 'Enter') onOk()
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button onClick={onCancel} mr={3}>{lang.btn_cancel}</Button>
          <Button colorScheme="blue" onClick={onOk}>{lang.btn_ok}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default SudoPasswordInput
