/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import React, { useState } from 'react'
import useI18n from '@renderer/models/useI18n'
import styles from './SudoPasswordInput.module.scss'
import { Button, Group, Input, Modal, PasswordInput } from '@mantine/core'
import { IconKey } from '@tabler/icons-react'

const SudoPasswordInput = () => {
  const { lang } = useI18n()
  const [is_show, setIsShow] = useState(false)
  const [pswd, setPswd] = useState('')
  const [tmp_list, setTmpList] = useState<IHostsListObject[] | undefined>()

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
    <Modal
      opened={is_show}
      onClose={onCancel}
      title={
        <Group spacing={8}>
          <IconKey size={16} />
          <span>{lang.sudo_prompt_title}</span>
        </Group>
      }
    >
      <PasswordInput
        data-autofocus
        value={pswd}
        onChange={(e) => setPswd(e.target.value)}
        autoFocus={true}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOk()
        }}
      />
      <Group mt={20} position={'center'}>
        <Button variant="outline" onClick={onCancel} mr={3}>
          {lang.btn_cancel}
        </Button>
        <Button onClick={onOk}>{lang.btn_ok}</Button>
      </Group>
    </Modal>
  )
}

export default SudoPasswordInput
