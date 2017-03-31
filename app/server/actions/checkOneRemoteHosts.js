/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const getUrl = require('./getUrl')

function isExpired (interval, last) {
  if (!last) return true

  let dt
  try {
    dt = new Date(last)
  } catch (e) {
    return true
  }

  let now = new Date()
  let hour = 3600000

  return (now.getTime() - dt.getTime()) / hour > interval
}

module.exports = (svr, hosts) => {
  console.log(27, hosts)
  return new Promise((resolve, reject) => {
    if (hosts.where !== 'remote' || !hosts.url) {
      resolve(hosts)
      return
    }

    let {refresh_interval, last_refresh} = hosts
    if (isExpired(refresh_interval, last_refresh)) {
      getUrl(svr, hosts.url)
        .then(content => {
          hosts.content = content
        })
        .then(() => resolve(hosts))
        .catch(e => resolve(e))
    } else {
      resolve(hosts)
    }
  })
}
