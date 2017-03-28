/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
//import Buttons from './buttons'
//import SearchBar from './searchbar'
//import List from './list'
import './panel.less'

export default class Panel extends React.Component {
  render () {
    let {current, list, sys, setCurrent, lang} = this.props

    return (
      <div id="panel">
        {/*<List*/}
          {/*list={list}*/}
          {/*sys={sys}*/}
          {/*current={current}*/}
          {/*setCurrent={setCurrent}*/}
          {/*lang={lang}*/}
        {/*/>*/}
        {/*<SearchBar/>*/}
        {/*<Buttons/>*/}
      </div>
    )
  }
}
