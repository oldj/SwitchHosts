/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Buttons from './buttons'
import SearchBar from './searchbar'
import List from './list'
import './panel.less'

export default class Panel extends React.Component {
  render () {
    return (
      <div id="panel">
        <List {...this.props}/>
        <SearchBar/>
        <Buttons/>
      </div>
    )
  }
}
