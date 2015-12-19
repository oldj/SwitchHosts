/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

var config = require('./config');
var lang = require('./lang').getLang('en');

function compareVersion(v1, v2) {
    if (v1 == v2) return 0;

    var a1 = v1.split('.');
    var a2 = v2.split('.');
    var i;
    var l = Math.min(a1.length, a2.length);
    var c1;
    var c2;

    for (i = 0; i < l; i++) {
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

function chkUpdate(current_version) {
    $.ajax({
        url: config.url_chk_version,
        data: {r: Math.random()},
        success: function (s) {
            var new_version = s.replace(/^\s+|\s+$/g, '');
            if (compareVersion(current_version, new_version) < 0) {
                // new version available
                if (confirm(lang.new_version_available + '\n\nv: ' + new_version)) {
                    MacGap.openURL(config.url_homepage);
                }
            } else {
                MacGap.notify({
                    type: 'sheet',
                    title: 'You are up to date!',
                    content: lang.is_updated
                });
            }
        },
        error: function (e) {
            //MacGap.notify({
            //    type: 'sheet',
            //    title: 'Error',
            //    content: e.message || 'Network Error.'
            //});
            alert(e.message || 'Network Error.');
        }
    });
}

exports.chkUpdate = chkUpdate;
