/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Panel from './panel/panel'
//import Content from './content/content'
//import SudoPrompt from './frame/sudo'
//import EditPrompt from './frame/edit'
//import PreferencesPrompt from './frame/preferences'
import Agent from './Agent'
import './app.less'

class App extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      list: [], // 用户的 hosts 列表
      sys: {}, // 系统 hosts
      current: {}, // 当前 hosts
      lang: {} // 语言
    }

    Agent.pact('getUserHosts').then(data => {
      this.setState({
        list: data.list,
        sys: data.sys
      })
    })

    Agent.pact('getLang').then(lang => {
      this.setState({lang})
    })
  }

  setCurrent (hosts) {
    if (hosts.is_sys) {
      Agent.act('getSysHosts', (e, _hosts) => {
        this.setState({
          current: _hosts
        })
      })
    } else {
      this.setState({
        current: hosts
      })
    }
  }

  static isReadOnly (host) {
    return !host || host.is_sys || host.where === 'remote'
  }

  toSave () {
    clearTimeout(this._t)

    this._t = setTimeout(() => {
      Agent.emit('change')
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
          sys={this.state.sys}
          current={current}
          setCurrent={this.setCurrent.bind(this)}
          lang={this.state.lang}
        />
        {/*<Content*/}
        {/*current={current}*/}
        {/*readonly={App.isReadOnly(current)}*/}
        {/*setHostContent={this.setHostContent.bind(this)}*/}
        {/*lang={this.state.lang}*/}
        {/*/>*/}
        {/*<div className="frames">*/}
        {/*<SudoPrompt/>*/}
        {/*<EditPrompt hosts={this.state.hosts}/>*/}
        {/*<PreferencesPrompt/>*/}
        {/*</div>*/}
      </div>
    )
  }
}

export default App
