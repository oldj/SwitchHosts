/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const request = require('request');
const cheerio = require('cheerio');
const {shell, dialog} = require('electron');
const release_url = 'https://github.com/oldj/SwitchHosts/releases';
const current_version = require('../version').version;
const m_lang = require('../src/lang');
const util = require('../src/libs/util');
const lang = m_lang.getLang(global.user_language);

function convertStrVersion(v) {
    let a = v.match(/\d+/g);
    return a.map(i => parseInt(i));
}

function compareVersion(a, b) {
    if (typeof a === 'string') {
        a = convertStrVersion(a);
    }
    if (typeof b === 'string') {
        b = convertStrVersion(b);
    }

    let len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        let ai = a[i];
        let bi = b[i];

        if (typeof ai === 'number' && typeof bi === 'number') {
            if (ai === bi) {
                continue;
            }

            return ai - bi;
        }

        if (typeof ai === 'number' && typeof bi !== 'number') {
            return 1;
        }
        if (typeof ai !== 'number' && typeof bi === 'number') {
            return -1;
        }
        return 0;
    }
}

exports.check = () => {
    console.log('start check updates..');
    request(release_url, (err, res, body) => {
        let buttons = [lang.ok];
        if (err) {
            console.log(err);
            dialog.showMessageBox({
                type: 'error',
                message: lang.check_update_err,
                buttons
            });
            return;
        }

        let $ = cheerio.load(body);
        let a = $('.release-meta .css-truncate-target');
        if (a.length <= 0) {
            console.log('not found versios!');
            return;
        }
        let last_v = $(a[0]).text();
        // Array.from(a).map(i => {
        //     console.log($(i).text());
        // });

        let cmp = compareVersion(current_version, last_v);
        console.log('cmp', cmp);
        let message;
        if (cmp >= 0) {
            message = m_lang.fill(lang.check_update_nofound, util.formatVersion(current_version));
        } else {
            message = m_lang.fill(lang.check_update_found, last_v);
            buttons.unshift(lang.cancel);
        }

        dialog.showMessageBox({
            type: 'info',
            message,
            buttons
        }, (res) => {
            if (cmp < 0 && res === 1) {
                shell.openExternal(release_url);
            }
        });
    });
};
