/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {shell} = require('electron')

module.exports = (svr, url) => {
  shell.openExternal(url)
}
