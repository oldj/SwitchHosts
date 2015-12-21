/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

exports.now = function () {
    var dt = new Date();
    return [
        dt.getFullYear(), '-', dt.getMonth() + 1, '-', dt.getDay(), ' ',
        dt.getHours(), ':', dt.getMinutes(), ':', dt.getSeconds()
    ].join('');
};

exports.trim = function (s) {
    if (!s) return '';
    return (typeof s === 'string' ? s : s.toString()).replace(/^\s+|\s+$/g, '');
};

exports.copyObj = function (obj) {
    var new_obj = {};
    var k;
    var v;
    for (k in obj) {
        if (obj.hasOwnProperty(k)) {
            v = obj[v];
            new_obj[k] = v;
        }
    }
    return new_obj;
};
