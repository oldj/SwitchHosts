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
        agent.getURL(host.url, {}, function (c) {
            host.content = c;
            host.last_refresh = moment().format('YYYY-MM-DD HH:mm:ss');

            app.onCurrentHostChange(host);
            app.doSave();
        });
    });
}
exports.checkRefresh = checkRefresh;

function getRemoteHosts(app, host) {

}
