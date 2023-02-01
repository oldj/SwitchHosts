/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { FolderModeType, IHostsBasicData, IHostsListObject } from '@common/data'
import lodash from 'lodash'

type PartHostsObjectType = Partial<IHostsListObject> & { id: string }

type Predicate = (obj: IHostsListObject) => boolean

export const flatten = (list: IHostsListObject[]): IHostsListObject[] => {
  let new_list: IHostsListObject[] = []

  list.map((item) => {
    new_list.push(item)
    if (item.children) {
      new_list = [...new_list, ...flatten(item.children)]
    }
  })

  return new_list
}

export const cleanHostsList = (data: IHostsBasicData): IHostsBasicData => {
  let list = flatten(data.list)

  list.map((item) => {
    if (item.type === 'folder' && !Array.isArray(item.children)) {
      item.children = [] as IHostsListObject[]
    }

    if (item.type === 'group' && !Array.isArray(item.include)) {
      item.include = [] as string[]
    }

    if (item.type === 'folder' || item.type === 'group') {
      item.content = ''
    }
  })

  return data
}

export const findItemById = (
  list: IHostsListObject[],
  id: string,
): IHostsListObject | undefined => {
  return flatten(list).find((item) => item.id === id)
}

export const updateOneItem = (
  list: IHostsListObject[],
  item: PartHostsObjectType,
): IHostsListObject[] => {
  let new_list: IHostsListObject[] = lodash.cloneDeep(list)

  let i = findItemById(new_list, item.id)
  if (i) {
    Object.assign(i, item)
  }

  return new_list
}

const isInTopLevel = (list: IHostsListObject[], id: string): boolean => {
  return list.findIndex((i) => i.id === id) > -1
}

export const setOnStateOfItem = (
  list: IHostsListObject[],
  id: string,
  on: boolean,
  default_choice_mode: FolderModeType = 0,
  multi_chose_folder_switch_all: boolean = false,
): IHostsListObject[] => {
  let new_list: IHostsListObject[] = lodash.cloneDeep(list)

  let item = findItemById(new_list, id)
  if (!item) return new_list

  item.on = on

  let itemIsInTopLevel = isInTopLevel(list, id)
  if (multi_chose_folder_switch_all) {
    item = switchFolderChild(item, on)
    !itemIsInTopLevel && switchItemParentIsON(new_list, item, on)
  }

  if (!on) {
    return new_list
  }

  if (itemIsInTopLevel) {
    if (default_choice_mode === 1) {
      new_list.map((item) => {
        if (item.id !== id) {
          item.on = false
          if (multi_chose_folder_switch_all) {
            item = switchFolderChild(item, false)
          }
        }
      })
    }
  } else {
    let parent = getParentOfItem(new_list, id)
    if (parent) {
      let folder_mode = parent.folder_mode || default_choice_mode
      if (folder_mode === 1 && parent.children) {
        // 单选模式
        parent.children.map((item) => {
          if (item.id !== id) {
            item.on = false
            if (multi_chose_folder_switch_all) {
              item = switchFolderChild(item, false)
            }
          }
        })
      }
    }
  }

  return new_list
}

export const switchItemParentIsON = (
  list: IHostsListObject[],
  item: IHostsListObject,
  on: boolean,
) => {
  let parent = getParentOfItem(list, item.id)

  if (parent) {
    if (parent.folder_mode === 1) {
      return
    }
    if (!on) {
      parent.on = on
    } else if (parent.children) {
      let parentOn = true
      parent.children.forEach((item) => {
        if (!item.on) {
          parentOn = false
        }
      })
      parent.on = parentOn
    }

    let itemIsInTopLevel = isInTopLevel(list, parent.id)
    if (!itemIsInTopLevel) {
      switchItemParentIsON(list, parent, on)
    }
  }
}

export const switchFolderChild = (item: IHostsListObject, on: boolean): IHostsListObject => {
  if (item.type != 'folder') {
    return item
  }
  let folder_mode = item.folder_mode
  if (folder_mode === 1) {
    return item
  }

  if (item.children) {
    item.children.forEach((item) => {
      item.on = on
      if (item.type == 'folder') {
        item = switchFolderChild(item, on)
      }
    })
  }

  return item
}

export const deleteItemById = (list: IHostsListObject[], id: string) => {
  let idx = list.findIndex((item) => item.id === id)
  if (idx >= 0) {
    list.splice(idx, 1)
    return
  }

  list.map((item) => deleteItemById(item.children || [], id))
}

// export const getNextSelectedItem = (list: IHostsListObject[], id: string): IHostsListObject | undefined => {
//   let flat = flatten(list)
//   let idx = flat.findIndex(item => item.id === id)
//
//   return flat[idx + 1] || flat[idx - 1]
// }

export const getNextSelectedItem = (
  tree: IHostsListObject[],
  predicate: Predicate,
): IHostsListObject | undefined => {
  let flat = flatten(tree)
  let idx_1 = -1
  let idx_2 = -1

  flat.map((i, idx) => {
    if (predicate(i)) {
      if (idx_1 === -1) {
        idx_1 = idx
      }
      idx_2 = idx
    }
  })

  return flat[idx_2 + 1] || flat[idx_1 - 1]
}

export const getParentOfItem = (
  list: IHostsListObject[],
  item_id: string,
): IHostsListObject | undefined => {
  if (list.find((i) => i.id === item_id)) {
    // is in the top level
    return
  }

  let flat = flatten(list)
  for (let p of flat) {
    if (p.children && p.children.find((i) => i.id === item_id)) {
      return p
    }
  }
}
