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
import PreferencesPrompt from './frame/preferences'
import Agent from '../../renderer/Agent'
import './app.less'

class App extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      hosts: [],
      current: {}
    }

    Agent.act('getUserHosts', (e, data) => {
      this.setState({
        hosts: data.list
      })
    })
  }

  setCurrent (host) {
    if (host.is_sys) {
      Agent.act('getSysHosts', (e, cnt) => {

      })
    } else {
    }
    this.setState({
      current: host.is_sys ? SH_Agent.getSysHosts() : host
    })
  }

  static isReadOnly (host) {
    return host.is_sys || host.where === 'remote'
  }

  toSave () {
    clearTimeout(this._t)

    this._t = setTimeout(() => {
      Agent.emit('change')
    }, 1000)
  }

  setHostContent (v) {
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
        <Panel hosts={this.state.hosts} current={current}
               setCurrent={this.setCurrent.bind(this)}/>
        <Content current={current} readonly={App.isReadOnly(current)}
                 setHostContent={this.setHostContent.bind(this)}/>
        <div className="frames">
          <SudoPrompt/>
          <EditPrompt hosts={this.state.hosts}/>
          <PreferencesPrompt/>
        </div>
      </div>
    )
  }
}

export default App
