/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {ipcMain} = require('electron')
const actions = require('./actions')
console.log(actions)

ipcMain.on('x', (e, d) => {
  let sender = e.sender
  let action = d.action
  if (typeof actions[action] === 'function') {
    actions[action](d.args, (e, v) => {
      try {
        sender.send(d.callback, [e, v])
      } catch (e2) {
        console.log(e2)
        sender.send(d.callback, [e2])
      }
    })
  }
})
