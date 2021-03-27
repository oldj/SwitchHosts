/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = (v) => {
  return 'v' + v.slice(0, 3).join('.') + ` (${v[3]})`
}
