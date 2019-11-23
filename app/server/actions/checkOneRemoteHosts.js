/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const getUrl = require('./getUrl')
const isExpired = require('../checkIsExpired')
const lineBreakTransform = require('../../libs/lineBreakTransform')
const moment = require('moment')

function now () {
  return moment().format('YYYY-MM-DD HH:mm:ss')
}

module.exports = (svr, hosts, force = false) => {
  return new Promise((resolve, reject) => {
    if (hosts.where !== 'remote' || !hosts.url) {
      resolve(hosts)
      return
    }

    if (force || isExpired(svr, hosts)) {
      let hosts2 = Object.assign({}, hosts)

      console.log('checkRemote', `'${hosts2.title}'`, force, isExpired(svr, hosts2))
      getUrl(svr, hosts2.url)
        .then(content => {
          hosts2.content = lineBreakTransform(content)
          hosts2.last_refresh = now()
        })
        .then(() => resolve(hosts2))
        .catch(e => {
          console.log(e)
          reject(e)
        })
    } else {
      resolve(hosts)
    }
  })
}
