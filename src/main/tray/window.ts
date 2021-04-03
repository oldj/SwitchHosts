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
  let win = new BrowserWindow({
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
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
  })

  win.loadURL(`${getIndex()}#/tray`)
    .catch(e => console.error(e))

  win.hide()
  win.on('blur', () => win.hide())

  if (isDev()) {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win!.webContents.openDevTools()
    })
  }

  return win
}

export {
  makeWindow,
}
