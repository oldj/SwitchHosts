/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = (list) => {
  return list.map(item => {
    let new_item = {}

    let valid_keys = [
      'id', 'title', 'content', 'on', 'where', 'last_refresh', 'url'
    ]
    valid_keys.map(k => {
      if (item.hasOwnProperty(k)) {
        new_item[k] = item[k]
      }
    })

    return new_item
  })
}
