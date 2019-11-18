/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {ipcMain} = require('electron')
const actions = require('./actions')
const svr = require('./svr')
require('./http/app')

let renderer

ipcMain.on('x', (e, d) => {
  let sender = e.sender
  if (!renderer) {
    renderer = sender
    svr.registerRenderer(renderer)
  }

  let action = d.action

  if (typeof actions[action] === 'function') {
    actions[action](svr, ...(d.data || []))
      .then(v => {
        try {
          sender.send(d.callback, [null, v])
        } catch (e) {
          console.log(`Error: action [${action}] fail!`)
          console.log(e)
        }
      })
      .catch(e => {
        console.log('x:err', e)
        sender.send(d.callback, [e])
      })
  }
})

