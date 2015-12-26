/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var config = require('./config');

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
        var keys = '0123456789abcdefghijklmnopqrstuvwxyz';

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
                keys: idx < keys.length ? '' + keys.substr(idx, 1): '',
                on: !!host.on,
                index: idx + 2
            }, function () {
                app.switchHost(host);
            });
        });

        menu.addSeparator();
        menu.addItem({
            label: 'Quit',
            keys: 'cmd+q',
            index: (hosts && hosts.list ? hosts.list.length : 0) + 3
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

}

exports.initMenu = initMenu;
exports.initTray = initTray;
