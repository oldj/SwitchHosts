/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Buttons from './Buttons'
//import SearchBar from './searchbar'
import List from './List'
import styles from './Panel.less'
import Agent from '../Agent'

export default class Panel extends React.Component {
  
  handleOndragenter (events) {
    events.preventDefault()
  }

  handleOndragover (events) {
    events.preventDefault()
  }

  handleOndrop (events) {
    events.preventDefault()
    let file = events.dataTransfer.files[0]
    if (file) {
      Agent.emit('add_hosts', file.name, 'file://'+file.path)
    }
  }

  render () {
    return (
      <div id="panel" className={styles.root} onDragEnter={this.handleOndragenter} onDragOver={this.handleOndragover} onDrop={this.handleOndrop}>
        <List {...this.props}/>
        {/*<SearchBar/>*/}
        <Buttons/>
      </div>
    )
  }
}
