/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const request = require('request')
const fs = require('fs')
const { URL } = require('url');
//process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

module.exports = (svr, url) => {
  if(url.indexOf('file:/') == 0) {
    //fs
    return new Promise((resolve, reject) => {
      const fileUrl = new URL(url);
      fs.stat(fileUrl, (err, stats) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          if(stats.isFile()){
            fs.readFile(fileUrl,(error, data) => {
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
      });
    })
  } else {
    //request
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
}
