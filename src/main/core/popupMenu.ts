/**
 * contextMenu
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { broadcast } from '@main/core/agent'
import { IPopupMenuOption } from '@common/types'
import { ipcMain, Menu, MenuItem } from 'electron'

ipcMain.on('x_popup_menu', (e, options: IPopupMenuOption) => {
  // console.log(options)
  const menu = new Menu()

  options.items.map((opt) => {
    if (typeof opt._click_evt === 'string') {
      let evt: string = opt._click_evt
      opt.click = () => {
        broadcast(evt)
      }
    }

    const item = new MenuItem(opt)
    menu.append(item)
  })

  menu.on('menu-will-close', () => {
    // console.log('menu-will-close')
    broadcast(`popup_menu_close:${options.menu_id}`)
  })

  menu.popup()
})
