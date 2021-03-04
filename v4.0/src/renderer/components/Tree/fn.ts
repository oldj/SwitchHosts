import lodash from 'lodash'
import { ITreeNodeData } from './Node'
import { DropWhereType, NodeIdType } from './Tree'

export function flatten(tree_list: ITreeNodeData[]): ITreeNodeData[] {
  let arr: any[] = []

  Array.isArray(tree_list) &&
  tree_list.map((item) => {
    if (!item) return

    arr.push(item)

    if (Array.isArray(item.children)) {
      let a2 = flatten(item.children)
      arr = arr.concat(a2)
    }
  })

  return arr
}

export function getParentList(
  tree_list: ITreeNodeData[],
  id: NodeIdType,
): ITreeNodeData[] {
  if (tree_list.findIndex((i) => i.id === id) > -1) {
    return tree_list
  }

  let flat = flatten(tree_list)
  for (let node of flat) {
    if (
      Array.isArray(node.children) &&
      node.children.findIndex((i) => i.id === id) > -1
    ) {
      return node.children
    }
  }

  return tree_list
}

export const treeMoveNode = (
  tree_list: ITreeNodeData[],
  source_id: NodeIdType,
  target_id: NodeIdType,
  where: DropWhereType,
): ITreeNodeData[] | null => {
  tree_list = lodash.cloneDeep(tree_list)

  if (source_id === target_id) return null

  // console.log(JSON.stringify(tree_list))
  let source_parent_list = getParentList(tree_list, source_id)
  // console.log(JSON.stringify(source_parent_list))
  let source_idx = source_parent_list.findIndex((i) => i.id === source_id)

  if (source_idx === -1) {
    // console.log('source_idx === -1')
    return null
  }
  let source_node = source_parent_list.splice(source_idx, 1)[0]

  let target_parent_list = getParentList(tree_list, target_id)
  let target_idx = target_parent_list.findIndex((i) => i.id === target_id)
  if (target_idx === -1) {
    // console.log('target_idx === -1')
    return null
  }

  if (where === 'in') {
    let target_node = target_parent_list[target_idx]
    if (!Array.isArray(target_node.children)) {
      target_node.children = []
    }
    target_node.children.push(source_node)
  } else if (where === 'before') {
    target_parent_list.splice(target_idx, 0, source_node)
  } else if (where === 'after') {
    target_parent_list.splice(target_idx + 1, 0, source_node)
  }

  return tree_list
}

export function getNodeById(tree_list: ITreeNodeData[], id: NodeIdType): ITreeNodeData | undefined {
  return flatten(tree_list).find(i => i.id === id)
}

export function isChildOf(tree_list: ITreeNodeData[], a_id: NodeIdType, b_id: NodeIdType): boolean {
  if (a_id === b_id) return false

  let target_node = getNodeById(tree_list, b_id)
  if (!target_node || !Array.isArray(target_node.children)) return false

  return flatten(target_node.children).findIndex(i => i.id === a_id) > -1
}
