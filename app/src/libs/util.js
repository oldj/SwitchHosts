/**
 * util
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');

exports.getUserHome = function () {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
};

exports.isFile = function (p) {
    try {
        if (fs.statSync(p).isFile()) {
            return true;
        }
    } catch (e) {
    }
    return false;
};

exports.isDirectory = function (p) {
    try {
        if (fs.statSync(p).isDirectory()) {
            return true;
        }
    } catch (e) {
    }
    return false;
};
