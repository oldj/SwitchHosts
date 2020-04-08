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
import treeFunc from '../../app/libs/treeFunc'
import { WHERE_FOLDER, WHERE_GROUP, WHERE_REMOTE } from '../configs/contants'
import styles from './List.less'

export default class List extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      kw: '',
      drag_target_id: null,
      drag_where_to: null,
      expanded_keys: []
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
      let not_match = false
      if (kw && !match(kw, item)) {
        not_match = true
      }

      let {id, where} = item

      //return (
      //  <Tree.TreeNode
      //    key={'hosts_' + id + '_' + idx}
      //    title={
      //      <ListItem
      //        {...this.props}
      //        {...{kw, drag_target_id, drag_where_to, not_match}}
      //        data={item}
      //      />
      //    }
      //    //isLeaf={item.where !== WHERE_FOLDER}
      //  >
      //    {(item.children || []).length > 0 ? this.customItems(item.children) : null}
      //  </Tree.TreeNode>
      //)

      return {
        title: (
          <ListItem
            {...this.props}
            {...{kw, drag_target_id, drag_where_to, not_match}}
            data={item}
          />
        ),
        //title: item.title || lang.untitled,
        key: 'hosts_' + id,
        disabled: item.is_sys,
        isLeaf: where !== WHERE_FOLDER,
        children: (item.children || []).length > 0 ? this.customItems(item.children) : []
      }
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
    //console.log(info)
    const source_id = info.dragNode.props.eventKey.split('_')[1]
    const target_id = info.node.props.eventKey.split('_')[1]
    const drop_pos = info.node.props.pos.split('-')
    const where_to = info.dropPosition - Number(drop_pos[drop_pos.length - 1])

    //console.log(source_id, target_id, where_to)
    let {list} = this.props
    let target_item = treeFunc.getItemById(list, target_id)
    if (!target_item || (where_to === 0 && target_item.where !== WHERE_FOLDER)) {
      return false
    }

    Agent.emit('drag_done', {
      source_id,
      target_id,
      where_to
    })
  }

  onExpand (keys) {
    //console.log(keys)
    //console.log(o)
    this.setState({expanded_keys: keys})
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
    let {expanded_keys} = this.state

    return (
      <div id="sh-list" className={styles.root}>
        <ListItem
          data={sys_hosts}
          {...this.props}
          sys="1"
        />
        <div ref={c => this.el_items = c} className={styles['custom-items']}>
          {/*  {this.customItems()}*/}
          <Tree
            blockNode
            draggable
            defaultExpandAll
            onDragEnter={this.onDragEnter.bind(this)}
            onDrop={this.onDrop.bind(this)}
            onExpand={this.onExpand.bind(this)}
            expandedKeys={expanded_keys}
            treeData={this.customItems(list)}
          />
        </div>
      </div>
    )
  }
}
