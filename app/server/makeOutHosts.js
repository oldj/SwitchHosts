/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

function getHostsContent(item, list) {
  return item.content || ''
}

module.exports = (list) => {
  let items = []
  list.map(item => {
    if (item.on) {
      items.push(item)
    }
  })

  return items.map(item => getHostsContent(item, list)).join('\n\n')
}
