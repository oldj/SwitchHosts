/**
 * @author oldj
 * @blog https://oldj.net
 *
 * try to apply hosts
 */

'use strict'

const paths = require('./paths')

module.exports = svr => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      svr.broadcast('sudo_prompt')
      resolve()
    }, 1000)
  })
}
