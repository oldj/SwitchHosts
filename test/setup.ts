import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(testDir, 'tmp')
const testTmpDir = path.join(tmpDir, 'electron')
const testHomeDir = path.join(tmpDir, 'home')

fs.rmSync(tmpDir, { force: true, recursive: true })
fs.mkdirSync(testHomeDir, { recursive: true })

process.env.HOME = testHomeDir
process.env.USERPROFILE = testHomeDir
;(globalThis as typeof globalThis & { data_dir?: string }).data_dir = path.join(testHomeDir, '.SwitchHosts')

class BrowserWindowMock {
  static fromWebContents() {
    return new BrowserWindowMock()
  }

  private bounds = { x: 0, y: 0, width: 300, height: 600 }
  private focused = false
  private visible = false

  webContents = {
    closeDevTools() {},
    openDevTools() {},
    once() {},
    session: {
      setPermissionRequestHandler() {},
      webRequest: {
        onBeforeSendHeaders() {},
        onHeadersReceived() {},
      },
    },
    toggleDevTools() {},
  }

  constructor(options?: { width?: number; height?: number }) {
    if (options?.width) this.bounds.width = options.width
    if (options?.height) this.bounds.height = options.height
  }

  focus() {
    this.focused = true
  }

  getBounds() {
    return this.bounds
  }

  hide() {
    this.focused = false
    this.visible = false
  }

  isFocused() {
    return this.focused
  }

  isVisible() {
    return this.visible
  }

  loadURL() {
    return Promise.resolve()
  }

  on() {
    return this
  }

  setPosition(x: number, y: number) {
    this.bounds.x = x
    this.bounds.y = y
  }

  setVisibleOnAllWorkspaces() {}

  show() {
    this.focused = true
    this.visible = true
  }
}

const electronMock = {
  app: {
    getPath(name: string) {
      if (name === 'userData') {
        fs.mkdirSync(testTmpDir, { recursive: true })
        return testTmpDir
      }

      return testTmpDir
    },
    quit() {},
    whenReady() {
      return new Promise(() => {})
    },
    dock: {
      hide() {},
      show() {
        return Promise.resolve()
      },
    },
  },
  BrowserWindow: BrowserWindowMock,
  Menu: {
    buildFromTemplate() {
      return {}
    },
  },
  MenuItem: class MenuItem {},
  Tray: class Tray {
    setToolTip() {}
    setContextMenu() {}
    on() {}
    popUpContextMenu() {}
    getBounds() {
      return { x: 0, y: 0, width: 20, height: 20 }
    }
  },
  screen: {
    getCursorScreenPoint() {
      return { x: 0, y: 0 }
    },
    getDisplayNearestPoint() {
      return {
        bounds: { x: 0, y: 0, width: 1200, height: 800 },
        workAreaSize: { width: 1200, height: 800 },
      }
    },
  },
  shell: {
    openExternal() {
      return Promise.resolve()
    },
    showItemInFolder() {
      return Promise.resolve()
    },
  },
  dialog: {
    showOpenDialog() {
      return Promise.resolve({ canceled: true, filePaths: [] })
    },
    showSaveDialog() {
      return Promise.resolve({ canceled: true, filePath: undefined })
    },
  },
  ipcMain: {
    emit() {},
    on() {},
    handle() {},
    removeHandler() {},
    removeAllListeners() {},
  },
  ipcRenderer: {
    invoke() {
      return Promise.resolve(undefined)
    },
    on() {},
    send() {},
    removeAllListeners() {},
  },
  contextBridge: {
    exposeInMainWorld() {},
  },
  nativeTheme: {
    shouldUseDarkColors: false,
  },
}

vi.mock('electron', () => electronMock)
