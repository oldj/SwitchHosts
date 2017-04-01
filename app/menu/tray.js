/**
 * tray
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const fs = require('fs')
const path = require('path')
const {Menu, Tray, shell} = require('electron')
const m_lang = require('../server/lang')
const checkUpdate = require('../server/checkUpdate')
const pref = require('../server/pref')
const setPref = require('../server/actions/setPref')
const os = process.platform
const current_version = require('../version').version
const svr = require('../server/svr')
const formatVersion = require('../libs/formatVersion')
const getUserHosts = require('../server/actions/getUserHosts')

let tray = null

function formatTitle (title) {
  if (!title) {
    return 'untitled'
  }

  let max_len = 30
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
  list.map((item, idx) => {
    menu.push({
      label: formatTitle(item.title),
      type: 'checkbox',
      checked: item.on,
      accelerator: ac[idx],
      click: () => {
        svr.broadcast('toggle_hosts', Object.assign({}, item))
        //svr.emit('update_tray')
      }
    })
  })

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

function makeTray (app, contents, sys_lang = 'en') {
  let icon = 'logo.png'
  if (process.platform === 'darwin') {
    icon = 'ilogoTemplate.png'
  }

  tray = new Tray(path.join(__dirname, '..', 'assets', icon))
  tray.setToolTip('SwitchHosts!')

  svr.on('update_tray', () => {
    getUserHosts()
      .then(list => {
        let contextMenu = Menu.buildFromTemplate(makeMenu(app, list, contents, sys_lang))
        tray.setContextMenu(contextMenu)
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
