/**
 * tray
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {Menu, Tray, ipcMain, shell} = require('electron');
const m_lang = require('../lang');
const pref = require('./../libs/pref');
const os = process.platform;

let tray = null;

function makeMenu(app, list, contents, sys_lang) {
    let menu = [];
    let lang = m_lang.getLang(pref.get('user_language', sys_lang));

    menu.push({label: 'SwitchHosts!', type: 'normal', click: () => {
        app.emit('show');
    }});
    menu.push({label: '-', type: 'separator'});

    let ac = '1234567890abcdefghijklmnopqrstuvwxyz'.split('');
    list.map((item, idx) => {
        menu.push({
            label: item.title || 'untitled',
            type: 'checkbox',
            checked: item.on,
            accelerator: ac[idx],
            click: () => {
                contents.send('tray_toggle_host', idx);
                contents.send('get_host_list');
            }
        });
    });

    menu.push({type: 'separator'});
    menu.push({label: lang.feedback, type: 'normal', click: () => {
        shell.openExternal('https://github.com/oldj/SwitchHosts/issues');
    }});

    if (os === 'darwin') {
        menu.push({
            label: lang.toggle_dock_icon, type: 'normal', click: () => {
                let is_dock_visible = app.dock.isVisible();
                if (is_dock_visible) {
                    app.dock.hide();
                } else {
                    app.dock.show();
                }
                pref.set('is_dock_icon_hidden', is_dock_visible);
            }
        });
    }

    menu.push({type: 'separator'});
    menu.push({label: lang.quit, type: 'normal', accelerator: 'CommandOrControl+Q', click: () => {
        app.quit();
    }});

    return menu;
}

function makeTray(app, contents, sys_lang='en') {
    let icon = 'logo.png';
    if (process.platform === 'darwin') {
        icon = 'ilogoTemplate.png';
    }

    tray = new Tray(path.join(__dirname, '..', 'assets', icon));
    tray.setToolTip('SwitchHosts!');

    contents.send('get_host_list');

    ipcMain.on('send_host_list', (e, d) => {
        const contextMenu = Menu.buildFromTemplate(makeMenu(app, d, contents, sys_lang));
        tray.setContextMenu(contextMenu);
    });

    let is_dock_icon_hidden = pref.get('is_dock_icon_hidden', false);
    if (is_dock_icon_hidden) {
        app.dock.hide();
    }

    // windows only
    if (process.platform === 'win32') {
        tray.on('click', () => {
            app.emit('show');
        });
    }
}

exports.makeTray = makeTray;
