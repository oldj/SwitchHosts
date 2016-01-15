/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var url = 'http://lab.oldj.net/s.gif';
var queue = [];
var session_id = (new Date()).getTime() + ':' + Math.random();
var v = require('./config').VERSION;

exports.record = function (action) {
    queue.push(action);
};

function send() {
    if (queue.length === 0) {
        return;
    }

    var src = url + '?app=sh3&action=' + queue.splice(0).join(',')
        + '&v=' + v
        + '&sid=' + session_id
        + '&_r=' + Math.random();
    var id = ('_rnd_img_' + Math.random()).replace('.', '');
    var img = new Image();
    window[id] = img;
    img.src = src;

    img.onload = img.onerror = function () {
        window[id] = null;
    };
}

setInterval(function () {
    send();
}, 5000);
