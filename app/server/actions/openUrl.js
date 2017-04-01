/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {shell} = require('electron')

module.exports = (svr, url) => {
  return Promise.resolve()
    .then(() => {
      shell.openExternal(url)
    })
}
