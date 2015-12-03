/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const config = require('./config');

const app = require('app');  // Module to control application life.
const BrowserWindow = require('browser-window');  // Module to create native browser window.
const http = require('http');
const Menu = require('menu');
//const Tray = require('tray');

//let is_debug = true;
let is_debug = false;


// Report crashes to our server.
require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
let mainWindow = null;
let force_quit = false;

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    if (process.platform != 'darwin') {
        app.quit();
    }
});

let appIcon = null;

// This method will be called when atom-shell has done everything
// initialization and ready for creating browser windows.
app.on('ready', function () {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 800, height: 600});

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/index.html');

    if (is_debug) {
        mainWindow.toggleDevTools();
    }

    mainWindow.on('close', function (e) {
        if (!force_quit) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    // You can use 'before-quit' instead of (or with) the close event
    app.on('before-quit', function (e) {
        // Handle menu-item or keyboard shortcut quit here
        if (!force_quit) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    // Remove mainWindow.on('closed'), as it is redundant
    /*
     // Emitted when the window is closed.
     mainWindow.on('closed', function () {
     // Dereference the window object, usually you would store windows
     // in an array if your app supports multi windows, this is the time
     // when you should delete the corresponding element.
     mainWindow = null;
     app.quit();
     });*/

    app.on('activate', function () {
        mainWindow.show();
    });

    /*
     //console.log('file://' + __dirname + '/images/t.png');
     // @see https://github.com/atom/electron/blob/master/docs/api/tray.md
     appIcon = new Tray(__dirname + '/images/t.png');
     //appIcon = new Tray('/Users/wu/studio/owl/sh3/app/images/t.png');
     let contextMenu = Menu.buildFromTemplate([
     {label: 'Item1', type: 'radio'},
     {label: 'Item2', type: 'radio'},
     {label: 'Item3', type: 'radio', checked: true},
     {label: 'Item4', type: 'radio'}
     ]);
     appIcon.setToolTip('This is my application.');
     appIcon.setContextMenu(contextMenu);
     */

    let template = [{
        label: 'Edit',
        submenu: [{
            label: 'Undo',
            accelerator: 'CmdOrCtrl+Z',
            role: 'undo'
        }, {
            label: 'Redo',
            accelerator: 'Shift+CmdOrCtrl+Z',
            role: 'redo'
        }, {
            type: 'separator'
        }, {
            label: 'Cut',
            accelerator: 'CmdOrCtrl+X',
            role: 'cut'
        }, {
            label: 'Copy',
            accelerator: 'CmdOrCtrl+C',
            role: 'copy'
        }, {
            label: 'Paste',
            accelerator: 'CmdOrCtrl+V',
            role: 'paste'
        }, {
            label: 'Select All',
            accelerator: 'CmdOrCtrl+A',
            role: 'selectall'
        }]
    }, {
        label: 'View',
        submenu: [{
            label: 'Toggle Full Screen',
            accelerator: (function () {
                if (process.platform == 'darwin') {
                    return 'Ctrl+Command+F';
                } else {
                    return 'F11';
                }
            })(),
            click: function (item, focusedWindow) {
                if (focusedWindow) {
                    focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                }
            }
            //},
            //{
            //    label: 'Toggle Developer Tools',
            //    accelerator: (function () {
            //        if (process.platform == 'darwin') {
            //            return 'Alt+Command+I';
            //        } else {
            //            return 'Ctrl+Shift+I';
            //        }
            //    })(),
            //    click: function (item, focusedWindow) {
            //        if (focusedWindow) {
            //            focusedWindow.toggleDevTools();
            //        }
            //    }
        }]
    }, {
        label: 'Window',
        role: 'window',
        submenu: [{
            label: 'Minimize',
            accelerator: 'CmdOrCtrl+M',
            role: 'minimize'
        }, {
            label: 'Close',
            accelerator: 'CmdOrCtrl+W',
            role: 'close'
        }]
    }, {
        label: 'Help',
        role: 'help',
        submenu: [{
            label: 'Homepage',
            click: function () {
                require('electron').shell.openExternal(config.url_homepage);
            }
        }, {
            label: 'Feedback',
            click: function () {
                require('electron').shell.openExternal(config.url_feedback);
            }
        }]
    }];

    if (is_debug) {
        template[1].submenu.push({
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: function (item, focusedWindow) {
                if (focusedWindow)
                    focusedWindow.reload();
            }
        });
    }

    if (process.platform == 'darwin') {
        let name = require('electron').app.getName();
        template.unshift({
            label: name,
            submenu: [{
                label: 'About ' + name,
                role: 'about'
            }, {
                label: 'Check for Updates...',
                click: function () {
                    require('./js/chk').chkUpdate(config.VERSION, mainWindow);
                }
            }, {
                type: 'separator'
            }, {
                label: 'Services',
                role: 'services',
                submenu: []
            }, {
                type: 'separator'
            }, {
                label: 'Hide ' + name,
                accelerator: 'Command+H',
                role: 'hide'
            }, {
                label: 'Hide Others',
                accelerator: 'Command+Shift+H',
                role: 'hideothers'
            }, {
                label: 'Show All',
                role: 'unhide'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: function () {
                    force_quit = true;
                    app.quit();
                }
            }]
        });
        // Window menu.
        template[3].submenu.push(
            {
                type: 'separator'
            },
            {
                label: 'Bring All to Front',
                role: 'front'
            }
        );
    }

    let menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
});
