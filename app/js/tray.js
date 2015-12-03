/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

//const Tray = require('tray');

let appIcon = null;

function makeTray(app) {
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
}

exports.makeTray = makeTray;
