/**
 * @author oldj
 * @blog https://oldj.net
 *
 * try to apply hosts
 */

'use strict'

const paths = require('./paths')

module.exports = cnt => {
  return new Promise((resolve, reject) => {
    reject('need_sudo')
  })
}
