/**
 * @author oldj
 * @blog http://oldj.net
 *
 * import & export
 */

'use strict';

var agent = require('./agent');
var util = require('./util');
var lang = require('./lang').getLang(navigator.language);
var config = require('./config');

var exportable_keys = {
    title: 10,
    content: 10,
    where: 1,
    url: 1,
    refresh_interval: 1
};

var import_default = {
    title: 'Title',
    content: '',
    on: false,
    where: 'local',
    url: '',
    refresh_interval: 0
};

/**
 * 检查导入的 hosts 数据的有效性
 * @param data {Array}
 */
function checkData(data) {
    var valid_count = 0;

    data.map(function (item) {
        if (item.title && 'content' in item) {
            valid_count ++;
        }
    });

    return valid_count;
}

function importFrom(list, path) {
    var data = agent.readFile(path);
    try {
        data = JSON.parse(data);
    } catch (e) {
        alert(e.message);
        return;
    }

    if (!data || typeof data != 'object' || !util.isArray(data.list)) {
        alert('Bad format!');
        return;
    }

    var valid_count = checkData(data.list);
    if (!valid_count) {
        alert(lang.no_valid_host_found);
        return;
    }

    if (!confirm(lang.confirm_import)) return;

    list.splice(0);
    data.list.map(function (item) {
        var new_item = {};
        var k;
        for (k in item) {
            if (item.hasOwnProperty(k) && exportable_keys[k]) {
                new_item[k] = item[k];
            }

            var k2;
            for (k2 in import_default) {
                if (import_default.hasOwnProperty(k2)) {
                    new_item[k2] = new_item[k2] || import_default[k2];
                }
            }
        }
        list.push(new_item);
    });
}
exports.importFrom = importFrom;

function exportTo(data, path) {
    var out_data = {
        version: config.VERSION
    };
    var new_data = [];
    data.map(function (item) {
        var new_item = {};
        var k;
        for (k in item) {
            if (item.hasOwnProperty(k) && exportable_keys[k]) {
                new_item[k] = item[k];
            }
        }
        new_data.push(new_item);
    });

    out_data.list = new_data;
    var c = JSON.stringify(out_data);
    agent.writeFile(path, c);
}
exports.exportTo = exportTo;
