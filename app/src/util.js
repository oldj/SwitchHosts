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

function isArray(a) {
    if (typeof Array.isArray == 'function') {
        return Array.isArray(a);
    }
    return Object.prototype.toString.call(o) === '[object Array]';
}
exports.isArray = isArray;

function copyObj(obj, deep) {
    var type = typeof obj;
    if (type == 'string' || type == 'number' || type == 'boolean') return obj;

    // array
    if (isArray(obj)) {
        var a = [];
        var i;
        for (i = 0; i < obj.length; i++) {
            a.push(deep ? copyObj(obj[i]) : obj[i]);
        }
        return a;
    }

    if (type == 'object') {
        if (obj === null) return obj;

        var new_obj = {};
        var k;
        var v;
        for (k in obj) {
            if (obj.hasOwnProperty(k)) {
                v = obj[k];
                new_obj[k] = deep ? copyObj(v) : v;
            }
        }
        return new_obj;
    }

    return obj;
}
exports.copyObj = copyObj;
