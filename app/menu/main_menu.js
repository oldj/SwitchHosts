/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {Menu, shell} = require('electron')
const m_lang = require('../server/lang')
//const getPref = require('../server/actions/getPref')
const checkUpdate = require('../server/checkUpdate')
const svr = require('../server/svr')
const {url_home, url_feedback} = require('../configs')

//const version = require('../version')

function doInit (app, lang) {

  const template = [
    {
      label: lang.file,
      submenu: [
        {
          label: lang.new,
          accelerator: 'CommandOrControl+N',
          click: () => {
            svr.broadcast('add_hosts')
          }
        }, {
          type: 'separator'
        }, {
          label: lang.import,
          accelerator: 'Alt+CommandOrControl+I',
          click: () => {
            require('../server/actions/toImport')(svr)
          }
        }, {
          label: lang.export,
          accelerator: 'Alt+CommandOrControl+E',
          click: () => {
            require('../server/actions/toExport')(svr)
          }
        }, {
          type: 'separator'
        }, {
          label: lang.preferences,
          accelerator: 'CommandOrControl+,',
          click: () => {
            //app.mainWindow.webContents.send('show_preferences')
            svr.broadcast('show_preferences')
          }
        }
      ]
    },
    {
      label: lang.edit,
      submenu: [
        {
          label: lang.undo,
          role: 'undo'
        }, {
          label: lang.redo,
          role: 'redo'
        }, {
          type: 'separator'
        }, {
          label: lang.menu_cut,
          role: 'cut'
        }, {
          label: lang.menu_copy,
          role: 'copy'
        }, {
          label: lang.menu_paste,
          role: 'paste'
        }, {
          label: lang.menu_delete,
          role: 'delete'
        }, {
          label: lang.menu_selectall,
          role: 'selectall'
        }, {
          type: 'separator'
        }, {
          label: lang.search,
          accelerator: 'CommandOrControl+F',
          click () {
            // ipcMain.emit('to_search');
            //app.mainWindow.webContents.send('to_search')
            svr.broadcast('search:start')
          }
        }, {
          label: lang.comment_current_line,
          accelerator: 'CommandOrControl+/',
          click () {
            // ipcMain.emit('to_search');
            //app.mainWindow.webContents.send('to_comment')
            svr.broadcast('to_comment')
          }
        }]
    }, {
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
          label: lang.menu_resetzoom,
          role: 'resetzoom'
        },
        {
          label: lang.menu_zoomin,
          role: 'zoomin'
        },
        {
          label: lang.menu_zoomout,
          role: 'zoomout'
        },
        {
          type: 'separator'
        },
        {
          label: lang.menu_togglefullscreen,
          role: 'togglefullscreen'
        }
      ]
    }, {
      label: lang.window,
      role: 'window',
      submenu: [{
        label: lang.menu_minimize,
        role: 'minimize'
      }, {
        label: lang.menu_close,
        role: 'close'
      }]
    }, {
      label: lang.help,
      role: 'help',
      submenu: [
        {
          label: lang.check_update,
          click () {
            checkUpdate.check()
          }
        }, {
          type: 'separator'
        }, {
          label: lang.feedback,
          click () {
            shell.openExternal(url_feedback)
              .catch(e => console.log(e))
          }
        }, {
          label: lang.homepage,
          click () {
            shell.openExternal(url_home)
              .catch(e => console.log(e))
          }
        }]
    }
  ]

  //const name = require('electron').app.getName()
  const name = 'SwitchHosts!'
  const os = process.platform
  if (os === 'darwin') {
    template.unshift({
      label: name,
      submenu: [
        {
          label: lang.menu_about,
          //role: 'about',
          click: () => {
            svr.broadcast('show-about')
          }
        }, {
          type: 'separator'
        },
        // {
        //     role: 'services',
        //     submenu: []
        // },
        // {
        //     type: 'separator'
        // },
        {
          label: lang.menu_hide,
          role: 'hide'
        }, {
          label: lang.menu_hideothers,
          role: 'hideothers'
        }, {
          label: lang.menu_unhide,
          role: 'unhide'
        }, {
          type: 'separator'
        }, {
          label: lang.menu_quit,
          role: 'quit'
        }]
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
        label: lang.menu_close,
        accelerator: 'CmdOrCtrl+W',
        role: 'close'
      },
      {
        label: lang.menu_minimize,
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
      },
      {
        label: lang.menu_zoom,
        role: 'zoom'
      },
      {
        type: 'separator'
      },
      {
        label: lang.menu_bringalltofront,// 'Bring All to Front',
        role: 'front'
      }
    ]
  } else if (os === 'win32' || os === 'linux') {
    template[0].submenu.unshift({
      type: 'separator'
    })
    template[0].submenu.unshift({
      label: `${lang.menu_about} ${name}`,
      //role: 'about',
      click: () => {
        svr.broadcast('show-about')
      }
    })

    template[0].submenu.push({
      type: 'separator'
    })
    template[0].submenu.push({
      label: lang.menu_quit,
      role: 'quit',
      accelerator: 'CmdOrCtrl+Q'
    })

    // VIEW
    template[2].submenu.splice(0, 4)
  }

  if (process.env.ENV === 'dev') {
    // VIEW
    template[3].submenu = [
      {
        label: lang.menu_reload,
        accelerator: 'CmdOrCtrl+R',
        click (item, focusedWindow) {
          if (focusedWindow) focusedWindow.reload()
        }
      },
      {
        label: lang.menu_toggle_developer_tools,// 'Toggle Developer Tools',
        accelerator: process.platform === 'darwin'
          ? 'Alt+Command+I'
          : 'Ctrl+Shift+I',
        click (item, focusedWindow) {
          if (focusedWindow) focusedWindow.webContents.toggleDevTools()
        }
      },
      {
        type: 'separator'
      }
    ].concat(template[3].submenu)
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

exports.init = function (app, language = 'en') {
  let lang = m_lang.getLang(language)
  doInit(app, lang)
}
