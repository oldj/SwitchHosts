import { configAll, configGet } from '@main/actions'
import '@main/core/agent'
import * as message from '@main/core/message'
import '@main/core/popupMenu'
import '@main/data'
import * as cron from '@main/libs/cron'
import getIndex from '@main/libs/getIndex'
import isDev from '@main/libs/isDev'
import { makeMainMenu } from '@main/libs/menu'
import '@main/http'
import '@main/tray'
import version from '@root/version.json'
import { app, BrowserWindow } from 'electron'
import windowStateKeeper from 'electron-window-state'
import * as path from 'path'
import { v4 as uuid4 } from 'uuid'

let win: BrowserWindow | null
let is_will_quit: boolean = false

const createWindow = async () => {
  const configs = await configAll()

  let main_window_state = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 480,
  })

  win = new BrowserWindow({
    x: main_window_state.x,
    y: main_window_state.y,
    width: main_window_state.width,
    height: main_window_state.height,
    minWidth: 300,
    minHeight: 200,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    frame: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
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
    app.dock.hide()
  }

  console.log('isDev: ', isDev())
  if (isDev()) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1' // eslint-disable-line require-atomic-updates
  }

  makeMainMenu(configs.locale)

  win.loadURL(getIndex())
    .catch(e => console.error(e))

  if (isDev()) {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win!.webContents.openDevTools()
    })
  }

  win.on('close', (e: Electron.Event) => {
    if (is_will_quit) {
      win = null
    } else {
      e.preventDefault()
      win?.hide()
    }
  })

  win.on('closed', () => {
    win = null
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

app.on('ready', async () => {
  console.log(`VERSION: ${version.join('.')}`)
  global.session_id = uuid4()
  await createWindow()
  cron.start()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => is_will_quit = true)
app.on('activate', onActive)
message.on('active_main_window', onActive)
