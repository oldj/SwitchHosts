/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const lodash = require('lodash')
const saveHosts = require('./saveHosts')
const checkOne = require('./checkOneRemoteHosts')

module.exports = (svr, list, hosts = null) => {
  let original_list = lodash.cloneDeep(list)

  return Promise.all(list.map(i => checkOne(svr, i, hosts && hosts.id)))
    .then(list2 => {
      if (!lodash.isEqual(original_list, list2)) {
        // 仅在 list 的内容发生变化时才再次保存
        return saveHosts(svr, list2)
      } else {
        console.log('hosts list is not changed.')
      }
    })
}

