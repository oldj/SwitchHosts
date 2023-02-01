/**
 * main.ts
 * @author oldj
 * @homepage https://oldj.net
 */

import { configAll, configGet } from '@main/actions'
import '@main/core/agent'
import * as message from '@main/core/message'
import '@main/core/popupMenu'
import '@main/data'
import * as http_api from '@main/http'
import * as cron from '@main/libs/cron'
import getIndex from '@main/libs/getIndex'
import isDev from '@main/libs/isDev'
import Tracer from '@main/libs/tracer'
import checkSystemLocale from '@main/ui/checkSystemLocale'
import * as find from '@main/ui/find'
import { makeMainMenu } from '@main/ui/menu'
import '@main/ui/tray'
import version from '@/version.json'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import windowStateKeeper from 'electron-window-state'
import * as path from 'path'
import { v4 as uuid4 } from 'uuid'
import { getSwhDb } from '@main/data'

let win: BrowserWindow | null

const createWindow = async () => {
  await getSwhDb()
  const configs = await configAll()

  let main_window_state = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 480,
  })

  let linux_icon = {}
  if (process.platform === 'linux') {
    linux_icon = {
      icon: path.join(__dirname, '/assets/icon.png'),
    }
  }

  win = new BrowserWindow({
    x: main_window_state.x,
    y: main_window_state.y,
    width: main_window_state.width,
    height: main_window_state.height,
    minWidth: 300,
    minHeight: 200,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    frame: configs.use_system_window_frame || false,
    hasShadow: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
    ...linux_icon,
  })

  main_window_state.manage(win)

  const ses = win.webContents.session
  // console.log(ses.getUserAgent())
  global.ua = ses.getUserAgent()
  global.main_win = win

  if (configs.hide_at_launch) {
    win.hide()
  }

  let hide_dock_icon = await configGet('hide_dock_icon')
  if (hide_dock_icon) {
    app.dock && app.dock.hide()
  } else {
    app.dock && app.dock.show().catch((e) => console.error(e))
  }

  console.log('isDev: ', isDev())
  if (isDev()) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1' // eslint-disable-line require-atomic-updates
  }

  makeMainMenu(configs.locale)

  win.loadURL(getIndex()).catch((e) => console.error(e))

  if (isDev()) {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win!.webContents.openDevTools()
    })
  }

  win.on('close', (e: Electron.Event) => {
    if (global.is_will_quit) {
      win = null
    } else {
      e.preventDefault()
      win?.hide()
    }
  })

  win.on('closed', () => {
    win = null
  })

  ipcMain.handle('dark-mode:toggle', () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = 'light'
    } else {
      nativeTheme.themeSource = 'dark'
    }
    return nativeTheme.shouldUseDarkColors
  })

  ipcMain.handle('dark-mode:dark', () => {
    nativeTheme.themeSource = 'dark'
  })

  ipcMain.handle('dark-mode:light', () => {
    nativeTheme.themeSource = 'light'
  })

  ipcMain.handle('dark-mode:system', () => {
    nativeTheme.themeSource = 'system'
  })
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (win) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
    }
  })
}

const onActive = async () => {
  if (win === null) {
    await createWindow()
  } else if (win.isMinimized()) {
    await win.restore()
  }
  win?.show()
}

global.tracer = new Tracer()

app.on('ready', async () => {
  console.log(`VERSION: ${version.join('.')}`)
  global.session_id = uuid4()
  await checkSystemLocale()

  await createWindow()
  cron.start()

  let http_api_on = await configGet('http_api_on')
  let http_api_only_local = await configGet('http_api_only_local')
  if (http_api_on) {
    http_api.start(http_api_only_local)
  }

  find.makeWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => (global.is_will_quit = true))
app.on('activate', onActive)
message.on('active_main_window', onActive)
