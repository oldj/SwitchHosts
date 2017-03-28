/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import ListItem from './list_item'
import Agent from '../../../renderer/Agent'
import update from 'react-addons-update'
import './list.less'

class List extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      current: this.props.current,
      list: this.props.list,
      sys: this.props.sys
    }
    this.last_content = this.props.sys.content

    // auto check refresh
    setTimeout(() => {
      this.autoCheckRefresh()
    }, 1000 * 5)
  }

  /**
   * 检查当前 host 是否需要从网络下载更新
   * @param host
   * @param force {Boolean} 如果为 true，则只要是 remote 且 refresh_interval != 0，则强制更新
   */
  checkUpdateHost (host, force = false) {
    Agent.emit('check_host_refresh', host, force)
  }

  autoCheckRefresh () {
    let remote_idx = -1
    this.state.list.map((host, idx) => {
      if (host.where === 'remote') {
        remote_idx++
      }
      setTimeout(() => {
        Agent.emit('check_host_refresh', host)
      }, 1000 * 5 * remote_idx + idx)
    })

    // let wait = 1000 * 60 * 10;
    let wait = 1000 * 30 // test only
    setTimeout(() => {
      this.autoCheckRefresh()
    }, wait)
  }

  apply (content, success) {
    Agent.emit('apply', content, () => {
      this.last_content = content
      success()
      Agent.emit('save_data', this.state.list)
      Agent.notify({
        message: 'host updated.'
      })
    })
  }

  selectOne (host) {
    this.setState({
      current: host
    })

    this.props.setCurrent(host)
  }

  toggleOne (idx, success) {

    let content = this.getOnContent(idx)
    this.apply(content, () => {
      let choice_mode = Agent.pref.get('choice_mode')
      if (choice_mode === 'single') {
        // 单选模式
        this.setState({
          list: this.state.list.map((item, _idx) => {
            if (idx !== _idx) {
              item.on = false
            }
            return item
          })
        })
      }

      if (typeof success === 'function') {
        success()
      }
    })
  }

  getOnItems (idx = -1) {
    let choice_mode = Agent.pref.get('choice_mode')
    return this.state.list.filter((item, _idx) => {
      if (choice_mode === 'single') {
        return !item.on && _idx === idx
      } else {
        return (item.on && _idx !== idx) || (!item.on && _idx === idx)
      }
    })
  }

  getOnContent (idx = -1) {
    let contents = this.getOnItems(idx).map((item) => {
      return item.content || ''
    })

    contents.unshift('# SwitchHosts!')

    return contents.join(`\n\n`)
  }

  customItems () {
    return this.state.list.map((item, idx) => {
      return (
        <ListItem
          data={item}
          idx={idx}
          selectOne={this.selectOne.bind(this)}
          current={this.state.current}
          onToggle={(success) => this.toggleOne(idx, success)}
          key={'host-' + idx}
          dragOrder={(sidx, tidx) => this.dragOrder(sidx, tidx)}
        />
      )
    })
  }

  dragOrder (source_idx, target_idx) {
    let source = this.state.list[source_idx]
    let target = this.state.list[target_idx]

    let list = this.state.list.filter((item, idx) => idx !== source_idx)
    let new_target_idx = list.findIndex((item) => item === target)

    let to_idx
    if (source_idx < target_idx) {
      // append
      to_idx = new_target_idx + 1
    } else {
      // insert before
      to_idx = new_target_idx
    }
    list.splice(to_idx, 0, source)

    this.setState({
      list: list
    })

    setTimeout(() => {
      Agent.emit('change')
    }, 100)
  }

  componentDidMount () {
  }

  render () {
    return (
      <div id="sh-list">
        <ListItem
          data={this.props.sys}
          lang={this.props.lang}
          selectOne={this.selectOne.bind(this)}
          current={this.state.current}
          sys="1"/>
        <div ref="items" className="custom-items">
          {this.customItems()}
        </div>
      </div>
    )
  }
}

export default List
