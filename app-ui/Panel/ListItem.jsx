/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import { Icon, Tree } from 'antd'
import Agent from '../Agent'
import isInViewport from 'wheel-js/src/browser/isInViewport'
import { WHERE_REMOTE, WHERE_GROUP, WHERE_FOLDER } from '../configs/contants'
import makeSortable from './makeSortable'
import IconOnLight from './images/on.svg'
import IconOffLight from './images/off.svg'
import IconOnDark from './images/on_dark.svg'
import IconOffDark from './images/off_dark.svg'
import styles from './ListItem.less'
import { findPositions } from '../content/kw'

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

    if (data.where === WHERE_FOLDER) {
      //makeSortable(this.el_children)
    }
  }

  render () {
    let {
      data, sys, current, theme, not_match,
      drag_target_id, drag_where_to
    } = this.props
    if (!data) return null

    const IconOn = theme === 'dark' ? IconOnDark : IconOnLight
    const IconOff = theme === 'dark' ? IconOffDark : IconOffLight

    let is_selected = data.id === current.id || (data.is_sys && current.is_sys)
    let attrs = {
      'data-id': data.id || '',
      draggable: !sys
    }

    let {where} = data
    let icon_type
    if (sys) {
      icon_type = 'desktop'
    } else if (where === WHERE_REMOTE) {
      icon_type = 'global'
    } else if (where === WHERE_GROUP) {
      icon_type = 'copy'
    } else if (where === WHERE_FOLDER) {
      icon_type = 'folder'
    } else {
      icon_type = 'file-text'
    }

    return (
      <div
        className={classnames({
          'list-item': 1, // 用于排序选择
          [styles['list-item']]: 1,
          //, 'hidden': !this.isMatched()
          [styles['sys-hosts']]: sys,
          [styles['selected']]: is_selected,
          [styles['not-match']]: not_match,
          [styles['sort-bg']]: drag_target_id && data.id === drag_target_id
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
        <span className={styles.title}>{this.getTitle()}</span>

        {/*{this.renderChildren()}*/}
      </div>
    )
  }
}
