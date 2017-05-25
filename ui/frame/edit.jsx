/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import MyFrame from './frame'
import classnames from 'classnames'
import Group from './group'
import Agent from '../Agent'
import makeId from '../../app/libs/make-id'
import './edit.less'

export default class EditPrompt extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      show: false,
      is_add: true,
      where: 'local',
      title: '',
      url: '',
      last_refresh: null,
      refresh_interval: 0,
      is_loading: false,
      include: []
    }

    this.current_hosts = null
  }

  tryToFocus () {
    let el = this.refs.body && this.refs.body.querySelector('input[type=text]')
    el && el.focus()
  }

  clear () {
    this.setState({
      where: 'local',
      title: '',
      url: '',
      last_refresh: null,
      refresh_interval: 0
    })
  }

  componentDidMount () {
    Agent.on('add_hosts', () => {
      this.setState({
        show: true,
        is_add: true
      })
      setTimeout(() => {
        this.tryToFocus()
      }, 100)
    })

    Agent.on('edit_hosts', (hosts) => {
      this.current_hosts = hosts
      let include = hosts.include || []
      include = Array.from(new Set(include))

      this.setState({
        id: hosts.id,
        show: true,
        is_add: false,
        where: hosts.where || 'local',
        title: hosts.title || '',
        url: hosts.url || '',
        last_refresh: hosts.last_refresh || null,
        refresh_interval: hosts.refresh_interval || 0,
        include
      })
      setTimeout(() => {
        this.tryToFocus()
      }, 100)
    })

    Agent.on('list_updated', list => {
      let hosts = list.find(i => i.id === this.state.id)
      if (hosts) {
        this.current_hosts = hosts
        this.setState({last_refresh: hosts.last_refresh})
        setTimeout(() => this.setState({is_loading: false}), 500)
      }
    })

    Agent.on('refresh_end', (id) => {
      if (this.state.is_loading) {
        this.setState({
          is_loading: false
        })

        if (id && id === this.current_hosts.id) {
          this.setState({
            last_refresh: this.current_hosts.last_refresh
          })
        }
      }
    })
  }

  onOK () {
    this.setState({
      title: (this.state.title || '').replace(/^\s+|\s+$/g, ''),
      url: (this.state.url || '').replace(/^\s+|\s+$/g, '')
    })

    if (this.state.title === '') {
      this.refs.title.focus()
      return false
    }

    if (this.state.where === 'remote' && this.state.url === '') {
      this.refs.url.focus()
      return false
    }

    let new_id = makeId()
    let data = Object.assign({}, this.current_hosts, this.state,
      this.state.is_add ? {
        id: new_id,
        content: `# ${this.state.title}`,
        on: false
      } : {})

    if (!data.id) data.id = new_id
    if (this.state.is_add) {
      this.props.justAdd(new_id)
    }

    delete data['is_add']
    Agent.emit('update_hosts', data)

    this.setState({
      show: false
    })
    this.clear()
  }

  onCancel () {
    this.setState({
      show: false
    })
    this.clear()
  }

  confirmDel () {
    let {lang} = this.props
    if (!confirm(lang.confirm_del)) return
    Agent.emit('del_hosts', this.current_hosts)
    this.setState({
      show: false
    })
    this.clear()
  }

  updateInclude (include) {
    this.setState({include})
  }

  getRefreshOptions () {
    let {lang} = this.props
    let k = [
      [0, `${lang.never}`],
      [1, `1 ${lang.hour}`],
      [24, `24 ${lang.hours}`],
      [168, `7 ${lang.days}`]
    ]
    if (Agent.IS_DEV) {
      k.splice(1, 0, [0.002778, `10s (for DEV)`]) // dev test only
    }
    return k.map(([v, n], idx) => {
      return (
        <option value={v} key={idx}>{n}</option>
      )
    })
  }

  getEditOperations () {
    if (this.state.is_add) return null

    let {lang} = this.props

    return (
      <div>
        <div className="ln">
          <a href="#" className="del"
             onClick={this.confirmDel.bind(this)}
          >
            <i className="iconfont icon-delete"/>
            <span>{lang.del_hosts}</span>
          </a>
        </div>
      </div>
    )
  }

  refresh () {
    if (this.state.is_loading) return

    Agent.emit('check_hosts_refresh', this.current_hosts)
    this.setState({
      is_loading: true
    })

  }

  renderGroup () {
    if (this.state.where !== 'group') return null

    return <Group
      list={this.props.list}
      include={this.state.include}
      updateInclude={this.updateInclude.bind(this)}
    />
  }

  renderRemoteInputs () {
    if (this.state.where !== 'remote') return null

    let {lang} = this.props

    return (
      <div className="remote-ipts">
        <div className="ln">
          <div className="title">{lang.url}</div>
          <div className="cnt">
            <input
              type="text"
              ref="url"
              value={this.state.url}
              placeholder="http://"
              onChange={(e) => this.setState({url: e.target.value})}
              onKeyDown={(e) => (e.keyCode === 13 && this.onOK()) || (e.keyCode === 27 && this.onCancel())}
            />
          </div>
        </div>
        <div className="ln">
          <div className="title">{lang.auto_refresh}</div>
          <div className="cnt">
            <select
              value={this.state.refresh_interval}
              onChange={(e) => this.setState(
                {refresh_interval: parseFloat(e.target.value) || 0})}
            >
              {this.getRefreshOptions()}
            </select>

            <i
              className={classnames({
                iconfont: 1,
                'icon-refresh': 1,
                'invisible': !this.current_hosts || this.state.url !== this.current_hosts.url,
                'loading': this.state.is_loading
              })}
              title={lang.refresh}
              onClick={() => this.refresh()}
            />

            <span className="last-refresh">
              {lang.last_refresh}
              {this.state.last_refresh || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  body () {
    let {lang} = this.props
    return (
      <div ref="body">
        <div className="ln">
          <input id="ipt-local" type="radio" name="where" value="local"
                 checked={this.state.where === 'local'}
                 onChange={(e) => this.setState({where: e.target.value})}
          />
          <label htmlFor="ipt-local">{lang.where_local}</label>
          <input id="ipt-remote" type="radio" name="where" value="remote"
                 checked={this.state.where === 'remote'}
                 onChange={(e) => this.setState({where: e.target.value})}
          />
          <label htmlFor="ipt-remote">{lang.where_remote}</label>
          <input id="ipt-group" type="radio" name="where" value="group"
                 checked={this.state.where === 'group'}
                 onChange={(e) => this.setState({where: e.target.value})}
          />
          <label htmlFor="ipt-group">{lang.where_group}</label>
        </div>
        <div className="ln">
          <div className="title">{lang.hosts_title}</div>
          <div className="cnt">
            <input
              type="text"
              ref="title"
              name="text"
              value={this.state.title}
              onChange={(e) => this.setState({title: e.target.value})}
              onKeyDown={(e) => (e.keyCode === 13 && this.onOK() || e.keyCode === 27 && this.onCancel())}
            />
          </div>
        </div>
        {this.renderRemoteInputs()}
        {this.renderGroup()}
        {this.getEditOperations()}
      </div>
    )
  }

  render () {
    let {lang} = this.props

    return (
      <MyFrame
        show={this.state.show}
        head={lang[this.state.is_add ? 'add_hosts' : 'edit_hosts']}
        body={this.body()}
        onOK={() => this.onOK()}
        onCancel={() => this.onCancel()}
        lang={this.props.lang}
      />
    )
  }
}
