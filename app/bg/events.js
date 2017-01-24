/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');
const {ipcMain} = require('electron');

exports.init = (app, contents) => {

    ipcMain.on('show_app', () => {
        app.emit('show');
    });

    ipcMain.on('to_add_host', () => {
        if (contents && contents.send) {
            contents.send('to_add_host');
        }
    });

    ipcMain.on('to_export', (fn) => {
        if (contents && contents.send) {
            contents.send('get_export_data', fn);
        }
    });

    ipcMain.on('export_data', (e, fn, data) => {
        console.log(fn);
        console.log(data);
        fs.writeFile(fn, data, 'utf-8', (err) => {
            if (err) {
                electron.dialog.showErrorBox('error', err.message || 'Fail to export!');
            }
        });
    });

    ipcMain.on('to_import', (fn) => {
        if (contents && contents.send) {
            contents.send('to_import', fn);
        }
    });

    ipcMain.on('relaunch', (fn) => {
        app.relaunch({args: process.argv.slice(1) + ['--relaunch']});
        app.exit(0);
    });

};
