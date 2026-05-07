/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { FolderModeType, IHostsBasicData, IHostsListObject } from '@common/data'
import lodash from 'lodash'

type PartHostsObjectType = Partial<IHostsListObject> & { id: string }

type Predicate = (obj: IHostsListObject) => boolean

export const flatten = (list: IHostsListObject[]): IHostsListObject[] => {
  let newList: IHostsListObject[] = []

  list.map((item) => {
    newList.push(item)
    if (item.children) {
      newList = [...newList, ...flatten(item.children)]
    }
  })

  return newList
}

export const cleanHostsList = (data: IHostsBasicData): IHostsBasicData => {
  const list = flatten(data.list)

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
  const newList: IHostsListObject[] = lodash.cloneDeep(list)

  const i = findItemById(newList, item.id)
  if (i) {
    Object.assign(i, item)
  }

  return newList
}

const isInTopLevel = (list: IHostsListObject[], id: string): boolean => {
  return list.findIndex((i) => i.id === id) > -1
}

export const setOnStateOfItem = (
  list: IHostsListObject[],
  id: string,
  on: boolean,
  defaultChoiceMode: FolderModeType = 0,
  multiChoseFolderSwitchAll: boolean = false,
): IHostsListObject[] => {
  const newList: IHostsListObject[] = lodash.cloneDeep(list)

  let item = findItemById(newList, id)
  if (!item) return newList

  item.on = on

  const itemIsInTopLevel = isInTopLevel(list, id)
  if (multiChoseFolderSwitchAll) {
    item = switchFolderChild(item, on)
    if (!itemIsInTopLevel) switchItemParentIsON(newList, item, on)
  }

  if (!on) {
    return newList
  }

  if (itemIsInTopLevel) {
    if (defaultChoiceMode === 1) {
      newList.map((item) => {
        if (item.id !== id) {
          item.on = false
          if (multiChoseFolderSwitchAll) {
            switchFolderChild(item, false)
          }
        }
      })
    }
  } else {
    const parent = getParentOfItem(newList, id)
    if (parent) {
      const folderMode = parent.folder_mode || defaultChoiceMode
      if (folderMode === 1 && parent.children) {
        // 单选模式
        parent.children.map((item) => {
          if (item.id !== id) {
            item.on = false
            if (multiChoseFolderSwitchAll) {
              switchFolderChild(item, false)
            }
          }
        })
      }
    }
  }

  return newList
}

export const switchItemParentIsON = (
  list: IHostsListObject[],
  item: IHostsListObject,
  on: boolean,
) => {
  const parent = getParentOfItem(list, item.id)

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

    const itemIsInTopLevel = isInTopLevel(list, parent.id)
    if (!itemIsInTopLevel) {
      switchItemParentIsON(list, parent, on)
    }
  }
}

export const switchFolderChild = (item: IHostsListObject, on: boolean): IHostsListObject => {
  if (item.type != 'folder') {
    return item
  }
  const folderMode = item.folder_mode
  if (folderMode === 1) {
    return item
  }

  if (item.children) {
    item.children.forEach((item) => {
      item.on = on
      if (item.type == 'folder') {
        switchFolderChild(item, on)
      }
    })
  }

  return item
}

export const deleteItemById = (list: IHostsListObject[], id: string) => {
  const idx = list.findIndex((item) => item.id === id)
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
  const flat = flatten(tree)
  let idx1 = -1
  let idx2 = -1

  flat.map((i, idx) => {
    if (predicate(i)) {
      if (idx1 === -1) {
        idx1 = idx
      }
      idx2 = idx
    }
  })

  return flat[idx2 + 1] || flat[idx1 - 1]
}

export const getParentOfItem = (
  list: IHostsListObject[],
  itemId: string,
): IHostsListObject | undefined => {
  if (list.find((i) => i.id === itemId)) {
    // is in the top level
    return
  }

  const flat = flatten(list)
  for (const p of flat) {
    if (p.children && p.children.find((i) => i.id === itemId)) {
      return p
    }
  }
}
