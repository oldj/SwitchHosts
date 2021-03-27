/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')

module.exports = () => {
  let fn = paths.preference_path
  return io
    .pReadFile(fn)
    .then(cnt => {
      if (!cnt) return {}

      let data
      try {
        data = JSON.parse(cnt)
      } catch (e) {
        console.log(e)
        data = {}
      }
      return data
    })
}
