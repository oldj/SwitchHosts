/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const getUrl = require('./getUrl')
const isExpired = require('../checkIsExpired')

function now () {
  let dt = new Date()

  return `${dt.getFullYear()}-${dt.getMonth() +
                                1}-${dt.getDate()} ${dt.getHours()}:${dt.getMinutes()}:${dt.getSeconds()}`
}

module.exports = (svr, hosts) => {
  return new Promise((resolve, reject) => {
    if (hosts.where !== 'remote' || !hosts.url) {
      resolve(hosts)
      return
    }

    if (isExpired(svr, hosts)) {
      getUrl(svr, hosts.url)
        .then(content => {
          hosts.content = content
          hosts.last_refresh = now()
        })
        .then(() => resolve(hosts))
        .catch(e => resolve(e))
    } else {
      resolve(hosts)
    }
  })
}
