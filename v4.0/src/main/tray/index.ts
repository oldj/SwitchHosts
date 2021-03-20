/**
 * tray
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { makeWindow } from '@main/tray/window'
import { I18N } from '@root/common/i18n'
import version from '@root/version.json'
import { app, BrowserWindow, Menu, screen, Tray } from 'electron'
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

  tray.on('double-click', () => broadcast('active_main_window'))

  tray.on('right-click', async () => {
    let locale = await configGet('locale')
    const i18n = new I18N(locale)
    const { lang } = i18n

    const ver = version.slice(0, 3).join('.') + ` (${version[3]})`

    const menu = Menu.buildFromTemplate([
      {
        label: lang._app_name,
        toolTip: lang.show_main_window,
        click() {
          broadcast('active_main_window')
        },
      },
      {
        label: `v${ver}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: lang.quit,
        role: 'quit',
      },
    ])

    tray.popUpContextMenu(menu)
  })
}

const getPosition = () => {
  const tray_bounds = tray.getBounds()
  const window_bounds = win.getBounds()
  const point = screen.getCursorScreenPoint()
  const screen_bounds0 = screen.getDisplayNearestPoint(point).bounds
  const screen_bounds = screen.getDisplayNearestPoint(point).workAreaSize

  let x: number
  let y: number

  let dw = screen_bounds0.width - screen_bounds.width
  if (dw > 0 && tray_bounds.x < dw) {
    // tray is at left
    x = dw
  } else {
    x = tray_bounds.x + tray_bounds.width / 2 - window_bounds.width / 2
  }

  // let dh = screen_bounds0.height - screen_bounds.height
  if (tray_bounds.y < screen_bounds.height / 2) {
    y = tray_bounds.y + tray_bounds.height
  } else {
    y = tray_bounds.y - window_bounds.height - 2
  }

  if (x < 0) x = 0
  if (x + window_bounds.width > screen_bounds.width) x = screen_bounds.width - window_bounds.width

  x = Math.round(x)
  y = Math.round(y)

  return { x, y }
}

const show = () => {
  const { x, y } = getPosition()
  win.setPosition(x, y, true)
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
