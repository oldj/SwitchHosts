/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import Sortable from 'sortablejs'
import listToArray from 'wheel-js/src/common/list-to-array'
import './group.less'

export default class Group extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      list: []
    }

    this.current_hosts = null
  }

  makeItem (item) {
    let attrs = {
      'data-id': 'id:' + (item.id || '')
    }
    return (
      <div className="hosts-item" {...attrs}>
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
  }

  makeList () {
    let items = this.state.list
      .filter(item => item.where !== 'group')
      .map(item => this.makeItem(item))

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

  getCurrentListFromDOM () {
    let nodes = this.refs.group_current.getElementsByClassName('hosts-item')
    nodes = listToArray(nodes)
    console.log(nodes)
  }

  componentWillMount () {
    console.log(1111)
    console.log(this.props)
    this.setState({
      list: this.props.list
    })
  }

  componentDidMount () {
    Sortable.create(this.refs.group_valid, {
      group: 'sorting'
      , sort: false
    })

    Sortable.create(this.refs.group_current, {
      group: 'sorting'
      , sort: true
      , onSort: evt => {
        this.getCurrentListFromDOM()
      }
    })
  }

  render () {
    return (
      <div id="hosts-group">
        {this.makeList()}
        <div className="arrow"/>
        {this.currentList()}
      </div>
    )
  }
}
