/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import Sortable from 'sortablejs'
import listToArray from 'wheel-js/src/common/listToArray'
import './group.less'

export default class Group extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      list: [],
      include: []
    }

    this.current_hosts = null
    this.ids = []
  }

  makeItem (item) {
    let attrs = {
      'data-id': item.id || ''
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
    let include = this.state.include
    let items = this.state.list
      .filter(item => item.where !== 'group' && !include.includes(item.id))
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
    let list = this.state.list
    let items = this.state.include
      .map(id => list.find(item => item.id === id))
      .map(item => this.makeItem(item))

    return (
      <div id="hosts-group-current">
        <div ref="group_current" className="hosts-group-list">
          {items}
        </div>
      </div>
    )
  }

  getCurrentListFromDOM () {
    let {updateInclude} = this.props
    let nodes = this.refs.group_current.getElementsByClassName('hosts-item')
    nodes = listToArray(nodes)
    let ids = nodes.map(item => item.getAttribute('data-id'))
    this.ids = ids
    updateInclude(ids)
  }

  componentWillMount () {
    this.setState({
      list: this.props.list,
      include: this.props.include
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
      , onSort: () => {
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
