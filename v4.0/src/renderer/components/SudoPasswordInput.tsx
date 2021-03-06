/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Modal } from 'antd'
import React, { useState } from 'react'
import styles from './SudoPasswordInput.less'

interface Props {

}

const SudoPasswordInput = (props: Props) => {
  const { lang } = useModel('useI18n')
  const [is_show, setIsShow] = useState(false)

  const onCancel = () => {
    setIsShow(false)
  }

  const onOk = async () => {

  }

  return (
    <Modal
      title={lang.sudo_prompt_title}
      visible={is_show}
      okText={lang.btn_ok}
      cancelText={lang.btn_cancel}
      onCancel={onCancel}
      onOk={onOk}
    >
    </Modal>
  )
}

export default SudoPasswordInput
