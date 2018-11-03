/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const IS_DEV = process.env.ENV === 'dev'
const { ipcRenderer } = require('electron')
const platform = process.platform

const EventEmitter = require('events')
const evt = new EventEmitter()

const max_listener_count = 20
evt.setMaxListeners(max_listener_count)
ipcRenderer.setMaxListeners(max_listener_count)

let x_get_idx = 0

/**
 * act
 * @param action {String}
 * @param args {Array}
 */
function act(action, ...args) {
    let fn = ['_cb', (new Date()).getTime(), (x_get_idx++)].join('_')

    let callback
    if (args.length > 0 && typeof args[args.length - 1] === 'function') {
        callback = args.pop() // 先进后出的叫栈
    }

    if (typeof callback === 'function') {
        // callback 参数在下方定义, err 和 result, 惯例第一个参数是 err; d 是个数组
        ipcRenderer.once(fn, (e, d) => callback.apply(null, d))
    }

    ipcRenderer.send('x', { // 从渲染进程到主进程的异步通讯
        action
        , data: args
        , callback: fn // 以 fn 作为 channel, 主进程以此进行标识和发送消息
    })
}

function pact(action, ...args) {
    return new Promise((resolve, reject) => {
        args.push((err, result) => err ? reject(err) : resolve(result))
        act(action, ...args) // 消息到的时候, (act 函数中的 once) 才会被 fulfilled, resolve 或者 reject
    })
}


ipcRenderer.on('y', (sender, d) => {
    evt.emit(d.event, ...d.data || [])
})

module.exports = {
    IS_DEV
    , platform
    , act
    , pact // 与主进程通信
    , on: (...args) => evt.on(...args) // 渲染进程内部通信
    , emit: (...args) => evt.emit(...args) // 渲染进程内部通信
}
