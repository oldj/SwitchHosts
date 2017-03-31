/**
 * @author oldj
 * @blog https://oldj.net
 *
 * 输出 hosts，提供给系统等应用
 */

'use strict'

function getHostsContent(item) {
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
