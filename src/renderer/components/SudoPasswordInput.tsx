/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { Button, Group, Modal, PasswordInput } from '@mantine/core'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import React, { useState } from 'react'
import useI18n from '../models/useI18n'
import styles from './SudoPasswordInput.module.scss'

const SudoPasswordInput = () => {
  const { lang } = useI18n()
  const [opened, setOpened] = useState(false)
  const [pswd, setPswd] = useState('')
  const [tmpList, setTmpList] = useState<IHostsListObject[] | undefined>()
  const ipt_ref = React.useRef<HTMLInputElement>(null)

  const onCancel = () => {
    setOpened(false)
    setPswd('')
  }

  const onOk = async () => {
    setOpened(false)
    setPswd('')
    agent.broadcast(events.write_hosts_to_system, tmpList, { sudo_pswd: pswd })
  }

  useOnBroadcast(
    events.show_sudo_password_input,
    (list?: IHostsListObject[]) => {
      setTmpList(list)
      setOpened(true)
      agent.broadcast(events.active_main_window)
    },
    [tmpList],
  )

  return (
    <Modal opened={opened} onClose={onCancel} centered withCloseButton={false}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className={styles.label}>
          {lang.sudo_prompt_title}
          {lang.colon}
        </div>
        <PasswordInput
          ref={ipt_ref}
          value={pswd}
          onChange={(e) => setPswd(e.target.value)}
          autoFocus={true}
          data-autofocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOk()
          }}
        />
        <Group justify="flex-end" gap="12px" mt={20}>
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

export default SudoPasswordInput
