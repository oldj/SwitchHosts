/**
 * tray
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet, configSet, updateTrayTitle } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { makeWindow } from '@main/ui/tray/window'
import events from '@common/events'
import { I18N } from '@common/i18n'
import version from '@/version.json'
import { app, BrowserWindow, Menu, MenuItemConstructorOptions, screen, Tray } from 'electron'
import * as path from 'path'

let tray: Tray
let win: BrowserWindow

const makeTray = async () => {
  let icon = 'logo@512w.png'
  if (process.platform === 'darwin') {
    icon = 'logoTemplate.png'
  }

  tray = new Tray(path.join(__dirname, 'assets', icon))
  win = makeWindow()

  updateTrayTitle().catch((e) => console.error(e))

  tray.setToolTip('SwitchHosts')

  let locale = await configGet('locale')
  if (process.platform === 'linux') {
    locale = global.system_locale // configGet() always get undefined on Linux
  }
  const i18n = new I18N(locale)
  const { lang } = i18n

  const ver = version.slice(0, 3).join('.') + ` (${version[3]})`

  if (process.platform === 'linux') {
    const menu = Menu.buildFromTemplate([
      {
        label: lang.click_to_open,
        click: () => window(),
      },
      { type: 'separator' },
      {
        label: lang._app_name,
        toolTip: lang.show_main_window,
        click: () => {
          broadcast(events.active_main_window)
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

    // Linux requires setContextMenu to be called in order for the context menu to populate correctly
    tray.setContextMenu(menu)
    return
  }

  tray.on('click', async () => {
    let tray_mini_window = await configGet('tray_mini_window')
    tray_mini_window ? window() : broadcast(events.active_main_window)
  })

  tray.on('double-click', () => broadcast(events.active_main_window))

  tray.on('right-click', async () => {
    let hide_dock_icon = await configGet('hide_dock_icon')

    const menu = Menu.buildFromTemplate([
      {
        label: lang._app_name,
        toolTip: lang.show_main_window,
        click() {
          broadcast(events.active_main_window)
        },
      },
      {
        label: `v${ver}`,
        enabled: false,
      },
      ...(app.dock
        ? <MenuItemConstructorOptions[]>[
            { type: 'separator' },
            {
              label: hide_dock_icon ? lang.show_dock_icon : lang.hide_dock_icon,
              async click() {
                let hide_dock_icon = await configGet('hide_dock_icon')
                hide_dock_icon = !hide_dock_icon
                await configSet('hide_dock_icon', hide_dock_icon)
                if (hide_dock_icon) {
                  app.dock.hide()
                } else {
                  app.dock.show().catch((e) => console.error(e))
                }
              },
            },
          ]
        : []),
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

const getLinuxPosition = () => {
  const window_bounds = win.getBounds()
  const point = screen.getCursorScreenPoint()
  const screen_bounds0 = screen.getDisplayNearestPoint(point).bounds
  const screen_bounds = screen.getDisplayNearestPoint(point).workAreaSize

  let x: number
  let y: number

  if (point.x - screen_bounds0.x > screen_bounds.width / 2) {
    // display on the right of the active screen
    x = screen_bounds0.x + screen_bounds0.width - window_bounds.width
  } else {
    x = 0
  }
  if (point.y < screen_bounds.height / 2) {
    // display on the top of the active screen
    y = 0
  } else {
    y = screen_bounds.height - window_bounds.height
  }

  x = Math.round(x)
  y = Math.round(y)

  return { x, y }
}

const window = () => {
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
}

const show = () => {
  let { x, y } = process.platform === 'linux' ? getLinuxPosition() : getPosition()
  win.setPosition(x, y, true)
  win.show()
  // win.focus()
}

app &&
  app.whenReady().then(() => {
    if (!tray) {
      makeTray()
    }
  })

export { tray, makeTray }
