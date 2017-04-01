/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')
const version = require('../../version').version

module.exports = (svr, fn) => {
  let data_path = paths.data_path

  return Promise
    .resolve()
    .then(() => {
      if (io.isFile(data_path)) {
        return io.pReadFile(data_path)
      } else {
        return '{}'
      }
    })
    .then(cnt => {
      let data
      try {
        data = JSON.parse(cnt)
      } catch (e) {
        console.log(e)
      }
      data.version = version

      return JSON.stringify(data)
    })
    .then(cnt => {
      return io.pWriteFile(fn, cnt)
    })
}
