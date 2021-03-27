/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const checkOne = require('./checkOneRemoteHosts')

module.exports = (svr, list) => {
  return Promise.all(list.map(hosts => checkOne(svr, hosts)))
}
