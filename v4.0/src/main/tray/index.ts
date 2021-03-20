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
import { app, BrowserWindow, Menu, Tray } from 'electron'
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
