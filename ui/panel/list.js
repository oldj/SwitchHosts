/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import ListItem from './list-item'
import './list.less'

export default class List extends React.Component {

  constructor (props) {
    super(props)

    this.state = {}
  }

  customItems () {
    return this.props.list.map((item, idx) => {
      return (
        <ListItem
          data={item}
          idx={idx}
          current={this.props.current}
          setCurrent={this.props.setCurrent}
          //onToggle={(success) => this.toggleOne(idx, success)}
          key={'host-' + idx}
          //dragOrder={(sidx, tidx) => this.dragOrder(sidx, tidx)}
        />
      )
    })
  }

  render () {
    return (
      <div id="sh-list">
        <ListItem
          data={this.props.sys_hosts}
          lang={this.props.lang}
          current={this.props.current}
          setCurrent={this.props.setCurrent}
          sys="1"/>
        <div ref="items" className="custom-items">
          {this.customItems()}
        </div>
      </div>
    )
  }
}
