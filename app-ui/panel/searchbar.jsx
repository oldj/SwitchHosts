/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import { Input, Icon } from 'antd'
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
          this.el_keyword.focus()
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

  emptySearch () {
    this.setState({keyword: ''})
    Agent.emit('search', '')
    this.el_keyword.focus()
  }

  onBlur () {
    if (!this.state.keyword) {
      this.clearSearch()
      this.onCancel()
    }
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

  onCancel () {
    Agent.emit('cancel_search')
  }

  render () {
    if (!this.state.show) {
      return null
    }
    return (
      <div id="sh-searchbar">
        <Input
          ref={c => this.el_keyword = c}
          size="large"
          //placeholder="keyword"
          suffix={this.state.keyword ? <Icon type="close-circle" onClick={this.emptySearch.bind(this)}/> : null}
          value={this.state.keyword}
          onBlur={this.onBlur.bind(this)}
          onChange={(e) => this.doSearch(e.target.value)}
          onKeyDown={(e) => (e.keyCode === 27 && this.onCancel())}
        />
      </div>
    )
  }
}
