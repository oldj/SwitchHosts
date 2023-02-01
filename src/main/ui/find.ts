/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { broadcast } from '@main/core/agent'
import getIndex from '@main/libs/getIndex'
import isDev from '@main/libs/isDev'
import events from '@common/events'
import { BrowserWindow } from 'electron'
import path from 'path'

const makeWindow = () => {
  let win: BrowserWindow | null
  win = new BrowserWindow({
    // frame: false,
    // titleBarStyle: 'hidden',
    hasShadow: true,
    // resizable: false,
    // transparent: true,
    width: 480,
    height: 400,
    minWidth: 400,
    minHeight: 400,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
  })

  // win.setVisibleOnAllWorkspaces(true, {
  //   visibleOnFullScreen: true,
  // })

  win.loadURL(`${getIndex()}#/find`).catch((e) => console.error(e))

  // win.on('blur', () => win?.hide())

  win.on('close', (e: Electron.Event) => {
    if (global.is_will_quit) {
      win = null
      global.find_win = null
    } else {
      e.preventDefault()
      win?.hide()
      broadcast(events.close_find)
    }
  })

  if (isDev()) {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win!.webContents.openDevTools()
    })
  }

  global.find_win = win

  return win
}

export { makeWindow }
