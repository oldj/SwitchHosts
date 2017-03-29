/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import Agent from '../Agent'
import './frame.less'

export default class MyFrame extends React.Component {
  constructor (props) {
    super(props)
  }

  componentDidMount () {
    Agent.on('esc', () => {
      this.onCancel()
    })
  }

  onOK () {
    this.props.onOK()
  }

  onCancel () {
    this.props.onCancel()
  }

  renderFootButtons () {
    let html = []
    let {lang} = this.props

    html.push(
      <div
        className="button btn-cancel"
        key="btn-cancel"
        onClick={this.onCancel.bind(this)}
      >
        {this.props.cancel_title || lang.cancel}
      </div>
    )

    html.push(
      <div
        className="button btn-ok btn-default"
        key="btn-ok"
        onClick={this.onOK.bind(this)}
      >
        {this.props.ok_title || lang.ok}
      </div>
    )

    return html
  }

  render () {
    if (!this.props.show) {
      return null
    }

    return (
      <div className="frame" ref="frame">
        <div className="overlay"/>
        <div className="prompt">
          <div className="head">{this.props.head}</div>
          <div className="body">{this.props.body}</div>
          <div className="foot">{this.renderFootButtons()}</div>
        </div>
      </div>
    )
  }
}
