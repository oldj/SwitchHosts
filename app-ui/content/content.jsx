/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Icon } from 'antd'
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

  setValue (v) {
    this.props.setHostsContent(v)
  }

  render () {
    let {current, readonly, lang} = this.props

    return (
      <div id="sh-content">
        <div className="inform">
          <span
            className={classnames({
              loading: 1,
              show: this.state.is_loading
            })}
          >loading...</span>
          {/*<Icon*/}
            {/*type="global"*/}
            {/*className={classnames({*/}
              {/*show: current.where === 'remote',*/}
              {/*iconfont: 1,*/}
              {/*'icon-earth': 1*/}
            {/*})}*/}
            {/*title={lang.remote_hosts}*/}
          {/*/>*/}
          <Icon
            type="lock"
            className={classnames({
              show: readonly,
              iconfont: 1,
              'icon-lock2': 1
            })}
            title={lang.readonly}
          />
        </div>
        <div className={classnames({
          errorMessage: 1,
          show: !!current.error
        })}>{current.error}</div>
        <Editor
          readonly={readonly}
          code={current.content || ''}
          setValue={this.setValue.bind(this)}
        />
      </div>
    )
  }
}
