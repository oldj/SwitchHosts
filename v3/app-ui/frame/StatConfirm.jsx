/**
 * @author oldj
 */

import React, { useState, useEffect } from 'react'
import MyFrame from './MyFrame'
import Agent from '../Agent'
import { Modal } from 'antd'

const send_usage_data = 'send_usage_data'

const StatConfirm = (props) => {
  let {lang} = props
  let [show, setShow] = useState(false)

  useEffect(() => {
    Agent.pact('getPref')
      .then(pref => {
        //console.log(pref)
        if (typeof pref[send_usage_data] !== 'boolean') {
          setShow(true)
        }
      })
  })

  const setSend = (is_send) => {
    Agent.pact('setPref', send_usage_data, is_send)
      .then(() => setShow(false))
  }

  return (
    <MyFrame
      show={show}
      title={lang.pref_tab_usage_data_title}
      body={<div className="ln">{lang.pref_tab_usage_data_desc}</div>}
      onOK={() => setSend(true)}
      onCancel={() => setSend(false)}
      lang={lang}
      width={400}
      okText={lang.send_usage_data_ok}
      cancelText={lang.send_usage_data_cancel}
      maskClosable={false}
    />
  )
}

export default StatConfirm
