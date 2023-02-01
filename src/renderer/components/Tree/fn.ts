import { ITreeNodeData, NodeIdType } from '@common/tree'
import lodash from 'lodash'
import { DropWhereType } from './Tree'

interface IObj {
  [key: string]: any
}

export type KeyMapType = [string, string]

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

export function getParentList(tree_list: ITreeNodeData[], id: NodeIdType): ITreeNodeData[] {
  if (tree_list.findIndex((i) => i.id === id) > -1) {
    return tree_list
  }

  let flat = flatten(tree_list)
  for (let node of flat) {
    if (Array.isArray(node.children) && node.children.findIndex((i) => i.id === id) > -1) {
      return node.children
    }
  }

  return tree_list
}

export const treeMoveNode = (
  tree_list: ITreeNodeData[],
  source_ids: NodeIdType[],
  target_id: NodeIdType,
  where: DropWhereType,
): ITreeNodeData[] | null => {
  tree_list = lodash.cloneDeep(tree_list)

  if (source_ids.includes(target_id)) return null

  // console.log(JSON.stringify(tree_list))
  let source_parent_list = getParentList(tree_list, source_ids[0])
  // console.log(JSON.stringify(source_parent_list))

  let source_nodes: ITreeNodeData[] = []
  while (true) {
    let idx = source_parent_list.findIndex((i) => source_ids.includes(i.id))
    if (idx === -1) break
    let node = source_parent_list.splice(idx, 1)[0]
    source_nodes.push(node)
  }

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
    target_node.children.splice(target_node.children.length, 0, ...source_nodes)
  } else if (where === 'before') {
    target_parent_list.splice(target_idx, 0, ...source_nodes)
  } else if (where === 'after') {
    target_parent_list.splice(target_idx + 1, 0, ...source_nodes)
  }

  return tree_list
}

export function getNodeById(tree_list: ITreeNodeData[], id: NodeIdType): ITreeNodeData | undefined {
  return flatten(tree_list).find((i) => i.id === id)
}

/**
 * a is child of b
 */
export function isChildOf(tree_list: ITreeNodeData[], a_id: NodeIdType, b_id: NodeIdType): boolean {
  if (a_id === b_id) return false

  let target_node = getNodeById(tree_list, b_id)
  if (!target_node || !Array.isArray(target_node.children)) return false

  return flatten(target_node.children).findIndex((i) => i.id === a_id) > -1
}

export function isSelfOrChild(item: ITreeNodeData, id: NodeIdType | null): boolean {
  if (!id) return false
  if (item.id === id) return true
  return flatten(item.children || []).findIndex((i) => i.id === id) > -1
}

export function objKeyMap(obj: IObj, key_maps: KeyMapType[], reversed: boolean = false): IObj {
  if (reversed) {
    key_maps = keyMapReverse(key_maps)
  }

  let keys = Object.keys(obj)
  let new_obj: IObj = {}

  keys.map((key) => {
    let map = key_maps.find((i) => i[0] === key)
    let value = obj[key]

    if (Array.isArray(value)) {
      value = treeKeyMap(value, key_maps)
    } else if (typeof value === 'object' && value) {
      value = objKeyMap(value, key_maps)
    }

    if (map) {
      new_obj[map[1]] = value
    } else {
      new_obj[key] = value
    }
  })

  return new_obj
}

export function treeKeyMap(
  tree_list: IObj[],
  key_maps: KeyMapType[],
  reversed: boolean = false,
): any[] {
  if (reversed) {
    key_maps = keyMapReverse(key_maps)
  }

  return tree_list.map((item) => objKeyMap(item, key_maps))
}

export function keyMapReverse(key_maps: KeyMapType[]): KeyMapType[] {
  return key_maps.map(([a, b]) => [b, a])
}

export function isParent(tree_list: ITreeNodeData[], item: ITreeNodeData, id: string): boolean {
  let parents = getParentList(tree_list, item.id)
  return parents.findIndex((i) => i.id === id) > -1
}

export function canBeSelected(
  tree_list: ITreeNodeData[],
  selected_ids: NodeIdType[],
  new_id: NodeIdType,
): boolean {
  let id_one = selected_ids[0]
  if (!id_one) return true

  if (
    tree_list.findIndex((i) => i.id === id_one) > -1 &&
    tree_list.findIndex((i) => i.id === new_id) > -1
  ) {
    return true
  }

  let flat = flatten(tree_list)
  let parent = flat.find((i) => i.children && i.children.findIndex((j) => j.id === id_one) > -1)
  if (!parent || !parent.children) {
    return false
  }

  return parent.children.findIndex((i) => i.id === new_id) > -1
}

export function selectTo(
  tree_list: ITreeNodeData[],
  selected_ids: NodeIdType[],
  new_id: NodeIdType,
): NodeIdType[] {
  if (!canBeSelected(tree_list, selected_ids, new_id)) {
    return selected_ids
  }

  let list: ITreeNodeData[]
  if (tree_list.findIndex((i) => i.id === new_id) > -1) {
    list = tree_list
  } else {
    let flat = flatten(tree_list)
    let parent = flat.find((i) => i.children && i.children.findIndex((j) => j.id === new_id) > -1)
    if (!parent || !parent.children) {
      return selected_ids
    }
    list = parent.children
  }

  let new_id_idx: number = -1
  let first_selected_idx: number = -1
  let last_selected_idx: number = -1
  list.map((i, idx) => {
    if (first_selected_idx < 0 && selected_ids.includes(i.id)) {
      first_selected_idx = idx
    }
    if (selected_ids.includes(i.id)) {
      last_selected_idx = idx
    }
    if (i.id === new_id) {
      new_id_idx = idx
    }
  })

  let from_idx: number = first_selected_idx
  let to_idx: number = last_selected_idx
  if (new_id_idx < first_selected_idx) {
    from_idx = new_id_idx
  } else {
    to_idx = new_id_idx
  }

  let new_selected_ids: NodeIdType[] = []
  for (let idx = from_idx; idx <= to_idx; idx++) {
    let item = list[idx]
    if (item.can_select !== false) {
      new_selected_ids.push(item.id)
    }
  }

  return new_selected_ids
}
