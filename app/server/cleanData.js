/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const treeFunc = require('../libs/treeFunc')

const valid_keys = [
  'id',
  'title',
  'content',
  'on',
  'where', // type
  'folder_mode',
  'url',
  'last_refresh',
  'refresh_interval',
  'include',
  'children',
  'memo',
  'meta_info'
]

function makeGroupContent (item, flat_tree) {
  return (item.include || [])
    .map(id => (flat_tree.find(i => i.id === id) || {}).content || '')
    .join('\n\n')
}

function makeFolderContent (item, list) {
  return (item.children || []).map(i => i.content).join('\n\n')
}

const doClean = (tree, flat_tree = null) => {
  if (!tree || !Array.isArray(tree) || tree.length === 0) {
    return []
  }

  flat_tree = flat_tree || treeFunc.flatTree(tree)

  return tree.map(item => {
    let new_item = {}
    valid_keys.map(k => {
      if (item.hasOwnProperty(k)) {
        new_item[k] = item[k]
      }
    })

    new_item.children = doClean(new_item.children, flat_tree)

    if (new_item.where === 'group') {
      new_item.content = makeGroupContent(new_item, flat_tree)
    } else if (new_item.where === 'folder') {
      new_item.content = makeFolderContent(new_item, tree)
    }

    return new_item
  })
}

module.exports = list => doClean(list)
