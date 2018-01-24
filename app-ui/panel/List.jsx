/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import ListItem from './ListItem'
import Sortable from 'sortablejs'
import listToArray from 'wheel-js/src/common/listToArray'
import Agent from '../Agent'
import { findPositions } from '../content/kw'
import styles from './List.less'

export default class List extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      kw: ''
    }

    Agent.on('search:kw', kw => {
      this.setState({kw})
    })
  }

  customItems () {
    let kw = this.state.kw

    function match (kw, item) {
      return findPositions(kw, item.content).length > 0 || findPositions(kw, item.title).length > 0
    }

    return this.props.list.map((item, idx) => {
      let show = true
      if (kw && !match(kw, item)) {
        show = false
      }

      return (
        <ListItem
          data={item}
          idx={idx}
          key={'hosts-' + idx + Math.random()}
          show={show}
          {...this.props}
        />
      )
    })
  }

  getCurrentListFromDOM () {
    let nodes = this.el_items.getElementsByClassName('list-item')
    nodes = listToArray(nodes)
    let ids = nodes.map(el => el.getAttribute('data-id'))

    Agent.emit('sort', ids)
  }

  componentDidMount () {
    Sortable.create(this.el_items, {
      group: 'list-sorting'
      , sort: true
      , animation: 150
      , onStart: () => {
        Agent.emit('drag_start')
      }
      , onSort: () => {
        this.getCurrentListFromDOM()
        Agent.emit('drag_end')
        //console.log(evt)
        //console.log(evt.item)
        //console.log(evt.oldIndex, evt.newIndex)
      }
    })
  }

  render () {
    return (
      <div id="sh-list" className={styles.root}>
        <ListItem
          data={this.props.sys_hosts}
          {...this.props}
          sys="1"/>
        <div ref={c => this.el_items = c} className={styles['custom-items']}>
          {this.customItems()}
        </div>
      </div>
    )
  }
}
