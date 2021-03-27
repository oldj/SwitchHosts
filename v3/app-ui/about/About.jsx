/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Modal, Button } from 'antd'
import Agent from '../Agent'
import logo from '../../app/assets/logo@512w.png'
import version from '../../app/version'
import styles from './About.less'

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
    const updateLink = () => {
      if (!this.el_content) {
        setTimeout(updateLink, 500)
        return
      }
      let links = this.el_content.querySelectorAll('a')
      links = Array.from(links)
      links.map(a => {
        a.onclick = () => {
          this.openUrl(a.href)
          return false
        }
      })
    }

    this.setState({
      visible: true
    }, updateLink)
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
        width={360}
        onCancel={this.hide.bind(this)}
        wrapClassName="frame"
        closable={false}
        footer={[
          <Button key="back" size="large" onClick={this.hide.bind(this)}>{lang.close}</Button>
        ]}
      >
        <div>
          <div className={styles.logo}>
            <img src={logo} alt=""/>
          </div>
          <div className={styles.content} ref={c => this.el_content = c}>
            <h2>SwitchHosts!</h2>
            <div className={styles.version}>{ver}</div>
            <div>
              <a href="https://oldj.github.io/SwitchHosts/" target="_blank">{lang.homepage}</a>
              <a href="https://github.com/oldj/SwitchHosts" target="_blank">{lang.source_code}</a>
            </div>
            <p className={styles.br}/>
            <div>
              <h3>{lang.acknowledgement}:</h3>
              <div>
                <a href="https://github.com/oldj" target="_blank">oldj</a>
                <a href="https://github.com/allenm" target="_blank">Allen.M</a>
                <a href="https://github.com/charlestang" target="_blank">Charles Tang</a>
                <a href="https://github.com/stotem" target="_blank">WuJianjun</a>
                <a href="https://github.com/ElfSundae" target="_blank">Elf Sundae</a>
                <a href="https://github.com/codeyu" target="_blank">zhu yu</a>
                <a href="https://github.com/pangliang" target="_blank">胖梁</a>
                <a href="https://github.com/CaffreySun" target="_blank">CaffreySun</a>
                <a href="https://github.com/Xmader" target="_blank">Xmader</a>
                <a href="https://github.com/zhanggang807" target="_blank">Dean Zhang</a>
                <a href="https://github.com/CloverNet" target="_blank">CloverNet</a>
                <a href="https://github.com/ReAlign" target="_blank">ReAlign</a>
                <a href="https://github.com/cuikangyi" target="_blank">Kangyi Cui</a>
                <a href="https://github.com/akrha" target="_blank">AKIRA</a>
                <a href="https://github.com/Constaline" target="_blank">Constaline</a>
                <a href="https://github.com/TooBug" target="_blank">TooBug</a>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    )
  }
}
