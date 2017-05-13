/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const request = require('request')
//process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

module.exports = (svr, url) => {
  return new Promise((resolve, reject) => {
    request({
      url,
      rejectUnauthorized: false
    }, (err, res, body) => {
      if (err) {
        console.log(err)
        reject(err)
      } else {
        resolve(body)
      }
    })
  })
}
