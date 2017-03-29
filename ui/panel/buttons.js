/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict';

import React from 'react'
import classnames from 'classnames'
import Agent from '../Agent'
import './buttons.less'

export default class Buttons extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      top_toggle_on: true,
      search_on: false
    }

    this.on_items = null
  }

  static btnAdd () {
    Agent.emit('add_host')
  }

  btnToggle () {
    if (this.state.top_toggle_on) {
      Agent.emit('get_on_hosts', (items) => {
        this.on_items = items
      })
    }

    this.setState({
      top_toggle_on: !this.state.top_toggle_on
    }, () => {
      Agent.emit('top_toggle', this.state.top_toggle_on, this.on_items)
      if (this.state.top_toggle_on) {
        this.on_items = null
      }
    })
  }

  btnSearch () {
    this.setState({
      search_on: !this.state.search_on
    }, () => {
      Agent.emit(this.state.search_on ? 'search_on' : 'search_off')
    })
  }

  cancelSearch () {
    this.setState({
      search_on: false
    }, () => {
      Agent.emit('search_off')
    })
  }

  componentDidMount () {
    Agent.on('to_search', () => {
      this.btnSearch()
    })
  }

  render () {
    return (
      <div id="sh-buttons">
        <div className="left">
          <a
            className="btn-add"
            href="#"
            onClick={() => Buttons.btnAdd()}
          >+</a>
        </div>

        <div className="right">
          <i
            className={classnames({
              iconfont: 1,
              'icon-search': 1,
              'on': this.state.search_on
            })}
            onClick={() => this.btnSearch()}
          />
          <i
            className={classnames({
              iconfont: 1,
              'icon-switchon': this.state.top_toggle_on,
              'icon-switchoff': !this.state.top_toggle_on
            })}
            onClick={() => this.btnToggle()}
          />
        </div>
      </div>
    )
  }
}
