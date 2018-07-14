/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const request = require('request')
const fs = require('fs')
const {URL} = require('url')
const {version} = require('../../version')
//process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

module.exports = (svr, url) => {
  if (url.indexOf('file:/') === 0) {
    //fs
    return new Promise((resolve, reject) => {
      const fileUrl = new URL(encodeURI(url))
      fs.stat(fileUrl, (err, stats) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          if (stats.isFile()) {
            fs.readFile(fileUrl, (error, data) => {
              if (err) {
                console.log(err)
                reject(err)
              } else {
                resolve(data.toString())
              }
            })
          } else {
            reject(err)
          }
        }
      })
    })
  } else {
    //request
    return new Promise((resolve, reject) => {
      let options = {
        url,
        headers: {
          'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36 SwitchHosts/${version.join('.')}`
        },
        rejectUnauthorized: false
      }

      request(options, (err, res, body) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          resolve(body)
        }
      })
    })
  }
}
