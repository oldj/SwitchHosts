/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Tree } from 'antd'
import ListItem from './ListItem'
import Agent from '../Agent'
import { findPositions } from '../content/kw'
//import makeSortable from './makeSortable'
import styles from './List.less'

export default class List extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      kw: '',
      drag_target_id: null,
      drag_where_to: null
    }

    Agent.on('search:kw', kw => {
      this.setState({kw})
    })
  }

  customItems (tree_data) {
    let {kw, drag_target_id, drag_where_to} = this.state

    function match (kw, item) {
      return findPositions(kw, item.content).length > 0 || findPositions(kw, item.title).length > 0
    }

    return tree_data.map((item, idx) => {
      let show = true
      if (kw && !match(kw, item)) {
        show = false
      }

      return (
        <Tree.TreeNode
          key={'hosts_' + item.id + '_' + idx}
          title={
            <ListItem
              {...this.props}
              {...{kw, drag_target_id, drag_where_to}}
              data={item}
              //show={show}
            />
          }
        >
          {(item.children || []).length > 0 ? this.customItems(item.children) : null}
        </Tree.TreeNode>
      )
    })
  }

  onDragEnter (info) {
    console.log(info)
    // expandedKeys 需要受控时设置
    // this.setState({
    //   expandedKeys: info.expandedKeys,
    // });
  }

  onDrop (info) {
    console.log(info)
    const source_id = info.dragNode.props.eventKey.split('_')[1]
    const target_id = info.node.props.eventKey.split('_')[1]
    const drop_pos = info.node.props.pos.split('-')
    const where_to = info.dropPosition - Number(drop_pos[drop_pos.length - 1])

    console.log(source_id, target_id, where_to)

    Agent.emit('drag_done', {
      source_id,
      target_id,
      where_to
    })
  }

  componentDidMount () {
    //makeSortable(this.el_items)

    Agent.on('drag_move', (drag_target_id, drag_where_to) => {
      this.setState({
        drag_target_id,
        drag_where_to
      })
    })

    Agent.on('drag_done', () => {
      this.setState({
        drag_target_id: null,
        drag_where_to: null
      })
    })
  }

  render () {
    let {list, sys_hosts} = this.props

    return (
      <div id="sh-list" className={styles.root}>
        <ListItem
          data={sys_hosts}
          {...this.props}
          sys="1"
        />
        {/*<div ref={c => this.el_items = c} className={styles['custom-items']}>*/}
        {/*  {this.customItems()}*/}
        {/*</div>*/}
        <Tree
          blockNode
          draggable
          defaultExpandAll
          onDragEnter={this.onDragEnter.bind(this)}
          onDrop={this.onDrop.bind(this)}
        >
          {this.customItems(list)}
        </Tree>
      </div>
    )
  }
}
