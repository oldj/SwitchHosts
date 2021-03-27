/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = (app, callback) => {
  let list = app.state.list
  let ids = list.filter(item => item.on).map(item => item.id)
  callback(ids)
}
