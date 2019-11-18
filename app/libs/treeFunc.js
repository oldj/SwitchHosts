/**
 * flat-tree.js
 * @author: oldj
 * @homepage: https://oldj.net
 */

const flatTree = tree => {
  let list = []

  tree.map(t => {
    list.push(t)
    let {children} = t
    if (Array.isArray(children) && children.length > 0) {
      list = [...list, ...flatTree(children)]
    }
  })

  return list
}

const getItemById = (tree, id) => {
  return flatTree(tree).find(item => item.id === id)
}

const getItemDetailById = (tree, id, parent = null) => {
  let idx = tree.findIndex(i => i.id === id)
  if (idx >= 0) {
    return {
      idx,
      item: tree[idx],
      parent_list: tree,
      parent
    }
  }

  for (let i of tree) {
    if (!Array.isArray(i.children)) {
      i.children = []
    }
    let d = getItemDetailById(i.children, id, i)
    if (d) {
      return d
    }
  }

  return null
}

const removeItemFromTreeById = (tree, id) => {
  let idx = tree.findIndex(item => item.id === id)
  if (idx >= 0) {
    tree.splice(idx, 1)
    return tree
  }

  tree.map(item => removeItemFromTreeById(item.children || [], id))

  return tree
}

/**
 * 更新 tree
 * @param tree
 * @param updates
 *    包含：source_id, target_id, where_to
 *    其中 where_to 的值
 */
const updateTree = (tree, updates) => {
  let {source_id, target_id, where_to} = updates
  if (!source_id || !target_id || source_id === target_id) {
    return tree
  }

  let source_item = getItemById(tree, source_id)
  tree = removeItemFromTreeById(tree, source_id)
  let {item, parent_list, idx} = getItemDetailById(tree, target_id) || {}
  if (!item) {
    console.log('no item!')
    console.log(source_id, target_id)
    return tree
  }

  if (where_to === 0) {
    // in
    if (!Array.isArray(item.children)) {
      item.children = []
    }
    item.children.push(source_item)
  } else if (where_to === -1) {
    // before
    parent_list.splice(idx, 0, source_item)
  } else {
    // after
    parent_list.splice(idx + 1, 0, source_item)
  }

  return tree
}

function getParentList (list, id) {
  if (list.findIndex(i => i.id === id) > -1) return list

  let fl = flatTree(list)
  let found = false
  let parent_list = []

  fl.map((i) => {
    if (found) return

    if (i.id === id) {
      found = true
      parent_list = list
    } else if (i.children && i.children.find((i2) => i2.id === id)) {
      found = true
      parent_list = i.children
    }
  })

  return parent_list
}

function getNeighbors (list, id) {
  let parent_list = getParentList(list, id)
  //if (!parent_list) return {}

  let neighbors = {}
  let idx = parent_list.findIndex(i => i.id === id)

  let n
  if (idx > 0) {
    n = parent_list[idx - 1]
    if (n) {
      neighbors.previous = n
    }
  }

  n = parent_list[idx + 1]
  if (n) {
    neighbors.next = n
  }

  return neighbors
}

module.exports = {
  flatTree,
  updateTree,
  getItemById,
  getItemDetailById,
  removeItemFromTreeById,
  getNeighbors
}
