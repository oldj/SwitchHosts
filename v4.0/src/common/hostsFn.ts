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
      new_list = [...new_list, ...flatten(item.children)]
    }
  })

  return new_list
}

export const cleanHostsList = (data: IHostsBasicData): IHostsBasicData => {
  let list = flatten(data.list)

  list.map(item => {
    if (item.where === 'folder' && !Array.isArray(item.children)) {
      item.children = [] as IHostsListObject[]
    }

    if (item.where === 'group' && !Array.isArray(item.include)) {
      item.include = [] as string[]
    }

    if (item.where === 'folder' || item.where === 'group') {
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

export const getContentOfHosts = (list: IHostsListObject[], hosts: IHostsListObject): string => {
  const { where } = hosts
  if (!where || where === 'local' || where === 'remote') {
    return hosts.content || ''
  }

  if (where === 'folder') {
    const items = flatten(hosts.children || [])

    return items.map(item => {
      return `# file: ${item.title}\n` + getContentOfHosts(list, item)
    }).join('\n\n')
  }

  if (where === 'group') {
    return (hosts.include || []).map(id => {
      let item = findItemById(list, id)
      if (!item) return ''

      return `# file: ${item.title}\n` + getContentOfHosts(list, item)
    }).join('\n\n')
  }

  return ''
}

export const getHostsOutput = (list: IHostsListObject[]): string => {
  const content = flatten(list).filter(item => item.on).map(item => getContentOfHosts(list, item))
    .join('\n\n')

  // todo 去重

  return content
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
