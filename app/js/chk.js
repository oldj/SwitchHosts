/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

const http = require('http');
const config = require('../config');
const lang = require('./lang').getLang('en');

function compareVersion(v1, v2) {
    if (v1 == v2) return 0;

    let a1 = v1.split('.');
    let a2 = v2.split('.');
    let i;
    let l = Math.min(a1.length, a2.length);
    let c1;
    let c2;

    for (i = 0; i < l; i ++) {
        c1 = parseInt(a1[i]);
        c2 = parseInt(a2[i]);

        if (isNaN(c2) || c1 > c2) {
            return 1;
        } else if (c1 < c2) {
            return -1;
        }
    }

    return 0;
}

function chkUpdate(current_version, win) {
    const dialog = require('electron').dialog;

    http.get(config.url_chk_version, function (res) {
        let s = '';
        res.on('data', (c) => {
            s += c;
        });
        res.on('end', () => {
            //console.log(s);
            let new_version = s.replace(/^\s+|\s+$/g, '');
            if (compareVersion(current_version, new_version) < 0) {
                // new version available
                dialog.showMessageBox(win, {
                    type: 'info'
                    , buttons: ['cancel', 'YES']
                    , title: 'New version found!'
                    , message: lang.new_version_available + '\n\nv: ' + new_version
                }, function (c) {
                    if (c == 1) {
                        require('electron').shell.openExternal(config.url_homepage);
                    }
                });
            } else {
                dialog.showMessageBox(win, {
                    type: 'info'
                    , buttons: ['OK']
                    , title: 'You are up to date!'
                    , message: lang.is_updated
                });
            }
        });
    }).on('error', function (e) {
        dialog.showMessageBox(win, {
            type: 'error'
            , buttons: ['OK']
            , title: 'Error'
            , message: e.message
        });
    });
}

exports.chkUpdate = chkUpdate;
