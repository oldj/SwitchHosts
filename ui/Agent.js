/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const IS_DEV = process.env.ENV === 'dev'
const {ipcRenderer} = require('electron')
const platform = process.platform

ipcRenderer.setMaxListeners(20)

const EventEmitter = require('events')
class MyEmitter extends EventEmitter {}
const evt = new MyEmitter();

let x_get_idx = 0

/**
 * act
 * @param action {String}
 * @param [data] {Any}
 * @param callback {Function}
 */
function act (action, data, callback) {
  let fn = ['_cb', (new Date()).getTime(), (x_get_idx++)].join('_')

  if (!callback && typeof data === 'function') {
    callback = data
    data = null
  }

  if (typeof callback === 'function') {
    ipcRenderer.once(fn, (e, d) => callback.apply(null, d))
  }

  ipcRenderer.send('x', {
    action
    , data
    , callback: fn
  })
}

function pact (action, ...args) {
  return new Promise((resolve, reject) => act(action, args,
    (err, result) => err ? reject(err) : resolve(result)))
}

module.exports = {
  IS_DEV
  , platform
  , act
  , pact
  , on: (...args) => evt.on(...args)
  , emit: (...args) => evt.emit(...args)
}
