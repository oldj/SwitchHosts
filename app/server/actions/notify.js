/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const path = require('path')
const notifier = require('node-notifier')

module.exports = (svr, title, message) => {
  return Promise.resolve()
    .then(() => {
      notifier.notify({
        title,
        message,
        icon: path.join(__dirname, '..', '..', 'assets', 'logo_512.png')
      }, (e) => {
        if (e) {
          console.log(e)
        }
      })
    })
}
