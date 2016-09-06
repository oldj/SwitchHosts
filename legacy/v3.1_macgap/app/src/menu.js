/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var config = require('./config');
var agent = require('./agent');
var ie = require('./ie');
var lang = require('./lang').getLang(navigator.language);
var ui = require('./ui');

var key_name = 'is_dock_icon_hidden';
var is_dock_icon_hidden = agent.getPreference(key_name);

function toggleDockIcon() {
    if (is_dock_icon_hidden) {
        MacGap.Dock.showIcon();
        MacGap.activate();
    } else {
        MacGap.Dock.hideIcon();
    }
    is_dock_icon_hidden = !is_dock_icon_hidden;
    agent.setPreference(key_name, is_dock_icon_hidden);
}

function initTray(app) {
    var tray = {};

    tray.item = MacGap.StatusItem.create({
        //title: 'Title',
        //titleFontSize: 16,
        image: 'public/images/icon_1.pdf'
        //alternateImage: 'public/images/icon_2.pdf'
    }, function () {
        //alert('Item clicked');
    });


    tray.updateTrayMenu = function (hosts) {
        var menu = MacGap.Menu.create('Tray Menu', 'statusbar');
        var keys = '1234567890abcdefghijklmnopqrstuvwxyz';

        menu.addItem({
            label: 'SwitchHosts!',
            keys: '',
            index: 0
        }, function () {
            MacGap.activate();
        });
        menu.addSeparator();

        hosts && hosts.list && hosts.list.map(function (host, idx) {
            menu.addItem({
                label: host.title,
                keys: idx < keys.length ? '' + keys.substr(idx, 1) : '',
                on: !!host.on,
                index: idx + 2
            }, function () {
                app.toggleHost(host);
            });
        });

        menu.addSeparator();
        var idx = (hosts && hosts.list ? hosts.list.length : 0) + 3;

        menu.addItem({
            label: 'Feedback',
            keys: '',
            index: idx++
        }, function () {
            agent.openURL(config.url_feedback);
        });

        menu.addItem({
            label: lang.toggle_dock_icon,
            keys: '',
            index: idx++
        }, function () {
            toggleDockIcon();
            setTimeout(function () {
                tray.updateTrayMenu(hosts);
            }, 100);
        });
        menu.addSeparator();
        idx++;

        menu.addItem({
            label: 'Quit',
            keys: 'cmd+q',
            index: idx
        }, function () {
            MacGap.terminate();
        });

        MacGap.StatusItem.menu = menu;
    };

    return tray;
}

function initMenu(app) {
    var menu;

    // Help
    menu = MacGap.Menu.getItem('Help').submenu;
    menu.getItem('Feedback').callback = function () {
        MacGap.openURL(config.url_feedback);
    };
    menu.getItem('Homepage').callback = function () {
        MacGap.openURL(config.url_homepage);
    };

    // SwitchHosts!
    menu = MacGap.Menu.getItem('SwitchHosts!').submenu;
    menu.getItem('Check for Updates...').callback = function () {
        require('./chk').chkUpdate(config.VERSION);
    };

    // File
    menu = MacGap.Menu.getItem('File').submenu;
    menu.getItem('New').callback = function () {
        app.add();
    };
    menu.getItem('Import').callback = function () {
        MacGap.Dialog.openDialog({
            files: true,
            allowedTypes: ['json', 'txt'],
            callback: function (path) {
                ie.importFrom(app.hosts.list, path);
                app.doSave(1);
            }
        });
    };
    menu.getItem('Export').callback = function () {
        MacGap.Dialog.saveDialog({
            title: 'Export hosts',
            prompt: 'Export',
            message: 'export hosts.',
            filename: 'sh.json',
            createDirs: true,
            allowedTypes: ['json', 'txt'],
            callback: function (p) {
                // filename, directory, filePath
                var fp = p.filePath;
                ie.exportTo(app.hosts.list, fp);
            }
        });
    };

    // Edit
    menu = MacGap.Menu.getItem('Edit').submenu;
    menu.getItem('Find').callback = function () {
        app.toggleSearch();
        setTimeout(function () {
            ui.resize();
            $('#search-bar').find('input').focus();
        }, 100);
    };

    // View
    menu = MacGap.Menu.getItem('View').submenu;
    menu.getItem('Previous hosts').callback = function () {
        setTimeout(function () {
            app.previouseHosts();
        }, 100);
    };
    menu.getItem('Next hosts').callback = function () {
        setTimeout(function () {
            app.nextHosts();
        }, 100);
    };

    // Dock icon
    if (is_dock_icon_hidden) {
        MacGap.Dock.hideIcon();
    } else {
        MacGap.Dock.showIcon();
    }
}

exports.initMenu = initMenu;
exports.initTray = initTray;
