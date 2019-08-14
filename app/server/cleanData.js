/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const treeFunc = require('../libs/treeFunc')

function makeGroupContent (item, list) {
  let flat_list = treeFunc.flatTree(list)
  return (item.include || []).map(id => {
    return (flat_list.find(i => i.id === id) || {}).content || ''
  }).join('\n\n')
}

function makeFolderContent (item, list) {
  return (item.children || []).map(i => i.content).join('\n\n')
}

const doClean = tree => {
  if (!tree || !Array.isArray(tree) || tree.length === 0) {
    return []
  }

  return tree.map(item => {
    let new_item = {}

    let valid_keys = [
      'id',
      'title',
      'content',
      'on',
      'where',
      'folder_mode',
      'url',
      'last_refresh',
      'refresh_interval',
      'include',
      'children'
    ]
    valid_keys.map(k => {
      if (item.hasOwnProperty(k)) {
        new_item[k] = item[k]
      }
    })

    new_item.children = doClean(new_item.children)

    if (new_item.where === 'group') {
      new_item.content = makeGroupContent(new_item, tree)
    } else if (new_item.where === 'folder') {
      new_item.content = makeFolderContent(new_item, tree)
    }

    return new_item
  })
}

module.exports = list => doClean(list)
