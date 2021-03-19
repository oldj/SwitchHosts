/**
 * tray
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { makeWindow } from '@main/tray/window'
import { app, BrowserWindow, Tray } from 'electron'
import * as path from 'path'

let tray: Tray
let win: BrowserWindow

const makeTray = () => {
  let icon = 'logo.png'
  if (process.platform === 'darwin') {
    icon = 'logoTemplate.png'
  }

  tray = new Tray(path.join(__dirname, 'assets', icon))
  win = makeWindow()

  tray.setToolTip('SwitchHosts!')
  tray.on('click', () => {
    if (win.isVisible()) {
      if (win.isFocused()) {
        win.hide()
      } else {
        show()
        win.focus()
      }
    } else {
      show()
    }
  })
}

const getPosition = () => {
  const tray_bounds = tray.getBounds()
  const window_bounds = win.getBounds()

  const x = Math.round(tray_bounds.x + tray_bounds.width / 2 - window_bounds.width / 2)
  const y = Math.round(tray_bounds.y + tray_bounds.height)

  return { x, y }
}

const show = () => {
  const { x, y } = getPosition()
  win.setPosition(x, y, true)
  win.show()
}

app.whenReady().then(() => {
  if (!tray) {
    makeTray()
  }
})

export {
  tray,
  makeTray,
}
