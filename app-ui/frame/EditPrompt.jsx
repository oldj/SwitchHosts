/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import MyFrame from './MyFrame'
import classnames from 'classnames'
import {
  BorderOuterOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { Input, Radio, Select } from 'antd'
import Group from './Group'
import Agent from '../Agent'
import makeId from '../../app/libs/make-id'
import { WHERE_LOCAL, WHERE_REMOTE, WHERE_GROUP, WHERE_FOLDER } from '../configs/contants'
import treeFunc from '../../app/libs/treeFunc'
import styles from './EditPrompt.less'

const RadioButton = Radio.Button
const RadioGroup = Radio.Group
const Option = Select.Option

export default class EditPrompt extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      show: false,
      is_add: true,
      where: WHERE_LOCAL,
      title: '',
      url: '',
      last_refresh: null,
      refresh_interval: 0,
      is_loading: false,
      include: [],
      folder_mode: 0 // 文件夹模式，0 默认，1 单选，2 多选
    }

    this.current_hosts = null
  }

  tryToFocus() {
    let el = this.el_body && this.el_body.querySelector('input[type=text]')
    el && el.focus()
  }

  clear() {
    this.setState({
      where: WHERE_LOCAL,
      title: '',
      url: '',
      last_refresh: null,
      refresh_interval: 0
    })
  }

  componentDidMount() {
    Agent.on('add_hosts', (title, uri) => {
      let goWhere = WHERE_LOCAL
      if (uri) {
        goWhere = WHERE_REMOTE
      }
      this.setState({
        show: true,
        is_add: true,
        include: [],
        title: title,
        where: goWhere,
        url: uri
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
        where: hosts.where || WHERE_LOCAL,
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
      //let hosts = list.find(i => i.id === this.state.id)
      let hosts = treeFunc.getItemById(list, this.state.id)
      if (hosts) {
        this.current_hosts = hosts
        this.setState({ last_refresh: hosts.last_refresh })
        setTimeout(() => this.setState({ is_loading: false }), 500)
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

  onOK() {
    this.setState({
      title: (this.state.title || '').replace(/^\s+|\s+$/g, ''),
      url: (this.state.url || '').replace(/^\s+|\s+$/g, '')
    })

    if (this.state.title === '') {
      this.el_title.focus()
      return false
    }

    if (this.state.where === WHERE_REMOTE && this.state.url === '') {
      this.el_url.focus()
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
    if (this.state.where !== WHERE_GROUP) {
      data.include = []
    }

    delete data['is_add']
    Agent.emit('update_hosts', data)

    this.setState({
      show: false
    })
    this.clear()
  }

  onCancel() {
    this.setState({
      show: false
    })
    this.clear()
  }

  confirmDel() {
    let { lang } = this.props
    if (!confirm(lang.confirm_del)) return
    Agent.emit('del_hosts', this.current_hosts)
    this.setState({
      show: false
    })
    this.clear()
  }

  updateInclude(include) {
    this.setState({ include })
  }

  getRefreshOptions() {
    let { lang } = this.props
    let k = [
      [0, `${lang.never}`],
      [1 / 60, `1 ${lang.minute}`],
      [5 / 60, `5 ${lang.minutes}`],
      [15 / 60, `15 ${lang.minutes}`],
      [1, `1 ${lang.hour}`],
      [24, `24 ${lang.hours}`],
      [168, `7 ${lang.days}`]
    ]
    if (Agent.IS_DEV) {
      k.splice(1, 0, [10 / 3600, `10s (for DEV)`]) // dev test only
    }
    return k.map(([v, n], idx) => {
      return (
        <Option value={v} key={idx}>{n}</Option>
      )
    })
  }

  getEditOperations() {
    if (this.state.is_add) return null

    let { lang } = this.props

    return (
      <div>
        <div className="ln">
          <a href="#" className="del"
             onClick={this.confirmDel.bind(this)}
          >
            <DeleteOutlined/>
            <span>{lang.del_scheme}</span>
          </a>
        </div>
      </div>
    )
  }

  refresh() {
    if (this.state.is_loading) return

    Agent.emit('check_hosts_refresh', this.current_hosts)
    this.setState({
      is_loading: true
    })

  }

  renderGroup() {
    if (this.state.where !== WHERE_GROUP) return null

    return <Group
      list={this.props.list}
      include={this.state.include}
      updateInclude={this.updateInclude.bind(this)}
    />
  }

  renderRemoteInputs() {
    if (this.state.where !== WHERE_REMOTE) return null

    let { lang } = this.props
    let { is_loading } = this.state

    return (
      <div className="remote-ipts">
        <div className="ln">
          <div className="title">{lang.url}</div>
          <div className="cnt">
            <Input
              ref={c => this.el_url = c}
              value={this.state.url}
              placeholder="http:// or file:///"
              onChange={e => this.setState({ url: e.target.value })}
              onKeyDown={e => (e.keyCode === 13 && this.onOK()) || (e.keyCode === 27 && this.onCancel())}
              maxLength={1024}
            />
          </div>
        </div>
        <div className="ln">
          <div className="title">{lang.auto_refresh}</div>
          <div className="cnt">
            <Select
              value={this.state.refresh_interval}
              style={{ width: 120 }}
              onChange={v => this.setState({ refresh_interval: parseFloat(v) || 0 })}
            >
              {this.getRefreshOptions()}
            </Select>

            <ReloadOutlined
              className={classnames({
                'iconfont': 1,
                'icon-refresh': 1,
                'invisible': !this.current_hosts || this.state.url !== this.current_hosts.url,
                'loading': is_loading
              })}
              title={lang.refresh}
              onClick={() => this.refresh()}
            />

            <span className="last-refresh">
              {is_loading ? 'loading...' : lang.last_refresh + (this.state.last_refresh || 'N/A')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  renderFolder() {
    if (this.state.where !== WHERE_FOLDER) return null
    let { lang } = this.props
    let { folder_mode } = this.state

    return (
      <div>
        <div className="ln">
          <div className="title">{lang.pref_choice_mode}</div>
          <div className="cnt">
            <RadioGroup onChange={e => this.setState({ folder_mode: e.target.value })} value={folder_mode}>
              <RadioButton value={0}><BorderOuterOutlined/> {lang.default}</RadioButton>
              <RadioButton value={1}><CheckCircleOutlined/> {lang.pref_choice_mode_single}</RadioButton>
              <RadioButton value={2}><CheckSquareOutlined/> {lang.pref_choice_mode_multiple}</RadioButton>
            </RadioGroup>
          </div>
        </div>
      </div>
    )
  }

  body() {
    let { lang } = this.props
    let { where, title, is_add } = this.state

    return (
      <div className={styles.tab} ref={c => this.el_body = c}>
        <div className="ln">
          <div className="title">{lang.hosts_title}</div>
          <div className="cnt">
            <Input
              ref={c => this.el_title = c}
              value={title}
              onChange={(e) => this.setState({ title: e.target.value })}
              onKeyDown={(e) => (e.keyCode === 13 && this.onOK() || e.keyCode === 27 && this.onCancel())}
              maxLength={50}
            />
          </div>
        </div>

        <div className="ln">
          <div className="title">{lang.hosts_type}</div>
          <div className="cnt">
            <RadioGroup
              disabled={!is_add}
              onChange={e => this.setState({ where: e.target.value })}
              value={where}
            >
              <RadioButton value={WHERE_LOCAL}><FileTextOutlined/> {lang.where_local}</RadioButton>
              <RadioButton value={WHERE_REMOTE}><GlobalOutlined/> {lang.where_remote}</RadioButton>
              <RadioButton value={WHERE_GROUP}><CopyOutlined/> {lang.where_group}</RadioButton>
              <RadioButton value={WHERE_FOLDER}><FolderOutlined/> {lang.where_folder}</RadioButton>
            </RadioGroup>
          </div>
        </div>

        {this.renderRemoteInputs()}
        {this.renderGroup()}
        {this.renderFolder()}
        {this.getEditOperations()}
      </div>
    )
  }

  render() {
    let { lang } = this.props

    return (
      <MyFrame
        show={this.state.show}
        title={lang[this.state.is_add ? 'add_hosts' : 'edit_hosts']}
        body={this.body()}
        onOK={() => this.onOK()}
        onCancel={() => this.onCancel()}
        lang={this.props.lang}
      />
    )
  }
}
