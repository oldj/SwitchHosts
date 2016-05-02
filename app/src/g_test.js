/**
 * @author oldj
 * @blog http://oldj.net
 *
 * for testing
 */

'use strict';

(function () {
    if (typeof MacGap != 'undefined') {
        return;
    }

    window.MacGap = {
        homePath: '~'
    };

    MacGap.File = {
        exists: function (fn) {
            return true;
        },
        read: function (fn) {
            console.log('read', fn);
            if (fn == '/etc/hosts') {
                return `# SwitchHosts!
##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##
127.0.0.1	localhost
255.255.255.255	broadcasthost
::1             localhost`;
            } else if (fn.indexOf('data.json') != -1) {
                return `{"list":[{"content":"# My Hosts\\n","on":false,"title":"My Hosts","_is_show":true,"refresh_interval":0},{"content":"##\\n# Host Database\\n#\\n# localhost is used to configure the loopback interface\\n# when the system is booting.  Do not change this entry.\\n##\\n127.0.0.1\\tlocalhost\\n255.255.255.255\\tbroadcasthost\\n::1             localhost \\n","on":true,"title":"backup","_is_show":true,"refresh_interval":0},{"last_refresh":null,"refresh_interval":0,"where":"local","on":true,"content":"# 测试\\n\\n127.0.0.1 test.com\\n","title":"测试","_is_show":true,"is_editable":true,"_just_switch":0}],"sys":"##\\n# Host Database\\n#\\n# localhost is used to configure the loopback interface\\n# when the system is booting.  Do not change this entry.\\n##\\n127.0.0.1\\tlocalhost\\n255.255.255.255\\tbroadcasthost\\n::1             localhost \\n"}`;
            } else if (fn.indexOf('preferences.json') != -1) {
                return `{"is_dock_icon_hidden":false}`;
            }
            return '';
        },
        write: function () {

        }
    };

    function Menu() {
        this.submenu = this;
    }

    Menu.prototype = {
        getItem: function (name) {
            return new Menu();
        },
        addItem: function () {
        },
        addSeparator: function () {
        }
    };

    MacGap.Menu = {
        getItem: function (name) {
            return new Menu();
        },
        create: function () {
            return new Menu();
        }
    };

    MacGap.Dock = {
        showIcon: function () {}
    };

    MacGap.StatusItem = {
        create: function () {

        }
    };

    MacGap.Task = {
        create: function () {
          return {
              launch: function () {}
          };
        }
    };
})();
