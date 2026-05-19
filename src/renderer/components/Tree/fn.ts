import { ITreeNodeData, NodeIdType } from '@common/tree'
import lodash from 'lodash'
import { DropWhereType } from './Tree'

interface IObj {
  [key: string]: any
}

export type KeyMapType = [string, string]

export function flatten(treeList: ITreeNodeData[]): ITreeNodeData[] {
  let arr: any[] = []

  if (Array.isArray(treeList)) {
    treeList.map((item) => {
      if (!item) return

      arr.push(item)

      if (Array.isArray(item.children)) {
        const a2 = flatten(item.children)
        arr = arr.concat(a2)
      }
    })
  }

  return arr
}

export function getParentList(treeList: ITreeNodeData[], id: NodeIdType): ITreeNodeData[] {
  if (treeList.findIndex((i) => i.id === id) > -1) {
    return treeList
  }

  const flat = flatten(treeList)
  for (const node of flat) {
    if (Array.isArray(node.children) && node.children.findIndex((i) => i.id === id) > -1) {
      return node.children
    }
  }

  return treeList
}

export const treeMoveNode = (
  treeList: ITreeNodeData[],
  sourceIds: NodeIdType[],
  targetId: NodeIdType,
  where: DropWhereType,
): ITreeNodeData[] | null => {
  treeList = lodash.cloneDeep(treeList)

  if (sourceIds.includes(targetId)) return null

  // console.log(JSON.stringify(treeList))
  const sourceParentList = getParentList(treeList, sourceIds[0])
  // console.log(JSON.stringify(sourceParentList))

  const sourceNodes: ITreeNodeData[] = []
  while (true) {
    const idx = sourceParentList.findIndex((i) => sourceIds.includes(i.id))
    if (idx === -1) break
    const node = sourceParentList.splice(idx, 1)[0]
    sourceNodes.push(node)
  }

  const targetParentList = getParentList(treeList, targetId)
  const targetIdx = targetParentList.findIndex((i) => i.id === targetId)
  if (targetIdx === -1) {
    // console.log('targetIdx === -1')
    return null
  }

  if (where === 'in') {
    const targetNode = targetParentList[targetIdx]
    if (!Array.isArray(targetNode.children)) {
      targetNode.children = []
    }
    targetNode.children.splice(targetNode.children.length, 0, ...sourceNodes)
  } else if (where === 'before') {
    targetParentList.splice(targetIdx, 0, ...sourceNodes)
  } else if (where === 'after') {
    targetParentList.splice(targetIdx + 1, 0, ...sourceNodes)
  }

  return treeList
}

export function getNodeById(treeList: ITreeNodeData[], id: NodeIdType): ITreeNodeData | undefined {
  return flatten(treeList).find((i) => i.id === id)
}

/**
 * a is child of b
 */
export function isChildOf(treeList: ITreeNodeData[], aId: NodeIdType, bId: NodeIdType): boolean {
  if (aId === bId) return false

  const targetNode = getNodeById(treeList, bId)
  if (!targetNode || !Array.isArray(targetNode.children)) return false

  return flatten(targetNode.children).findIndex((i) => i.id === aId) > -1
}

export function isSelfOrChild(item: ITreeNodeData, id: NodeIdType | null): boolean {
  if (!id) return false
  if (item.id === id) return true
  return flatten(item.children || []).findIndex((i) => i.id === id) > -1
}

export function objKeyMap(obj: IObj, keyMaps: KeyMapType[], reversed: boolean = false): IObj {
  if (reversed) {
    keyMaps = keyMapReverse(keyMaps)
  }

  const keys = Object.keys(obj)
  const newObj: IObj = {}

  keys.map((key) => {
    const map = keyMaps.find((i) => i[0] === key)
    let value = obj[key]

    if (Array.isArray(value)) {
      value = treeKeyMap(value, keyMaps)
    } else if (typeof value === 'object' && value) {
      value = objKeyMap(value, keyMaps)
    }

    if (map) {
      newObj[map[1]] = value
    } else {
      newObj[key] = value
    }
  })

  return newObj
}

export function treeKeyMap(
  treeList: IObj[],
  keyMaps: KeyMapType[],
  reversed: boolean = false,
): any[] {
  if (reversed) {
    keyMaps = keyMapReverse(keyMaps)
  }

  return treeList.map((item) => objKeyMap(item, keyMaps))
}

export function keyMapReverse(keyMaps: KeyMapType[]): KeyMapType[] {
  return keyMaps.map(([a, b]) => [b, a])
}

export function isParent(treeList: ITreeNodeData[], item: ITreeNodeData, id: string): boolean {
  const parents = getParentList(treeList, item.id)
  return parents.findIndex((i) => i.id === id) > -1
}

export function canBeSelected(
  treeList: ITreeNodeData[],
  selectedIds: NodeIdType[],
  newId: NodeIdType,
): boolean {
  const idOne = selectedIds[0]
  if (!idOne) return true

  if (
    treeList.findIndex((i) => i.id === idOne) > -1 &&
    treeList.findIndex((i) => i.id === newId) > -1
  ) {
    return true
  }

  const flat = flatten(treeList)
  const parent = flat.find((i) => i.children && i.children.findIndex((j) => j.id === idOne) > -1)
  if (!parent || !parent.children) {
    return false
  }

  return parent.children.findIndex((i) => i.id === newId) > -1
}

export function selectTo(
  treeList: ITreeNodeData[],
  selectedIds: NodeIdType[],
  newId: NodeIdType,
): NodeIdType[] {
  if (!canBeSelected(treeList, selectedIds, newId)) {
    return selectedIds
  }

  let list: ITreeNodeData[]
  if (treeList.findIndex((i) => i.id === newId) > -1) {
    list = treeList
  } else {
    const flat = flatten(treeList)
    const parent = flat.find((i) => i.children && i.children.findIndex((j) => j.id === newId) > -1)
    if (!parent || !parent.children) {
      return selectedIds
    }
    list = parent.children
  }

  let newIdIdx: number = -1
  let firstSelectedIdx: number = -1
  let lastSelectedIdx: number = -1
  list.map((i, idx) => {
    if (firstSelectedIdx < 0 && selectedIds.includes(i.id)) {
      firstSelectedIdx = idx
    }
    if (selectedIds.includes(i.id)) {
      lastSelectedIdx = idx
    }
    if (i.id === newId) {
      newIdIdx = idx
    }
  })

  let fromIdx: number = firstSelectedIdx
  let toIdx: number = lastSelectedIdx
  if (newIdIdx < firstSelectedIdx) {
    fromIdx = newIdIdx
  } else {
    toIdx = newIdIdx
  }

  const newSelectedIds: NodeIdType[] = []
  for (let idx = fromIdx; idx <= toIdx; idx++) {
    const item = list[idx]
    if (item.can_select !== false) {
      newSelectedIds.push(item.id)
    }
  }

  return newSelectedIds
}
