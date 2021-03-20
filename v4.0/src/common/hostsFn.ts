/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsBasicData, IHostsListObject } from '@root/common/data'
import lodash from 'lodash'

type PartHostsObjectType = Partial<IHostsListObject> & { id: string }

export const flatten = (list: IHostsListObject[]): IHostsListObject[] => {
  let new_list: IHostsListObject[] = []

  list.map(item => {
    new_list.push(item)
    if (item.children) {
      new_list = [ ...new_list, ...flatten(item.children) ]
    }
  })

  return new_list
}

export const cleanHostsList = (data: IHostsBasicData): IHostsBasicData => {
  let list = flatten(data.list)

  list.map(item => {
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

export const findItemById = (list: IHostsListObject[], id: string): IHostsListObject | undefined => {
  return flatten(list).find(item => item.id === id)
}

export const updateOneItem = (list: IHostsListObject[], item: PartHostsObjectType): IHostsListObject[] => {
  let new_list: IHostsListObject[] = lodash.cloneDeep(list)

  let i = findItemById(new_list, item.id)
  if (i) {
    Object.assign(i, item)
  }

  return new_list
}

export const deleteItemById = (list: IHostsListObject[], id: string) => {
  let idx = list.findIndex(item => item.id === id)
  if (idx >= 0) {
    list.splice(idx, 1)
    return
  }

  list.map(item => deleteItemById(item.children || [], id))
}

export const getNextSelectedItem = (list: IHostsListObject[], id: string): IHostsListObject | undefined => {
  let flat = flatten(list)
  let idx = flat.findIndex(item => item.id === id)

  return flat[idx + 1] || flat[idx - 1]
}

export const getParentOfItem = (list: IHostsListObject[], item_id: string): IHostsListObject | undefined => {
  if (list.find(i => i.id === item_id)) {
    // is in the top level
    return
  }

  let flat = flatten(list)
  for (let h of flat) {
    if (h.children && h.children.find(i => i.id === item_id)) {
      return h
    }
  }
}
