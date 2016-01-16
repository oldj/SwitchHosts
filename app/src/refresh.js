/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var agent = require('./agent');
var moment = require('moment');

function checkRefresh(app) {
    var to_refresh_list = [];

    app.hosts.list.map(function (host) {
        if (typeof host.refresh_interval != 'number') {
            host.refresh_interval = 0;
        }

        if (host.where != 'remote' || !host.refresh_interval) {
            return;
        }

        var last_refresh = host.last_refresh;
        if (typeof last_refresh == 'string') {
            last_refresh = moment(last_refresh);
        }

        if (last_refresh && last_refresh.isValid && last_refresh.isValid()) {
            last_refresh.add(host.refresh_interval, 'h');
            if (last_refresh.diff(moment()) > 0) {
                return;
            }
        }

        to_refresh_list.push(host);
    });

    to_refresh_list.map(function (host) {
        getRemoteHost(app, host);
    });
}
exports.checkRefresh = checkRefresh;

function getRemoteHost(app, host) {
    if (host.where !== 'remote' || !host.url) return;
    var tpl = [
        '# REMOTE: ' + host.title,
        '# URL: ' + host.url
    ];

    host.content = '# loading...';
    app.onCurrentHostChange(host);

    agent.getURL(host.url, {}, function (s) {
        // success
        var now = moment().format('YYYY-MM-DD HH:mm:ss');
        host.content = tpl.concat(['# UPDATE: ' + now, '', s]).join('\n');
        host.last_refresh = now;
        app.onCurrentHostChange(host);
        app.doSave();

        if (app.current_host == host) {
            app.current_edit_host.content = host.content;
            app.current_edit_host.last_refresh = host.last_refresh;
        }

        if (host.on) {
            setTimeout(function () {
                app.caculateHosts(host);
            }, 100);
        }
    }, function (xhr, status) {
        // fail
        var now = moment().format('YYYY-MM-DD HH:mm:ss');
        host.content = tpl.concat(['# UPDATE: ' + now, '', 'FAIL to get!', status]).join('\n');
        host.last_refresh = now;
        if (host == app.current_host) {
            app.current_edit_host.last_refresh = now;
        }
        app.onCurrentHostChange(host);
        app.doSave();
    });

    app.doSave();
}
exports.getRemoteHost = getRemoteHost;
