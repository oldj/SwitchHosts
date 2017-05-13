/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const request = require('request')
const version = require('../../configs').version_full

const url = 'http://lab.oldj.net/s.gif'
const session_id = (new Date()).getTime() + ':' + Math.random()
const queue = []
let is_initialized = false

function log (actions) {
  let u = url + '?' + [
      'app=sh3',
      'action=' + encodeURIComponent(actions),
      'v=' + encodeURIComponent(version),
      'os=' + process.platform,
      'sid=' + encodeURIComponent(session_id),
      '_r=' + Math.random()
    ].join('&')

  console.log('stat: ' + actions)
  request
    .get(u)
    .on('error', err => {
      console.log(err)
    })
}

function record (action) {
  queue.push(action)
}

function send () {
  if (queue.length === 0) return

  let action = queue.splice(0).join(',')
  log(action)
}

function init () {
  if (is_initialized) return
  is_initialized = true

  record('launch')
  //SH_event.on('toggle_host', () => {
  //  record('switch')
  //})

  setInterval(function () {
    // 每一段时间自动打点
    record('tick')
  }, 60 * 1000 * 42)

  setInterval(() => {
    send()
  }, 5000)
}

init()

module.exports = (svr, action) => {
  return Promise.resolve()
    .then(() => record(action))
}

