/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Button,
  Dialog,
  Input,
  Portal,
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
  const DialogPositioner = Dialog.Positioner as unknown as React.FC<React.PropsWithChildren>
  const DialogContent = Dialog.Content as unknown as React.FC<React.PropsWithChildren>

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
    <Dialog.Root open={is_show} onOpenChange={(e: { open: boolean }) => setIsShow(e.open)}>
      <Portal>
        <Dialog.Backdrop />
        <DialogPositioner>
          <DialogContent>
            <Dialog.CloseTrigger />
            <Dialog.Body pb={6}>
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

export default SudoPasswordInput
