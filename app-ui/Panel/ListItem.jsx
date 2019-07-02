/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import { Icon } from 'antd'
import Agent from '../Agent'
import isInViewport from 'wheel-js/src/browser/isInViewport'
import IconOn from './images/on.svg'
import IconOff from './images/off.svg'
import styles from './ListItem.less'

export default class ListItem extends React.Component {
  constructor (props) {
    super(props)

    this.is_sys = !!this.props.sys
    this.state = {}
  }

  getTitle () {
    let {lang} = this.props
    return this.is_sys ? lang.sys_hosts_title : this.props.data.title ||
      lang.untitled
  }

  beSelected () {
    this.props.setCurrent(this.props.data)
  }

  toggle () {
    Agent.emit('toggle_hosts', Object.assign({}, this.props.data))
  }

  toEdit () {
    Agent.emit('edit_hosts', Object.assign({}, this.props.data))
  }

  componentDidMount () {
    let {just_added_id, data} = this.props
    //Agent.on('select_hosts', id => {
    //  if (id && id === this.props.data.id) {
    //    this.beSelected()
    //    this.el && this.el.scrollIntoView()
    //  }
    //})

    if (!this.el) {
      return
    }

    let el = this.el
    if (just_added_id === data.id && !isInViewport(el)) {
      el.scrollIntoView()
      this.props.justAdd(null)
    }
  }

  render () {
    let {data, sys, current, show} = this.props
    if (!data) return null

    let is_selected = data.id === current.id || (data.is_sys && current.is_sys)
    let attrs = {
      'data-id': data.id || ''
    }

    let icon_type
    if (sys) {
      icon_type = 'desktop'
    } else if (data.where === 'remote') {
      icon_type = 'global'
    } else if (data.where === 'group') {
      icon_type = 'copy'
    } else {
      icon_type = 'file-text'
    }

    return (
      <div className={classnames({
        'list-item': 1, // 用于排序选择
        [styles['list-item']]: 1,
        //, 'hidden': !this.isMatched()
        [styles['sys-hosts']]: sys,
        [styles['selected']]: is_selected,
        'hidden': show === false
      })}
           onClick={this.beSelected.bind(this)}
           ref={el => this.el = el}
           {...attrs}
      >
        {sys ? null : (
          <div className={styles['item-buttons']}>
            {is_selected ? (
              <Icon
                type="form"
                onClick={this.toEdit.bind(this)}
                className={styles['icon-edit']}
              />
            ) : null}
            <Icon
              className={styles.switcher}
              component={data.on ? IconOn : IconOff}
              onClick={this.toggle.bind(this)}
            />
          </div>
        )}
        <Icon
          type={icon_type}
          className={styles['item-icon']}
          title={data.error || ''}
        />
        <span>{this.getTitle()}</span>
      </div>
    )
  }
}
