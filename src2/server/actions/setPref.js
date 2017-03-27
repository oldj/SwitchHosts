/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')
const getPref = require('./getPref')

module.exports = (k, v) => {
  let fn = paths.preference_path

  return Promise
    .resolve()
    .then(() => getPref())
    .then(prefs => {
      prefs[k] = v
      return prefs
    })
    .then(prefs => io.pWriteFile(fn, JSON.stringify(prefs)))
}
