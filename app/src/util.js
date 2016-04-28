/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

exports.trim = function (s) {
    if (!s) return '';
    return (typeof s === 'string' ? s : s.toString()).replace(/^\s+|\s+$/g, '');
};

function isArray(a) {
    if (typeof Array.isArray == 'function') {
        return Array.isArray(a);
    }
    return Object.prototype.toString.call(a) === '[object Array]';
}
exports.isArray = isArray;

function updateObj(o1, o2) {
    var k;
    for (k in o2) {
        if (o2.hasOwnProperty(k)) {
            o1[k] = o2[k];
        }
    }
}
exports.updateObj = updateObj;

function copyObj(obj, deep) {
    var type = typeof obj;
    if (type == 'string' || type == 'number' || type == 'boolean') return obj;

    // array
    if (isArray(obj)) {
        var a = [];
        var i;
        for (i = 0; i < obj.length; i++) {
            a.push(deep ? copyObj(obj[i], deep) : obj[i]);
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
                new_obj[k] = deep ? copyObj(v, deep) : v;
            }
        }
        return new_obj;
    }

    return obj;
}
exports.copyObj = copyObj;
