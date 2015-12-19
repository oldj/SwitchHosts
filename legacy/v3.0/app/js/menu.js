/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

const Menu = require('menu');
const config = require('../config');

const is_mac = process.platform == 'darwin';

function makeMenu(app, mainWindow) {

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
                if (is_mac) {
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
            //        if (is_mac) {
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

    if (app.__is_debug) {
        template[1].submenu.push({
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: function (item, focusedWindow) {
                if (focusedWindow)
                    focusedWindow.reload();
            }
        });
    }

    let app_name = require('electron').app.getName();
    if (is_mac) {
        template.unshift({
            label: app_name,
            submenu: [{
                label: 'About ' + app_name,
                role: 'about'
            }, {
                label: 'Check for Updates...',
                click: function () {
                    require('./chk').chkUpdate(config.VERSION, mainWindow);
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
                label: 'Hide ' + app_name,
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
                    app.__force_quit = true;
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

    } else {
        // windows / linux

        template.unshift({
            label: 'File',
            submenu: [{
                //label: 'About ' + app_name,
                //role: 'about'
            //}, {
                label: 'Check for Updates...',
                click: function () {
                    require('./chk').chkUpdate(config.VERSION, mainWindow);
                }
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                //accelerator: 'Command+Q',
                click: function () {
                    app.__force_quit = true;
                    app.quit();
                }
            }]
        });

    }

    let menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

exports.makeMenu = makeMenu;
