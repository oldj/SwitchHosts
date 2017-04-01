/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const isExpired = require('./checkIsExpired')
const saveHosts = require('./saveHosts')

module.exports = (svr, list, hosts = null) => {
  let exp = [false]
  if (!hosts) {
    exp = list.map(hosts => isExpired(svr, hosts))
  } else {
    exp = [isExpired(svr, hosts)]
  }

  if (exp.includes(true)) {
    return saveHosts(svr, list)
  } else {
    return Promise.resolve()
      .then(() => false)
  }
}

