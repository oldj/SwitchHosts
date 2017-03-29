/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import Agent from '../Agent'
import './list-item.less'

export default class ListItem extends React.Component {
  constructor (props) {
    super(props)

    this.is_sys = !!this.props.sys
    this.state = {}
  }

  getTitle () {
    let {lang} = this.props
    return this.is_sys ? lang.sys_host_title : this.props.data.title ||
      lang.untitled
  }

  beSelected () {
    this.props.setCurrent(this.props.data)
  }

  toggle () {
    let on = !this.props.data.on

    Agent.emit('toggle_hosts', this.props.data, on)
  }

  toEdit () {
    Agent.emit('edit_hosts', this.props.data)
  }

  render () {
    let {data, sys, current} = this.props
    let is_selected = data === current

    if (!data) return null

    return (
      <div className={classnames({
        'list-item': 1
        //, 'hidden': !this.isMatched()
        , 'sys-hosts': sys
        , 'selected': is_selected
      })}
           onClick={this.beSelected.bind(this)}
      >
        {sys ? null : (
          <div>
            <i className={classnames({
              'switch': 1
              , 'iconfont': 1
              , 'icon-on': data.on
              , 'icon-off': !data.on
            })}
               onClick={this.toggle.bind(this)}
            />
            <i
              className="iconfont icon-edit"
              onClick={this.toEdit.bind(this)}
            />
          </div>
        )}
        <i className={classnames({
          'iconfont': 1
          , 'item-icon': 1
          , 'icon-warn': !!data.error
          , 'icon-file': !sys && !data.error && data.where !== 'group'
          , 'icon-files': data.where === 'group'
          , 'icon-sysserver': sys && !data.error
        })}
           title={data.error || ''}
        />
        <span>{this.getTitle()}</span>
      </div>
    )
  }
}
