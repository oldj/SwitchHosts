/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const config = require('./config');

const app = require('app');  // Module to control application life.
const BrowserWindow = require('browser-window');  // Module to create native browser window.
const http = require('http');

//app.__is_debug = true;
app.__is_debug = false;


// Report crashes to our server.
require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
let mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    if (process.platform != 'darwin') {
        app.quit();
    }
});

// This method will be called when atom-shell has done everything
// initialization and ready for creating browser windows.
app.on('ready', function () {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 800, height: 600});

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/index.html');
    //app.dock.hide();

    if (app.__is_debug) {
        mainWindow.toggleDevTools();
    }

    mainWindow.on('close', function (e) {
        console.log('close');
        if (!app.__force_quit) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    // You can use 'before-quit' instead of (or with) the close event
    app.on('before-quit', function (e) {
        console.log('before-quit');
        // Handle menu-item or keyboard shortcut quit here
        app.__force_quit = true;
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

    require('./js/menu').makeMenu(app, mainWindow);
    require('./js/tray').makeTray(app);
});
