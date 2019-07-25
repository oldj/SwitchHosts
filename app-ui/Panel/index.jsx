/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Buttons from './Buttons'
//import SearchBar from './searchbar'
import List from './List'
import styles from './index.less'
import Agent from '../Agent'

export default class Index extends React.Component {

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
      Agent.emit('add_hosts', file.name, 'file://' + file.path)
    }
  }

  render () {
    let {platform} = Agent

    return (
      <div id="panel" className={styles.root} onDragEnter={this.handleOndragenter} onDragOver={this.handleOndragover}
           onDrop={this.handleOndrop}>
        {platform === 'darwin' ? (
          <div className={styles.mac_handler}/>
        ) : null}
        <List {...this.props}/>
        {/*<SearchBar/>*/}
        <Buttons {...this.props}/>
      </div>
    )
  }
}
