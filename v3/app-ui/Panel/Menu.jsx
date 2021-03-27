/**
 * @author oldj
 */

import React from 'react'
import { Icon as LegacyIcon } from '@ant-design/compatible'
import { ToolOutlined } from '@ant-design/icons'
import Agent from '../Agent'
import { url_feedback, url_home } from '../../app/configs'
import styles from './Menu.less'

const menu = [
  {
    label: 'menu_about',
    icon: 'info-circle',
    click: () => {
      Agent.emit('show-about')
    }
  },
  {
    type: 'separator'
  },
  {
    label: 'import',
    icon: 'import',
    click: () => {
      Agent.pact('toImport')
    }
  },
  {
    label: 'export',
    icon: 'export',
    click: () => {
      Agent.pact('toExport')
    }
  },
  {
    type: 'separator'
  },
  {
    label: 'check_update',
    icon: 'reload',
    click: () => {
      Agent.pact('checkUpdate')
    }
  },
  {
    label: 'feedback',
    icon: 'message',
    click: () => {
      Agent.pact('openUrl', url_feedback)
    }
  },
  {
    label: 'homepage',
    icon: 'home',
    click: () => {
      Agent.pact('openUrl', url_home)
    }
  },
  {
    type: 'separator'
  },
  {
    label: 'preferences',
    icon: 'setting',
    click: () => {
      Agent.emit('show_preferences')
    }
  },
  {
    label: 'quit',
    icon: 'logout',
    click: () => {
      Agent.pact('quit')
    }
  }
]

export default class Menu extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      show: true
    }

    this.menu = null
  }

  onMenuItemClick (item) {
    if (typeof item.click !== 'function' || item.disabled) {
      return
    }

    try {
      item.click()
    } catch (e) {
      console.log(e)
    }

    this.props.toggleMenu()
  }

  menuItem (item, idx) {
    if (item.type === 'separator') {
      return (
        <div className={styles.sep}/>
      )
    }

    let {lang} = this.props
    return (
      <div
        className={styles.item}
        onClick={() => this.onMenuItemClick(item)}
        key={idx}
      >
        <span className={styles.item_icon}><LegacyIcon type={item.icon}/></span>
        <span className={styles.item_label}>{lang[item.label]}</span>
      </div>
    )
  }

  render () {
    let {show_menu, toggleMenu} = this.props
    if (!show_menu) return null

    return (
      <div className={styles.root}>
        <div className={styles.items}>
          {menu.map((item, idx) => this.menuItem(item, idx))}
        </div>
        <div className={styles.handler} onClick={toggleMenu}><ToolOutlined/></div>
      </div>
    )
  }
}
