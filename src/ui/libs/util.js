/**
 * util
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

exports.formatVersion = (v) => {
  return 'v' + v.slice(0, 3).join('.') + ` (${v[3]})`
}

exports.makeId = () => {
  return (new Date()).getTime() + '-' + Math.floor(Math.random() * 1e6)
}
