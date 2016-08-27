/**
 * tray
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {Menu, Tray} = require('electron');
const {ipcMain} = require('electron');

let tray = null;

function makeMenu(app, list, contents) {
    let menu = [];

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
            }
        });
    });

    menu.push({label: '-', type: 'separator'});
    menu.push({label: 'Feedback', type: 'normal', click: () => {
    }});
    menu.push({label: 'Toggle', type: 'normal', click: () => {
    }});
    menu.push({label: '-', type: 'separator'});
    menu.push({label: 'Quit', type: 'normal', accelerator: 'CommandOrControl+Q', click: () => {
        app.quit();
    }});

    return menu;
}

function makeTray(app, contents) {
    let icon = 'logo.png';
    if (process.platform === 'darwin') {
        icon = 'ilogoTemplate.png';
    }

    tray = new Tray(path.join(__dirname, '..', 'assets', icon));
    tray.setToolTip('SwitchHosts!');

    contents.send('get_host_list');

    ipcMain.on('send_host_list', (e, d) => {
        const contextMenu = Menu.buildFromTemplate(makeMenu(app, d, contents));
        tray.setContextMenu(contextMenu);
    });
}

exports.makeTray = makeTray;
