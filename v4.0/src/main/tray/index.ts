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
    console.log(1111, win.isVisible(), win.isFocused())
    if (!win) {
      makeWindow()
      return
    }

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

  let x = Math.round(tray_bounds.x + tray_bounds.width / 2 - window_bounds.width / 2)
  let y = Math.round(tray_bounds.y + tray_bounds.height)

  if (x < 0) x = 0

  return { x, y }
}

const show = () => {
  const { x, y } = getPosition()
  win.setPosition(x, y - 100, true)
  win.show()
  // win.focus()
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
