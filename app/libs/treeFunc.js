/**
 * flat-tree.js
 * @author: oldj
 * @homepage: https://oldj.net
 */

/**
 * 将 tree_list 树状对象变成一个平的数组
 * @param tree_list {Array} 树状对象
 * @param ignore_collapsed {Boolean} 是否忽略折叠起来的对象
 * @returns {Array}
 */
function flatTree(tree_list, ignore_collapsed = false) {
  let arr = []

  Array.isArray(tree_list) && tree_list.map((item) => {
    if (!item) return

    arr.push(item)

    if (ignore_collapsed && item.collapsed) return

    if (item.children) {
      let a2 = flatTree(item.children, ignore_collapsed)
      arr = arr.concat(a2)
    }
  })

  return arr
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

function getUpItemWithCollapseState (list, id) {
  let f_list = flatTree(list, true)
  let idx = f_list.findIndex(i => i.id === id)
  return idx > 0 ? f_list[idx - 1] : null
}

function getDownItemWithCollapseState (list, id) {
  let f_list = flatTree(list, true)
  let idx = f_list.findIndex(i => i.id === id)
  return f_list[idx + 1] || null
}

module.exports = {
  flatTree,
  updateTree,
  getItemById,
  getItemDetailById,
  removeItemFromTreeById,
  getUpItemWithCollapseState,
  getDownItemWithCollapseState
}
