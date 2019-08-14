/**
 * @author oldj
 * @blog https://oldj.net
 *
 * 输出 hosts，提供给系统等应用
 */

'use strict'

const treeFunc = require('../libs/treeFunc')

function getHostsContent (item) {
  return item.content || ''
}

module.exports = (list) => treeFunc.flatTree(list)
  .filter(item => item.on)
  .map(item => getHostsContent(item, list)).join('\n\n')
