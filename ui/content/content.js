/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import Editor from './editor'
import './content.less'

export default class Content extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      is_loading: this.props.current.is_loading
    }
  }

  setValue(v) {
    this.props.setHostsContent(v)
  }

  render () {
    let {current, lang} = this.props

    return (
      <div id="sh-content">
        <div className="inform">
                    <span
                      className={classnames({
                        loading: 1,
                        show: this.state.is_loading
                      })}
                    >loading...</span>
          <i
            className={classnames({
              show: current.where === 'remote',
              iconfont: 1,
              'icon-earth': 1
            })}
            title={lang.remote_hosts}
          />
          <i
            className={classnames({
              show: this.props.readonly,
              iconfont: 1,
              'icon-lock2': 1
            })}
            title={lang.readonly}
          />
        </div>
        <div className={classnames({
          errorMessage: 1,
          show: !!this.props.current.error
        })}>{this.props.current.error}</div>
        <Editor
          readonly={this.props.readonly}
          code={this.props.current.content || ''}
          setValue={this.setValue.bind(this)}
        />
      </div>
    )
  }
}
