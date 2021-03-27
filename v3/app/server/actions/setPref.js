/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')
const getPref = require('./getPref')
const jsbeautify = require('js-beautify').js_beautify

module.exports = (svr, k_or_data, v = null) => {
  let fn = paths.preference_path
  let p = Promise.resolve()

  if (typeof k_or_data === 'string') {
    // k/v mode
    p = p.then(() => getPref())
      .then(prefs => {
        prefs[k_or_data] = v
        return prefs
      })
  } else {
    // object mode
    p = p.then(() => Object.assign({}, k_or_data))
  }

  return p
    .then(prefs => {
      return jsbeautify(JSON.stringify(prefs), {
        indent_size: 2
      })
    })
    .then(cnt => io.pWriteFile(fn, cnt))
}
