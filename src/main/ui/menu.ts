/**
 * @author oldj
 * @blog https://oldj.net
 */

import { findShow } from '@main/actions'
import events from '@common/events'
import { BrowserWindow, Menu, MenuItem, MenuItemConstructorOptions, shell } from 'electron'
import { I18N, LocaleName } from '@common/i18n'
import { homepage_url, feedback_url } from '@common/constants'
import { broadcast } from '@main/core/agent'

export const makeMainMenu = (locale: LocaleName = 'en') => {
  const i18n = new I18N(locale)
  const { lang } = i18n

  const template: MenuItemConstructorOptions[] = [
    {
      label: lang.file,
      submenu: [
        {
          label: lang.new,
          accelerator: 'CommandOrControl+N',
          click: () => {
            broadcast(events.add_new)
          },
        },
        {
          type: 'separator',
          // },
          // {
          //   label: lang.import,
          //   accelerator: 'Alt+CommandOrControl+I',
          //   click: () => {
          //   }
          // },
          // {
          //   label: lang.export,
          //   accelerator: 'Alt+CommandOrControl+E',
          //   click: () => {
          //   }
          // },
          // {
          //   type: 'separator'
        },
        {
          label: lang.preferences,
          accelerator: 'CommandOrControl+,',
          click: () => {
            broadcast(events.show_preferences)
          },
        },
      ],
    },
    {
      label: lang.edit,
      submenu: [
        {
          role: 'undo',
          label: lang.undo,
        },
        {
          role: 'redo',
          label: lang.redo,
        },
        {
          type: 'separator',
        },
        {
          role: 'cut',
          label: lang.cut,
        },
        {
          role: 'copy',
          label: lang.copy,
        },
        {
          role: 'paste',
          label: lang.paste,
        },
        {
          role: 'delete',
          label: lang.delete,
        },
        {
          role: 'selectAll',
          label: lang.select_all,
        },
        {
          type: 'separator',
        },
        {
          label: lang.comment_current_line,
          accelerator: 'CommandOrControl+/',
          click() {
            broadcast(events.toggle_comment)
          },
        },
        {
          label: lang.find_and_replace,
          accelerator: 'CommandOrControl+F',
          click() {
            findShow()
          },
        },
      ],
    },
    {
      label: lang.view,
      submenu: [
        {
          label: lang.reload,
          accelerator: 'CmdOrCtrl+R',
          click(item: MenuItem, focusedWindow: BrowserWindow | undefined) {
            if (focusedWindow) focusedWindow.reload()
          },
        },
        {
          label: lang.toggle_developer_tools, // 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click(item: MenuItem, focusedWindow: BrowserWindow | undefined) {
            if (focusedWindow) focusedWindow.webContents.toggleDevTools()
          },
        },
        {
          type: 'separator',
        },
        {
          role: 'resetZoom',
          label: lang.reset_zoom,
        },
        {
          role: 'zoomIn',
          label: lang.zoom_in,
        },
        {
          role: 'zoomOut',
          label: lang.zoom_out,
        },
        {
          type: 'separator',
        },
        {
          role: 'togglefullscreen',
          label: lang.toggle_full_screen,
        },
      ],
    },
    {
      label: lang.window,
      role: 'window',
      submenu: [
        {
          role: 'minimize',
          label: lang.minimize,
        },
        {
          role: 'close',
          label: lang.close,
        },
      ],
    },
    {
      label: lang.help,
      role: 'help',
      submenu: [
        // {
        //   label: lang.check_update,
        //   click () {
        //     checkUpdate.check()
        //   }
        // },
        // {
        //   type: 'separator',
        // },
        {
          label: lang.feedback,
          click() {
            shell.openExternal(feedback_url).catch((e) => console.log(e))
          },
        },
        {
          label: lang.homepage,
          click() {
            shell.openExternal(homepage_url).catch((e) => console.log(e))
          },
        },
      ],
    },
  ]

  const name = 'SwitchHosts'
  const os = process.platform
  if (os === 'darwin') {
    template.unshift({
      label: name,
      submenu: [
        {
          label: lang.about,
          //role: 'about',
          click: () => {
            broadcast(events.show_about)
          },
        },
        {
          type: 'separator',
        },
        // {
        //     role: 'services',
        //     submenu: []
        // },
        // {
        //     type: 'separator'
        // },
        {
          role: 'hide',
          label: lang.hide,
        },
        {
          role: 'hideOthers',
          label: lang.hide_others,
        },
        {
          role: 'unhide',
          label: lang.unhide,
        },
        {
          type: 'separator',
        },
        {
          role: 'quit',
          label: lang.quit,
        },
      ],
    })
    // Edit menu.
    /*template[2].submenu.push(
     {
     type: 'separator'
     },
     {
     label: 'Speech',
     submenu: [
     {
     role: 'startspeaking'
     },
     {
     role: 'stopspeaking'
     }
     ]
     }
     );*/
    // Window menu.
    template[4].submenu = [
      {
        accelerator: 'CmdOrCtrl+W',
        role: 'close',
        label: lang.close,
      },
      {
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize',
        label: lang.minimize,
      },
      {
        role: 'zoom',
        label: lang.zoom,
      },
      {
        type: 'separator',
      },
      // {
      //   role: 'front',
      //   label: lang.front,
      // },
    ]
  } else if (os === 'win32' || os === 'linux') {
    let submenu = (template[0] && template[0].submenu) as MenuItemConstructorOptions[]

    if (submenu) {
      submenu.unshift({
        type: 'separator',
      })
      submenu.unshift({
        label: `${lang.about} ${name}`,
        //role: 'about',
        click: () => {
          broadcast(events.show_about)
        },
      })

      submenu.push({
        type: 'separator',
      })
      submenu.push({
        role: 'quit',
        label: lang.quit,
        accelerator: 'CmdOrCtrl+Q',
      })
    }

    // VIEW
    submenu = (template[2] && template[2].submenu) as MenuItemConstructorOptions[]
    submenu.splice(0, 4)
  }

  // if (isDev()) {
  //   // VIEW
  //   // @ts-ignore
  //   template[3].submenu = [
  //     // @ts-ignore
  //     ...template[3].submenu,
  //   ]
  // }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
