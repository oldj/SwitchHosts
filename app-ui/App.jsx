/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import { notification } from 'antd'
import classnames from 'classnames'
import Panel from './Panel'
import Content from './content/Content'
import SudoPrompt from './frame/SudoPrompt'
import EditPrompt from './frame/EditPrompt'
import StatConfirm from './frame/StatConfirm'
import About from './about/About'
import PreferencesPrompt from './frame/PreferencesPrompt'
import Agent from './Agent'
import { WHERE_REMOTE, WHERE_GROUP, WHERE_FOLDER } from './configs/contants'
import { reg as events_reg } from './events/index'
import treeFunc from '../app/libs/treeFunc'

import './App.less'

export default class App extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      list: [], // 用户的 hosts 列表
      sys_hosts: {}, // 系统 hosts
      current: {}, // 当前 hosts
      lang: {}, // 语言
      just_added_id: null,
      theme: 'light'
    }

    this.is_dragging = false
    this.loadHosts()

    Agent.pact('getPref')
      .then(pref => {
        let theme = pref.theme || 'light'
        this.setState({theme})
        document.body.className += ' theme-' + theme
        document.querySelector(`link[data-theme=${theme}]`).disabled = false
        document.body.style.visibility = 'visible'

        return pref.user_language || 'en'
      })
      .then(l => {
        Agent.pact('getLang', l).then(lang => {
          this.setState({lang})
        })
      })

    events_reg(this)

    Agent.on('drag_start', () => {
      this.is_dragging = true
      console.log('drag_start')
    })

    Agent.on('drag_end', () => {
      this.is_dragging = false
      console.log('drag_end')
    })

    Agent.on('err', e => {
      console.log(e)
      notification.error({
        message: e.title,
        description: e.content,
        duration: 10,
        style: {backgroundColor: '#fff0f0'}
      })
    })

    setInterval(() => {
      let list = this.state.list
      if (this.is_dragging || !list || list.length === 0) return

      console.log('checkNeedRemoteRefresh')
      Agent.pact('checkNeedRemoteRefresh', list)
        .then(list => {
          Agent.emit('refresh_end')
          if (!list) return
          Agent.emit('list_updated', list)
        })
        .catch(e => {
          console.log(e)
        })
    }, 60 * 1000)
  }

  async loadHosts (current_id) {
    let data = await Agent.pact('getHosts')
    let state = {
      list: data.list,
      sys_hosts: data.sys_hosts
    }

    if (!current_id) {
      current_id = this.state.current.id
    }
    state.current = treeFunc.getItemById(data.list, current_id) || data.sys_hosts

    this.setState(state)
  }

  async setCurrent (hosts) {
    if (hosts.is_sys) {
      let _hosts = await Agent.pact('getSysHosts')
      this.setState({
        sys_hosts: _hosts,
        current: _hosts
      })
    } else {
      let {current} = this.state
      if (current && current.id !== hosts.id) {
        await this.loadHosts(hosts.id)
      }
    }
  }

  static isReadOnly (hosts) {
    return !hosts || hosts.is_sys || ([WHERE_FOLDER, WHERE_GROUP, WHERE_REMOTE]).includes(hosts.where)
  }

  toSave () {
    clearTimeout(this._t)

    this._t = setTimeout(() => {
      Agent.emit('save', this.state.list, null, true)
    }, 1000)
  }

  setHostsContent (v) {
    let {current, list} = this.state
    if (current.content === v) return // not changed

    //current = Object.assign({}, current, {
    //  content: v || ''
    //})
    //list = list.slice(0)
    current.content = v
    let idx = list.findIndex(i => i.id === current.id)
    if (idx !== -1) {
      list.splice(idx, 1, current)
    }

    this.setState({
      current,
      list
    }, () => {
      this.toSave()
    })
  }

  justAdd (id) {
    this.setState({
      just_added_id: id
    })
  }

  handleOndragenter (events) {
    events.preventDefault()
  }

  handleOndragover (events) {
    events.preventDefault()
  }

  handleOndrop (events) {
    events.preventDefault()
  }

  componentDidMount () {
    window.addEventListener('keydown', (e) => {
      if (e.keyCode === 27) {
        Agent.emit('esc')
      }
    }, false)

    //window.addEventListener('mouseup', () => {
    //  Agent.emit('drag_end')
    //})
  }

  render () {
    let {current, theme} = this.state

    return (
      <div
        className={classnames({
          //['theme-' + theme]: 1,
          ['platform-' + Agent.platform]: 1
        })}
        onDragEnter={this.handleOndragenter}
        onDragOver={this.handleOndragover}
        onDrop={this.handleOndrop}
      >
        <StatConfirm lang={this.state.lang}/>
        <SudoPrompt lang={this.state.lang}/>
        <EditPrompt
          lang={this.state.lang}
          list={this.state.list}
          justAdd={this.justAdd.bind(this)}
        />
        <PreferencesPrompt
          lang={this.state.lang}
        />
        <Panel
          list={this.state.list}
          sys_hosts={this.state.sys_hosts}
          current={current}
          setCurrent={this.setCurrent.bind(this)}
          lang={this.state.lang}
          just_added_id={this.state.just_added_id}
          justAdd={this.justAdd.bind(this)}
          theme={theme}
        />
        <Content
          current={current}
          readonly={App.isReadOnly(current)}
          setHostsContent={this.setHostsContent.bind(this)}
          lang={this.state.lang}
        />
        <About lang={this.state.lang}/>
      </div>
    )
  }
}
