/**
 * @author oldj
 * @blog https://oldj.net
 *
 * try to apply hosts
 */

'use strict'

module.exports = svr => {

  let _resolve
  let _reject

  svr.once('sudo_pswd', (pswd) => {
    svr.removeAllListeners('sudo_cancel')
    try {
      _resolve(pswd)
    } catch (e) {
      console.log(e)
    }
  })

  svr.once('sudo_cancel', () => {
    svr.removeAllListeners('sudo_pswd')
    try {
      _reject('user:sudo_cancel')
    } catch (e) {
      console.log(e)
    }
  })

  return new Promise((resolve, reject) => {
    svr.broadcast('sudo_prompt')
    try {
      svr.win.show()
    } catch (e) {
      console.log(e)
    }

    _resolve = resolve
    _reject = reject
  })
}
