/**
 * kw
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

exports.kw2re = function (kw) {
    // 模糊搜索
    let r;
    let m;
    let flag = [];

    if ((m = kw.match(/^\/([^\/]+)\/?(\w*)$/))) {
        if (m[2].indexOf('i') > -1) {
            flag.push('i');
        }
        if (m[2].indexOf('g') > -1) {
            flag.push('g');
        }
        try {
            r = new RegExp(m[1], flag.join(''));
        } catch (e) {
        }
    } else if (kw.indexOf('*') > -1) {
        try {
            r = new RegExp(kw.replace(/\*/g, '.*'), 'ig');
        } catch (e) {
        }
    }

    return r;
};
