/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import {Input} from 'antd'
import Agent from '../Agent'
import MyFrame from './MyFrame'
import styles from './SudoPrompt.less'

export default class SudoPrompt extends React.Component {
  constructor (props) {
    super(props)

    this.onSuccess = null
    this.state = {
      show: false,
      pswd: ''
    }
  }

  componentDidMount () {
    Agent.on('sudo_prompt', (success) => {
      this.setState({show: true})
      this.onSuccess = success
      setTimeout(() => {
        let el = this.el_body
        el && el.querySelector('input').focus()
      }, 100)
    })
  }

  onOK () {
    let {pswd} = this.state
    if (!pswd) {
      //let el = body
      //el && el.querySelector('input').focus()
      this.el_pswd.focus()
      return
    }

    this.setState({
      show: false
    })

    Agent.emit('sudo_pswd', pswd)
    if (typeof this.onSuccess === 'function') {
      this.onSuccess(pswd)
    }
    this.onSuccess = null
  }

  onCancel () {
    Agent.emit('sudo_cancel')
    this.setState({
      show: false
    })
    this.onSuccess = null
  }

  body () {
    let {lang} = this.props
    return (
      <div ref={c => this.el_body = c}>
        <div className="ln">
          <div className="title">{lang.sudo_pswd}</div>
          <div className="cnt">
            <Input
              type="password"
              ref={c => this.el_pswd = c}
              onKeyDown={e => (e.keyCode === 13 && this.onOK() || e.keyCode === 27 && this.onCancel())}
              onChange={e => this.setState({pswd: e.target.value})}
            />
          </div>
        </div>
      </div>
    )
  }

  render () {
    let {lang} = this.props
    return (
      <MyFrame
        show={this.state.show}
        title={lang.input_sudo_pswd}
        body={this.body()}
        onOK={() => this.onOK()}
        onCancel={() => this.onCancel()}
        lang={lang}
        width="400"
      />
    )
  }
}
