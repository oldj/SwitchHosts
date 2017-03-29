/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const IS_DEV = process.env.ENV === 'dev'
const {ipcRenderer} = require('electron')
const platform = process.platform

const EventEmitter = require('events')
class MyEmitter extends EventEmitter {}
const evt = new MyEmitter()

ipcRenderer.setMaxListeners(20)

let x_get_idx = 0

/**
 * act
 * @param action {String}
 * @param args {Array}
 */
function act (action, ...args) {
  let fn = ['_cb', (new Date()).getTime(), (x_get_idx++)].join('_')

  let callback
  if (args.length > 0 && typeof args[args.length - 1] === 'function') {
    callback = args.pop()
  }

  if (typeof callback === 'function') {
    ipcRenderer.once(fn, (e, d) => callback.apply(null, d))
  }

  ipcRenderer.send('x', {
    action
    , data: args
    , callback: fn
  })
}

function pact (action, ...args) {
  return new Promise((resolve, reject) => {
    args.push((err, result) => err ? reject(err) : resolve(result))
    act(action, ...args)
  })
}

module.exports = {
  IS_DEV
  , platform
  , act
  , pact
  , on: (...args) => evt.on(...args)
  , emit: (...args) => evt.emit(...args)
}
