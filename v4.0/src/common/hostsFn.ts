/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { del } from '@main/core/config'
import { HostsDataType, HostsListObjectType } from '@root/common/data'
import lodash from 'lodash'

type PartHostsObjectType = Partial<HostsListObjectType> & { id: string }

export const flatten = (list: HostsListObjectType[]): HostsListObjectType[] => {
  let new_list: HostsListObjectType[] = []

  list.map(item => {
    new_list.push(item)
    if (item.children) {
      new_list = [...new_list, ...flatten(item.children)]
    }
  })

  return new_list
}

export const cleanHostsList = (data: HostsDataType): HostsDataType => {
  let list = flatten(data.list)

  list.map(item => {
    if (item.where === 'folder' && !Array.isArray(item.children)) {
      item.children = [] as HostsListObjectType[]
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

export const findItemById = (list: HostsListObjectType[], id: string): HostsListObjectType | undefined => {
  return flatten(list).find(item => item.id === id)
}

export const updateOneItem = (list: HostsListObjectType[], item: PartHostsObjectType): HostsListObjectType[] => {
  let new_list: HostsListObjectType[] = lodash.cloneDeep(list)

  let i = findItemById(new_list, item.id)
  if (i) {
    Object.assign(i, item)
  }

  return new_list
}

export const getContentOfHosts = (list: HostsListObjectType[], hosts: HostsListObjectType): string => {
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

export const getHostsOutput = (list: HostsListObjectType[]): string => {
  const content = flatten(list).filter(item => item.on).map(item => getContentOfHosts(list, item))
    .join('\n\n')

  // todo 去重

  return content
}

export const deleteItemById = (list: HostsListObjectType[], id: string) => {
  let idx = list.findIndex(item => item.id === id)
  if (idx >= 0) {
    list.splice(idx, 1)
    return
  }

  list.map(item => deleteItemById(item.children || [], id))
}

export const getNextSelectedItem = (list: HostsListObjectType[], id: string): HostsListObjectType | undefined => {
  let flat = flatten(list)
  let idx = flat.findIndex(item => item.id === id)

  return flat[idx + 1] || flat[idx - 1]
}
