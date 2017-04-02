/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const saveHosts = require('./saveHosts')
const checkOne = require('./checkOneRemoteHosts')

module.exports = (svr, list, hosts = null) => {
  return Promise.all(list.map(i => checkOne(svr, i, hosts && hosts.id === i.id)))
    .then(list2 => saveHosts(svr, list2))
}

