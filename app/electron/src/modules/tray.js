/**
 * tray
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const path = require('path');
const {Menu, Tray} = require('electron');

let tray = null;

function makeTray() {
    tray = new Tray(path.join(__dirname, '../assets/icon_1.pdf'));
    const contextMenu = Menu.buildFromTemplate([
        {label: 'Item1', type: 'radio'},
        {label: 'Item2', type: 'radio'},
        {label: 'Item3', type: 'radio', checked: true},
        {label: 'Item4', type: 'radio'}
    ]);
    tray.setToolTip('This is my application.');
    tray.setContextMenu(contextMenu);
}

exports.makeTray = makeTray;
