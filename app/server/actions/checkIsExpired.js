/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = (svr, hosts) => {
  let {refresh_interval, last_refresh} = hosts
  if (!last_refresh) return true

  let dt
  try {
    dt = new Date(last_refresh)
  } catch (e) {
    return true
  }

  let now = new Date()
  let hour = 3600000

  return (now.getTime() - dt.getTime()) / hour > refresh_interval
}

