/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Panel from './panel/panel'
import Content from './content/content'
import SudoPrompt from './frame/sudo'
import EditPrompt from './frame/edit'
//import PreferencesPrompt from './frame/preferences'
import Agent from './Agent'
import { reg as events_reg } from './events/index'
import './app.less'

export default class App extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      list: [], // 用户的 hosts 列表
      sys_hosts: {}, // 系统 hosts
      current: {}, // 当前 hosts
      lang: {} // 语言
    }

    this.loadHosts()

    Agent.pact('getLang').then(lang => {
      this.setState({lang})
    })

    events_reg(this)

    setInterval(() => {
      let list = this.state.list
      if (!list || list.length === 0) return

      Agent.pact('checkNeedRemoteRefresh', list)
        .then(list => {
          if (!list) return
          Agent.emit('list_updated', list)
        })
        .catch(e => {
          console.log(e)
        })
    }, 60 * 1000)
  }

  loadHosts () {
    Agent.pact('getHosts').then(data => {
      let state = {
        list: data.list,
        sys_hosts: data.sys_hosts
      }
      let current = this.state.current
      state.current = data.list.find(item => item.id === current.id) || data.sys_hosts

      this.setState(state)
    })
  }

  setCurrent (hosts) {
    if (hosts.is_sys) {
      Agent.pact('getSysHosts')
        .then(_hosts => {
          this.setState({
            sys_hosts: _hosts,
            current: _hosts
          })
        })
    } else {
      this.setState({
        current: hosts
      })
    }
  }

  static isReadOnly (hosts) {
    return !hosts || hosts.is_sys || hosts.where === 'remote' ||
           hosts.where === 'group'
  }

  toSave () {
    clearTimeout(this._t)

    this._t = setTimeout(() => {
      Agent.emit('save', this.state.list)
    }, 1000)
  }

  setHostsContent (v) {
    if (this.state.current.content === v) return // not changed

    this.state.current.content = v || ''
    this.toSave()
  }

  componentDidMount () {
    window.addEventListener('keydown', (e) => {
      if (e.keyCode === 27) {
        Agent.emit('esc')
      }
    }, false)
  }

  render () {
    let current = this.state.current
    return (
      <div id="app" className={'platform-' + Agent.platform}>
        <Panel
          list={this.state.list}
          sys_hosts={this.state.sys_hosts}
          current={current}
          setCurrent={this.setCurrent.bind(this)}
          lang={this.state.lang}
        />
        <Content
          current={current}
          readonly={App.isReadOnly(current)}
          setHostsContent={this.setHostsContent.bind(this)}
          lang={this.state.lang}
        />
        <div className="frames">
          <SudoPrompt lang={this.state.lang}/>
          <EditPrompt lang={this.state.lang} list={this.state.list}/>
          {/*<PreferencesPrompt/>*/}
        </div>
      </div>
    )
  }
}
