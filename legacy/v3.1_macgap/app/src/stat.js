/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var url = 'http://lab.oldj.net/s.gif';
var queue = [];
var session_id = (new Date()).getTime() + ':' + Math.random();
var config = require('./config');
var v = [config.VERSION, config.bundle_version].join('.');

function record(action) {
    queue.push(action);
}
exports.record = record;

function send() {
    if (queue.length === 0) {
        return;
    }

    var src = url + '?app=sh3&action=' + queue.splice(0).join(',')
        + '&v=' + encodeURIComponent(v)
        + '&sid=' + encodeURIComponent(session_id)
        + '&_r=' + Math.random();
    var id = ('_rnd_img_' + Math.random()).replace('.', '');
    var img = new Image();
    window[id] = img;
    img.src = src;

    img.onload = img.onerror = function () {
        window[id] = null;
    };
}

window.addEventListener('error', function () {
    record('err');
}, true);

setInterval(function () {
    // 每一段时间自动打点
    record('tick');
}, 60 * 1000 * 42);

setInterval(function () {
    send();
}, 5000);
