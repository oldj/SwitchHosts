/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import Sortable from 'sortablejs'
import './group.less'

export default class Group extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      list: this.props.hosts.list
    }

    this.current_host = null
  }

  makeList () {
    let items = this.state.list.map(item => {
      return (
        <div className="host-item">
          <i className={classnames({
            'iconfont': 1
            , 'item-icon': 1
            , 'icon-file': item.where !== 'group'
            , 'icon-files': item.where === 'group'
          })}
          />
          <span>{item.title}</span>
        </div>
      )
    })

    return (
      <div id="hosts-group-valid">
        <div ref="group_valid" className="hosts-group-list">
          {items}
        </div>
      </div>
    )
  }

  currentList () {
    return (
      <div id="hosts-group-current">
        <div ref="group_current" className="hosts-group-list"></div>
      </div>
    )
  }

  componentDidMount () {
    Sortable.create(this.refs.group_valid, {
      group: 'sorting'
      , sort: false
    })

    Sortable.create(this.refs.group_current, {
      group: 'sorting'
      , sort: true
    })
  }

  render () {
    return (
      <div id="hosts-group">
        {this.makeList()}
        <div className="arrow"></div>
        {this.currentList()}
      </div>
    )
  }
}
