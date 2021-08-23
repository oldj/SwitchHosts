export type NodeIdType = string

export interface ITreeNodeData {
  id: NodeIdType
  title?: string
  can_select?: boolean // 是否可以被选中，默认为 true
  can_drag?: boolean // 是否可以拖动，默认为 true
  can_drop_before?: boolean // 是否可以接受 drop before，默认为 true
  can_drop_in?: boolean // 是否可以接受 drop in，默认为 true
  can_drop_after?: boolean // 是否可以接受 drop after，默认为 true
  is_collapsed?: boolean
  children?: ITreeNodeData[]

  [key: string]: any
}

interface IWithChildren {
  children?: IWithChildren[]
}

export function flatten<T extends IWithChildren>(tree_list: T[]): T[] {
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

interface IWidthId extends IWithChildren {
  id: string
}

export function getNodeById<T extends IWidthId>(
  tree_list: T[],
  id: string,
): T | undefined {
  return flatten(tree_list).find((i) => i.id === id)
}
