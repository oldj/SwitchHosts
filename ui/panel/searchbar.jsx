/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Agent from '../Agent'
import './searchbar.less'

export default class SearchBar extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      show: false,
      keyword: ''
    }

    this._t = null

    Agent.on('search_on', () => {
      this.setState({
        show: true
      }, () => {
        setTimeout(() => {
          this.refs.keyword.focus()
        }, 100)
      })
    })

    Agent.on('search_off', () => {
      this.clearSearch()
    })
  }

  clearSearch () {
    this.setState({
      show: false,
      keyword: ''
    })
    Agent.emit('search', '')
  }

  doSearch (kw) {
    this.setState({
      keyword: kw
    })

    clearTimeout(this._t)
    this._t = setTimeout(() => {
      Agent.emit('search', kw)
    }, 300)
  }

  static onCancel () {
    Agent.emit('cancel_search')
  }

  render () {
    if (!this.state.show) {
      return null
    }
    return (
      <div id="sh-searchbar">
        <input
          ref="keyword"
          type="text"
          placeholder="keyword"
          value={this.state.keyword}
          onChange={(e) => this.doSearch(e.target.value)}
          onKeyDown={(e) => (e.keyCode === 27 && SearchBar.onCancel())}
        />
      </div>
    )
  }
}
