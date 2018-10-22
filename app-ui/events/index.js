/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
const req = require.context('./', false, /\.js$/)

export const reg = (app) => {
  req.keys().map(fn => {
    let m = fn.match(/^\.\/([\w\-]+)\.js$/)
    let name = m ? m[1] : null
    if (!name || name === 'index') return
    Agent.on(name, (...args) => {
      let fn = require(`./${name}`)
      fn(app, ...args)
    })
  })
}

