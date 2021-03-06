/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@root/common/data'
import { Input, Modal } from 'antd'
import React, { useState } from 'react'
import styles from './SudoPasswordInput.less'

interface Props {

}

const SudoPasswordInput = (props: Props) => {
  const { lang } = useModel('useI18n')
  const [is_show, setIsShow] = useState(false)
  const [pswd, setPswd] = useState('')
  const [tmp_list, setTmpList] = useState<IHostsListObject[] | undefined>()

  const onCancel = () => {
    setIsShow(false)
    setPswd('')
  }

  const onOk = async () => {
    setIsShow(false)
    agent.broadcast('write_hosts_to_system', tmp_list, { sudo_pswd: pswd })
  }

  useOnBroadcast('show_sudo_password_input', (tmp_list?: IHostsListObject[]) => {
    setTmpList(tmp_list)
    setIsShow(true)
    console.log(tmp_list)
  }, [tmp_list])

  if (!is_show) return null

  return (
    <Modal
      // title={lang.sudo_prompt_title}
      visible={is_show}
      okText={lang.btn_ok}
      cancelText={lang.btn_cancel}
      onCancel={onCancel}
      onOk={onOk}
      width={300}
    >
      <div className={styles.label}>{lang.sudo_prompt_title}</div>
      <Input.Password
        value={pswd}
        onChange={e => setPswd(e.target.value)}
        autoFocus={true}
        onKeyDown={e => {
          if (e.code === 'Enter') onOk()
        }}
      />
    </Modal>
  )
}

export default SudoPasswordInput
