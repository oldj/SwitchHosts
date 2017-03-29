/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const EventEmitter = require('events')
const {ipcMain} = require('electron')
const actions = require('./actions/index')

let renderer
let svr = new EventEmitter()
svr.broadcast = broadcast

function broadcast (event, ...args) {
  if (!renderer) {
    console.log('no renderer!')
    return
  }

  try {
    renderer.send('y', {
      event,
      data: args
    })
  } catch (e) {
    console.log(e)
  }
}

ipcMain.on('x', (e, d) => {
  let sender = e.sender
  if (!renderer) {
    renderer = sender
  }

  let action = d.action

  if (typeof actions[action] === 'function') {
    actions[action](svr, ...(d.data || []))
      .then(v => {
        sender.send(d.callback, [null, v])
      })
      .catch(e => {
        console.log('x:err', e)
        sender.send(d.callback, [e])
      })
  }
})

