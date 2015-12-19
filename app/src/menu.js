/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var config = require('./config');

function initMenu(app) {

    // Help
    var menu = MacGap.Menu.getItem('Help').submenu;
    menu.getItem('Feedback').callback = function () {
        MacGap.openURL(config.url_feedback);
    };
    menu.getItem('Homepage').callback = function () {
        MacGap.openURL(config.url_homepage);
    };

    // SwitchHosts!
    var menu = MacGap.Menu.getItem('SwitchHosts!').submenu;
    menu.getItem('Check for Updates...').callback = function () {
        require('./chk').chkUpdate(config.VERSION);
    };

    // File
    var menu = MacGap.Menu.getItem('File').submenu;
    menu.getItem('New').callback = function () {
        app.add();
    };

}

exports.initMenu = initMenu;
