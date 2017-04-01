/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')
const version = require('../../version').version
const saveHosts = require('./saveHosts')

module.exports = (svr, fn) => {
  return new Promise((resolve, reject) => {
    if (!io.isFile(fn)) {
      reject(`'${fn}' is not a file!`)
      return
    }

    io.pReadFile(fn)
      .then(cnt => {
        let data
        try {
          data = JSON.parse(cnt)
        } catch (e) {
          data = {}
        }

        return data.list || []
      })
      .then(list => {
        return saveHosts(svr, list)
      })
      .then(() => {
        svr.broadcast('reload')
      })
      .then(() => resolve())
      .catch(e => reject(e))
  })
}
