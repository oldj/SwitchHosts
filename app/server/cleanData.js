/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

function makeGroupContent (item, list) {
  return (item.include || []).map(id => {
    return (list.find(i => i.id === id) || {}).content || ''
  }).join('\n\n')
}

module.exports = (list) => {
  return list.map(item => {
    let new_item = {}

    let valid_keys = [
      'id',
      'title',
      'content',
      'on',
      'where',
      'url',
      'last_refresh',
      'refresh_interval',
      'include'
    ]
    valid_keys.map(k => {
      if (item.hasOwnProperty(k)) {
        new_item[k] = item[k]
      }
    })

    if (new_item.where === 'group') {
      new_item.content = makeGroupContent(new_item, list)
    }

    return new_item
  })
}
