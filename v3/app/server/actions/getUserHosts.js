/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const paths = require('../paths')
const io = require('../io')
const makeId = require('../../libs/make-id')

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
    .then(list => {
      let ids = {}
      return list.map(item => {
        if (!item.id || ids.hasOwnProperty(item.id)) {
          item.id = makeId()
        }
        ids[item.id] = 1
        return item
      })
    })
}
