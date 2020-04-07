/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Icon as LegacyIcon } from '@ant-design/compatible'
import { ArrowRightOutlined } from '@ant-design/icons'
import Sortable from 'sortablejs'
import treeFunc from '../../app/libs/treeFunc'
import { WHERE_GROUP, WHERE_FOLDER } from '../configs/contants'
import listToArray from 'wheel-js/src/common/listToArray'
import './Group.less'

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
    if (!item) {
      return null
    }

    let {where, title} = item

    let attrs = {
      'data-id': item.id || ''
    }

    let icon_type
    if (where === 'remote') {
      icon_type = 'global'
      //} else if (where === 'group') {
      //  icon_type = 'copy'
      //} else if (where === 'folder') {
      //  icon_type = 'folder'
    } else {
      icon_type = 'file-text'
    }

    return (
      <div className="hosts-item" {...attrs}>
        <LegacyIcon
          type={icon_type}
          className="iconfont"
        />
        <span>{title || 'untitled'}</span>
      </div>
    )
  }

  makeList () {
    let include = this.state.include
    let items = treeFunc.flatTree(this.state.list)
      .filter(item => !([WHERE_FOLDER, WHERE_GROUP]).includes(item.where) && !include.includes(item.id))
      .map(item => this.makeItem(item))

    return (
      <div id="hosts-group-valid">
        <div ref={c => this.el_group_valid = c} className="hosts-group-list">
          {items}
        </div>
      </div>
    )
  }

  currentList () {
    let list = treeFunc.flatTree(this.state.list)
    let items = this.state.include
      .map(id => list.find(item => item.id === id))
      .map(item => this.makeItem(item))

    return (
      <div id="hosts-group-current">
        <div ref={c => this.el_group_current = c} className="hosts-group-list">
          {items}
        </div>
      </div>
    )
  }

  getCurrentListFromDOM () {
    let {updateInclude} = this.props
    let nodes = this.el_group_current.getElementsByClassName('hosts-item')
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
    Sortable.create(this.el_group_valid, {
      group: 'sorting'
      , animation: 150
      , sort: false
    })

    Sortable.create(this.el_group_current, {
      group: 'sorting'
      , animation: 150
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
        <ArrowRightOutlined className="arrow"/>
        {this.currentList()}
      </div>
    )
  }
}
