/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = (svr) => {
  return Promise.resolve()
    .then(() => {
      svr.emit('sudo_cancel')
    })
}

