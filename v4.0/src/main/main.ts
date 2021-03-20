import '@main/core/agent'
import * as message from '@main/core/message'
import '@main/core/popupMenu'
import '@main/data'
import '@main/tray'
import * as cron from '@main/libs/cron'
import getIndex from '@main/libs/getIndex'
import version from '@root/version.json'
import { app, BrowserWindow } from 'electron'
import * as path from 'path'

let win: BrowserWindow | null
let is_will_quit: boolean = false

const createWindow = async () => {
  win = new BrowserWindow({
    width: 800,
    height: 480,
    minWidth: 300,
    minHeight: 200,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
  })

  if (process.env.NODE_ENV !== 'production') {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1' // eslint-disable-line require-atomic-updates
  }

  win.loadURL(getIndex())
    .catch(e => console.error(e))

  if (process.env.NODE_ENV !== 'production') {
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
