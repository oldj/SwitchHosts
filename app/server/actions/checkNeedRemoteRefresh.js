/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const saveHosts = require('./saveHosts')
const checkOne = require('./checkOneRemoteHosts')

function isHostsEqual(hosts1, hosts2) {
  return hosts1.id === hosts2.id && hosts1.content === hosts2.content && hosts1.last_refresh === hosts2.last_refresh
}

function isListEqual (list1, list2) {
  let len = list1.length

  if (len !== list2.length) return false
  for (let i = 0; i < len; i ++) {
    if (!isHostsEqual(list1[i] ,list2[i])) {
      return false
    }
  }

  return true
}

module.exports = (svr, list, hosts = null) => {
  return Promise.all(list.map(i => checkOne(svr, i, hosts && hosts.id === i.id)))
    .then(list2 => {
      if (!isListEqual(list, list2)) {
        // 仅在 list 的内容发生变化时才再次保存
        return saveHosts(svr, list2)
      }
    })
}

