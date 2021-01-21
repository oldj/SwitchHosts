import version from '@root/version.json'
import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as url from 'url'
import './agent'
import './message'
import { store } from './libs/config'

let win: BrowserWindow | null

const createWindow = async () => {
  win = new BrowserWindow({
    width: 800,
    height: 480,
    minWidth: 300,
    minHeight: 200,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
  })

  if (process.env.NODE_ENV !== 'production') {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1' // eslint-disable-line require-atomic-updates
    win.loadURL(`http://127.0.0.1:8084`)
    console.log(`config file: ${store.path}`)
  } else {
    win.loadURL(
      url.format({
        pathname: path.join(__dirname, 'renderer', 'index.html'),
        protocol: 'file:',
        slashes: true,
      }),
    )
  }

  if (process.env.NODE_ENV !== 'production') {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win!.webContents.openDevTools()
    })
  }

  win.on('closed', () => {
    win = null
  })
}

app.on('ready', async () => {
  console.log(`VERSION: ${version.join('.')}`)
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (win === null) {
    createWindow()
  }
})
