/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import classnames from 'classnames'
import Icon, { CopyOutlined, DesktopOutlined, FileTextOutlined, FolderOutlined, FormOutlined, GlobalOutlined } from '@ant-design/icons'
import Agent from '../Agent'
import isInViewport from 'wheel-js/src/browser/isInViewport'
import { WHERE_REMOTE, WHERE_GROUP, WHERE_FOLDER } from '../configs/contants'
import IconOnLight from './images/on.svg'
import IconOffLight from './images/off.svg'
import IconOnDark from './images/on_dark.svg'
import IconOffDark from './images/off_dark.svg'
import styles from './ListItem.less'

export default class ListItem extends React.Component {
  constructor (props) {
    super(props)

    this.is_sys = !!this.props.sys
    this.state = {}
  }

  getTitle () {
    let {lang} = this.props
    return this.is_sys ? lang.sys_hosts_title : (this.props.data.title || lang.untitled)
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

    let {id, where, is_sys} = data
    const IconOn = theme === 'dark' ? IconOnDark : IconOnLight
    const IconOff = theme === 'dark' ? IconOffDark : IconOffLight

    let is_selected = id === current.id || (is_sys && current.is_sys)
    let attrs = {
      'data-id': id || '',
      draggable: !sys
    }

    let icon
    if (is_sys) {
      icon = <DesktopOutlined/>
    } else {
      switch (where) {
        case 'remote':
          icon = <GlobalOutlined/>
          break
        case 'group':
          icon = <CopyOutlined/>
          break
        case 'folder':
          icon = <FolderOutlined/>
          break
        default:
          icon = <FileTextOutlined/>
      }
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
              <FormOutlined onClick={this.toEdit.bind(this)} className={styles['icon-edit']}/>
            ) : null}
            <Icon
              className={styles.switcher}
              component={data.on ? IconOn : IconOff}
              onClick={this.toggle.bind(this)}
            />
          </div>
        )}
        <span className={styles['item-icon']}>{icon}</span>
        <span className={styles.title}>{this.getTitle()}</span>
      </div>
    )
  }
}
