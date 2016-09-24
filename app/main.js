/**
 * SwitchHosts!
 *
 * @author oldj
 * @blog http://oldj.net
 * @homepage https://oldj.github.io/SwitchHosts/
 * @source https://github.com/oldj/SwitchHosts
 */

const electron = require('electron');
const fs = require('fs');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const tray = require('./src/modules/tray');
const pref = require('./src/libs/pref');
let user_language = pref.get('user_language') || (app.getLocale() || '').split('-')[0].toLowerCase() || 'en';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let contents;
let willQuitApp = false;
let is_tray_initialized;

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800, height: 500,
        minWidth: 400, minHeight: 250
    });
    contents = mainWindow.webContents;
    app.mainWindow = mainWindow;

    // and load the index.html of the app.
    mainWindow.loadURL(`file://${__dirname}/index.html?lang=${user_language}`);

    if (process.env && process.env.ENV === 'dev') {
        // Open the DevTools.
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('close', (e) => {
        if (willQuitApp) {
            /* the user tried to quit the app */
            mainWindow = null;
        } else {
            /* the user only tried to close the window */
            e.preventDefault();
            mainWindow.hide();
        }
    });

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
        contents = null;
    });

    contents.on('did-finish-load', () => {
        if (!is_tray_initialized) {
            tray.makeTray(app, contents, user_language);
            is_tray_initialized = true;
        }
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
    createWindow();
    require('./src/modules/mainMenu').init(app, user_language);
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // if (process.platform !== 'darwin') {
    //     app.quit();
    // }
});

app.on('show', function () {
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
    } else {
        createWindow();
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    } else if (mainWindow.isMinimized()) {
        mainWindow.restore();
    } else {
        mainWindow.show();
    }
});

app.on('before-quit', () => willQuitApp = true);

electron.ipcMain.on('show_app', () => {
    app.emit('show');
});

electron.ipcMain.on('to_add_host', () => {
    if (contents && contents.send) {
        contents.send('to_add_host');
    }
});

electron.ipcMain.on('to_export', (fn) => {
    if (contents && contents.send) {
        contents.send('get_export_data', fn);
    }
});

electron.ipcMain.on('export_data', (e, fn, data) => {
    console.log(fn);
    console.log(data);
    fs.writeFile(fn, data, 'utf-8', (err) => {
        if (err) {
            electron.dialog.showErrorBox('error', err.message || 'Fail to export!');
        }
    });
});

electron.ipcMain.on('to_import', (fn) => {
    if (contents && contents.send) {
        contents.send('to_import', fn);
    }
});

electron.ipcMain.on('relaunch', (fn) => {
    app.relaunch({args: process.argv.slice(1) + ['--relaunch']});
    app.exit(0);
});
