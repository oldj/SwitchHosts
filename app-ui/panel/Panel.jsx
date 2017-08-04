/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Buttons from './Buttons'
import SearchBar from './searchbar'
import List from './List'
import styles from './Panel.less'

export default class Panel extends React.Component {
  render () {
    return (
      <div id="panel" className={styles.root}>
        <List {...this.props}/>
        <SearchBar/>
        <Buttons/>
      </div>
    )
  }
}
