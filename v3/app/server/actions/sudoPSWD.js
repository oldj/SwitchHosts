/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = (svr, pswd) => {
  return Promise.resolve()
    .then(() => {
      svr.emit('sudo_pswd', pswd)
    })
}

