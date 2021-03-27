/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { LockOutlined } from '@ant-design/icons'
import classnames from 'classnames'
import SearchBar from './SearchBar'
import Agent from '../Agent'
import Editor from './Editor'

import styles from './Content.less'

export default class Content extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      is_loading: this.props.current.is_loading,
      show_search: false
    }
  }

  setValue (v) {
    this.props.setHostsContent(v)
  }

  componentDidMount () {
    Agent.on('search:start', () => {
      this.setState({show_search: true})
    })

    Agent.on('search:end', () => {
      this.setState({show_search: false})
    })
  }

  render () {
    let {current, readonly, lang} = this.props
    let {show_search} = this.state

    return (
      <div id="sh-content" className={styles.root}>
        <div className={styles.inform}>
          <span
            className={classnames({
              [styles.loading]: 1,
              [styles.show]: this.state.is_loading
            })}
          >loading...</span>
          <LockOutlined
            className={classnames({
              [styles.show]: readonly,
              iconfont: 1,
              'icon-lock2': 1
            })}
            title={lang.readonly}
          />
        </div>
        <div className={classnames({
          [styles.errorMessage]: 1,
          [styles.show]: !!current.error
        })}>{current.error}</div>
        <Editor
          readonly={readonly}
          id={current.id}
          code={current.content || ''}
          setValue={this.setValue.bind(this)}
          show_search={show_search}
        />
        {show_search ? (
          <div className={styles['search-bar-wrapper']}>
            <SearchBar lang={lang}/>
          </div>
        ) : null}
      </div>
    )
  }
}
