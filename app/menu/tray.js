/**
 * tray
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

//const fs = require('fs')
const path = require('path')
const {Menu, Tray, shell} = require('electron')
const m_lang = require('../server/lang')
const checkUpdate = require('../server/checkUpdate')
const pref = require('../server/pref')
const setPref = require('../server/actions/setPref')
const os = process.platform
const current_version = require('../version')
const svr = require('../server/svr')
const formatVersion = require('../libs/formatVersion')
const getUserHosts = require('../server/actions/getUserHosts')

let tray = null

function formatTitle (title) {
  if (!title) {
    return 'untitled'
  }

  let max_len = 30
  title = title.trim()
  if (title.length < max_len) {
    return title
  }

  return title.substr(0, max_len) + '..'
}

function makeMenu (app, list, contents, sys_lang) {
  let menu = []
  let lang = m_lang.getLang(pref.get('user_language', sys_lang))

  menu.push({
    label: 'SwitchHosts!',
    type: 'normal',
    // sublabel: util.formatVersion(current_version), // does not work on Mac
    click: () => {
      app.emit('show')
    }
  })
  menu.push({
    label: formatVersion(current_version),
    type: 'normal',
    enabled: false
  })
  menu.push({label: '-', type: 'separator'})

  let ac = '1234567890abcdefghijklmnopqrstuvwxyz'.split('')
  let item_idx = 0

  const addItem = (item, level = 0) => {
    menu.push({
      label: (''.padStart(level, '\u3000')) + formatTitle(item.title),
      type: 'checkbox',
      checked: item.on,
      accelerator: ac[item_idx],
      click: () => {
        svr.broadcast('toggle_hosts', Object.assign({}, item))
        //svr.emit('update_tray')
      }
    })
    item_idx++

    (item.children || []).map(i => addItem(i, level + 1))
  }

  list.map(i => addItem(i))

  menu.push({type: 'separator'})
  menu.push({
    label: lang.feedback, type: 'normal', click: () => {
      shell.openExternal('https://github.com/oldj/SwitchHosts/issues')
    }
  })

  menu.push({
    label: lang.check_update, type: 'normal', click: () => {
      checkUpdate.check()
    }
  })

  if (os === 'darwin') {
    menu.push({
      label: lang.toggle_dock_icon, type: 'normal', click: () => {
        let is_dock_visible = app.dock.isVisible()
        if (is_dock_visible) {
          app.dock.hide()
        } else {
          app.dock.show()
        }
        setPref(svr, 'is_dock_icon_hidden', is_dock_visible)
      }
    })
  }

  menu.push({type: 'separator'})
  menu.push({
    label: lang.quit,
    type: 'normal',
    accelerator: 'CommandOrControl+Q',
    click: () => {
      app.quit()
    }
  })

  return menu
}

function makeTitle (list = []) {
  const currItems = (list || []).filter(item => item.on) || []

  const appendTitleEvt = function (lis = [], opr = ',') {
    let _str = ''
    if (lis.length) {
      const appendTitle = (prev, curr) => {
        return {
          title: `${prev.title}${prev.title ? `${opr}` : ''}${curr.title}`
        }
      }
      _str = currItems.reduce(appendTitle, {title: ''}).title || ''
    }
    return _str
  }

  const _ori = appendTitleEvt(list)

  return {
    ori: _ori,
    show: _ori.length > 20 ? `${_ori.substr(0, 20)}...` : _ori,
    tips: `${appendTitleEvt(list, '\n')}`
  }
}

function makeTray (app, contents, sys_lang = 'en') {
  const lang = m_lang.getLang(sys_lang)

  let icon = 'logo.png'
  if (process.platform === 'darwin') {
    icon = 'logoTemplate.png'
  }

  tray = new Tray(path.join(__dirname, '..', 'assets', icon))

  svr.on('update_tray', () => {
    getUserHosts()
      .then(list => {
        let contextMenu = Menu.buildFromTemplate(makeMenu(app, list, contents, sys_lang))
        tray.setContextMenu(contextMenu)
        const {ori = '', show = '', tips = ''} = makeTitle(list)
        if (pref.get('show_title_on_tray')) {
          tray.setTitle(show)
          tray.setToolTip(ori ? `\n${lang.current_active_hosts}: \n\n${tips}\n` : 'SwitchHosts!')
        }
      })
  })

  let is_dock_icon_hidden = pref.get('is_dock_icon_hidden', false)
  if (is_dock_icon_hidden) {
    app.dock.hide()
  }

  tray.on('click', () => {
    if (process.platform === 'win32') {
      app.emit('show')
    }
  })

  svr.on('hosts_saved', () => {
    svr.emit('update_tray')
  })

  svr.emit('update_tray')
}

exports.makeTray = makeTray
