/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')

module.exports = () => {
  let fn = paths.data_path
  return io.pReadFile(fn)
    .then(cnt => {
      let data
      try {
        data = JSON.parse(cnt)
      } catch (e) {
        console.log(e)
        data = {}
      }
      return data
    })
    .then(data => {
      if (!Array.isArray(data.list)) {
        data.list = []
      }
      return data.list
    })
}
