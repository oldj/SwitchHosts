/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {ipcMain} = require('electron')
const actions = require('./actions/index')

let renderer

ipcMain.on('x', (e, d) => {
  let sender = e.sender
  if (!renderer) {
    renderer = sender
  }

  let action = d.action
  let context = {}
  context.broadcast = broadcast
  if (typeof actions[action] === 'function') {
    actions[action](context, ...(d.data || []))
      .then(v => {
        sender.send(d.callback, [null, v])
      })
      .catch(e => {
        console.log(e)
        sender.send(d.callback, [e])
      })
  }
})

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
