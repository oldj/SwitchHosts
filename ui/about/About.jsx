/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Modal, Button } from 'antd'
import Agent from '../Agent'
import './About.less'

export default class About extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      visible: false
    }
  }

  hide () {
    this.setState({
      visible: false
    })
  }

  show () {
    this.setState({
      visible: true
    })
  }

  componentDidMount () {
    Agent.on('show-about', () => {
      this.show()
    })
  }

  render () {
    let {lang} = this.props

    return (
      <Modal
        visible={this.state.visible}
        width="360"
        //onOk={this.handleOk}
        onCancel={this.hide.bind(this)}
        wrapClassName="frame"
        footer={[
          <Button key="back" size="large" onClick={this.hide.bind(this)}>{lang.close}</Button>,
        ]}
      >
        <p>Some contents...</p>
      </Modal>
    )
  }
}
