/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const EventEmitter = require('events')
let svr = new EventEmitter()
svr.broadcast = broadcast

function broadcast (event, ...args) {
  if (!svr.renderer) {
    console.log('no renderer!')
    return
  }

  try {
    svr.renderer.send('y', {
      event,
      data: args
    })
  } catch (e) {
    console.log(e)
  }
}

svr.registerRenderer = (r) => {
  svr.renderer = r
}

module.exports = svr
