/**
 * @author oldj
 * @blog https://oldj.net
 */

import isDev from '@main/libs/isDev'
import { BrowserWindow, Menu, MenuItem, MenuItemConstructorOptions, shell } from 'electron'
import { I18N, LocaleName } from '@root/common/i18n'
import { homepage_url, feedback_url } from '@root/common/constants'
import { broadcast } from '@main/core/agent'

//const version = require('../version')

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
            broadcast('add_new')
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
            broadcast('show_preferences')
          },
        },
      ],
    },
    {
      label: lang.edit,
      submenu: [
        {
          role: 'undo',
        },
        {
          role: 'redo',
        },
        {
          type: 'separator',
        },
        {
          role: 'cut',
        },
        {
          role: 'copy',
        },
        {
          role: 'paste',
        },
        {
          role: 'delete',
        },
        {
          role: 'selectAll',
        },
        {
          type: 'separator',
          // },
          // {
          //   label: lang.search,
          //   accelerator: 'CommandOrControl+F',
          //   click () {
          //     broadcast('search:start')
          //   }
        },
        {
          label: lang.comment_current_line,
          accelerator: 'CommandOrControl+/',
          click () {
            broadcast('to_comment')
          },
        },
      ],
    },
    {
      label: lang.view,
      submenu: [
        // {
        //     label: 'Reload',
        //     accelerator: 'CmdOrCtrl+R',
        //     click (item, focusedWindow) {
        //         if (focusedWindow) focusedWindow.reload()
        //     }
        // },
        // {
        //     label: 'Toggle Developer Tools',
        //     accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        //     click (item, focusedWindow) {
        //         if (focusedWindow) focusedWindow.webContents.toggleDevTools()
        //     }
        // },
        // {
        //     type: 'separator'
        // },
        {
          role: 'resetZoom',
        },
        {
          role: 'zoomIn',
        },
        {
          role: 'zoomOut',
        },
        {
          type: 'separator',
        },
        {
          role: 'togglefullscreen',
        },
      ],
    },
    {
      role: 'window',
      submenu: [
        {
          role: 'minimize',
        },
        {
          role: 'close',
        },
      ],
    },
    {
      role: 'help',
      submenu: [
        // {
        //   label: lang.check_update,
        //   click () {
        //     checkUpdate.check()
        //   }
        // },
        {
          type: 'separator',
        },
        {
          label: lang.feedback,
          click () {
            shell.openExternal(feedback_url)
              .catch(e => console.log(e))
          },
        },
        {
          label: lang.homepage,
          click () {
            shell.openExternal(homepage_url)
              .catch(e => console.log(e))
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
            broadcast('show_about')
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
        },
        {
          role: 'hideOthers',
        },
        {
          role: 'unhide',
        },
        {
          type: 'separator',
        },
        {
          role: 'quit',
        }],
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
      },
      {
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize',
      },
      {
        role: 'zoom',
      },
      {
        type: 'separator',
      },
      {
        role: 'front',
      },
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
          broadcast('show_about')
        },
      })

      submenu.push({
        type: 'separator',
      })
      submenu.push({
        role: 'quit',
        accelerator: 'CmdOrCtrl+Q',
      })
    }

    // VIEW
    submenu = (template[2] && template[2].submenu) as MenuItemConstructorOptions[]
    submenu.splice(0, 4)
  }

  if (isDev()) {
    // VIEW
    // @ts-ignore
    template[3].submenu = [
      {
        label: lang.reload,
        accelerator: 'CmdOrCtrl+R',
        click (item: MenuItem, focusedWindow: BrowserWindow) {
          if (focusedWindow) focusedWindow.reload()
        },
      },
      {
        label: lang.toggle_developer_tools,// 'Toggle Developer Tools',
        accelerator: process.platform === 'darwin'
          ? 'Alt+Command+I'
          : 'Ctrl+Shift+I',
        click (item: MenuItem, focusedWindow: BrowserWindow) {
          if (focusedWindow) focusedWindow.webContents.toggleDevTools()
        },
      },
      {
        type: 'separator',
      },
      // @ts-ignore
      ...template[3].submenu,
    ]
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
