/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const request = require('request');
const version = require('../configs').version_full;

const url = 'http://lab.oldj.net/s.gif';
const session_id = (new Date()).getTime() + ':' + Math.random();
const queue = [];
let is_initialized = false;

function log(action) {
    let u = url + '?' + [
            'app=sh3',
            'action=' + encodeURIComponent(action),
            'v=' + encodeURIComponent(version),
            'os=' + process.platform,
            'sid=' + encodeURIComponent(session_id),
            '_r=' + Math.random()
        ].join('&');

    console.log('stat: ' + action);
    request.get(u)
        .on('response', function(response) {
            // console.log('log ' + response.statusCode); // 200
        })
        .on('error', function(err) {
            console.log(err);
        });
}

function record(action) {
    queue.push(action);
}

function send() {
    if (queue.length === 0) return;

    let action = queue.splice(0).join(',');
    log(action);
}

function init() {
    if (is_initialized) return;
    is_initialized = true;

    record('launch');
    SH_event.on('toggle_host', () => {
        record('switch');
    });

    setInterval(function () {
        // 每一段时间自动打点
        record('tick');
    }, 60 * 1000 * 42);

    setInterval(() => {
        send();
    }, 5000);
}

exports.init = init;
