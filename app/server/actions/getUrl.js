/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const request = require('superagent')

module.exports = (svr, url) => {
  return new Promise((resolve, reject) => {
    request
      .get(url)
      .end((err, res) => {
        if (err) {
          reject(err)
        } else {
          resolve(res.text)
        }
      })
  })
}
