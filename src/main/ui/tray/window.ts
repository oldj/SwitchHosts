/**
 * window
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getIndex from '@main/libs/getIndex'
import isDev from '@main/libs/isDev'
import { BrowserWindow } from 'electron'
import path from 'path'

const makeWindow = () => {
  let win: BrowserWindow | null
  // Linux AppImage APP can't automatically recognize dock icon, requires special configuration to display correctly
  let linux_icon = {}
  if (process.platform === 'linux') {
    linux_icon = {
      icon: path.join(__dirname, '/assets/icon.png'),
    }
  }
  win = new BrowserWindow({
    frame: false,
    // titleBarStyle: 'hidden',
    hasShadow: true,
    resizable: false,
    // transparent: true,
    width: 300,
    height: 600,
    minWidth: 300,
    minHeight: 200,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
    ...linux_icon,
  })

  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  })

  win.loadURL(`${getIndex()}#/tray`).catch((e) => console.error(e))

  win.on('blur', () => win?.hide())

  win.on('close', (e: Electron.Event) => {
    if (global.is_will_quit) {
      win = null
    } else {
      e.preventDefault()
      win?.hide()
    }
  })

  if (isDev()) {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win!.webContents.openDevTools()
    })
  }

  return win
}

export { makeWindow }
