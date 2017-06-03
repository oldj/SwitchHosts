/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Modal, Button } from 'antd'
import Agent from '../Agent'
import './About.less'
import logo from '../../app/assets/logo@w512.png'
import { version } from '../../app/version'

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
    }, () => {
      let links = this.refs.content.querySelectorAll('a')
      links = Array.from(links)
      links.map(a => {
        a.onclick = () => {
          this.openUrl(a.href)
          return false
        }
      })
    })
  }

  openUrl (url) {
    Agent.pact('openUrl', url)
  }

  componentDidMount () {
    Agent.on('show-about', () => {
      this.show()
    })
  }

  render () {
    let {lang} = this.props
    let ver = `v${version.slice(0, 3).join('.')} (${version[3]})`

    return (
      <Modal
        visible={this.state.visible}
        width="360"
        onCancel={this.hide.bind(this)}
        wrapClassName="frame"
        closable={false}
        footer={[
          <Button key="back" size="large" onClick={this.hide.bind(this)}>{lang.close}</Button>
        ]}
      >
        <div className="about-content">
          <div className="logo">
            <img src={logo} alt=""/>
          </div>
          <div className="content" ref="content">
            <h2>SwitchHosts!</h2>
            <div className="version">{ver}</div>
            <div>
              <a href="https://oldj.github.io/SwitchHosts/" target="_blank">{lang.homepage}</a>
              <a href="https://github.com/oldj/SwitchHosts" target="_blank">{lang.source_code}</a>
            </div>
            <p className="br"/>
            <div>
              <h3>{lang.acknowledgement}:</h3>
              <div>
                <a href="https://github.com/allenm" target="_blank">Allen.M</a>
                <a href="https://github.com/charlestang" target="_blank">Charles Tang</a>
                <a href="https://github.com/stotem" target="_blank">WuJianjun</a>
                <a href="https://github.com/ElfSundae" target="_blank">Elf Sundae</a>
                <a href="https://github.com/codeyu" target="_blank">zhu yu</a>
                <a href="https://github.com/pangliang" target="_blank">胖梁</a>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    )
  }
}
