/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const path = require('path')

require('fs').readdirSync(__dirname).map((file) => {
  /* If its the current file ignore it */
  if (file === 'index.js') return

  /* Store module with its name (from filename) */
  module.exports[path.basename(file, '.js')] = require(path.join(__dirname, file))
})
