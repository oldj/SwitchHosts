/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsDataType, HostsObjectType } from '@root/common/data'
import lodash from 'lodash'

type PartHostsObjectType = Partial<HostsObjectType> & { id: string }

export const flatten = (list: HostsObjectType[]): HostsObjectType[] => {
  let new_list: HostsObjectType[] = []

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
      item.children = [] as HostsObjectType[]
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

export const findItemById = (list: HostsObjectType[], id: string): HostsObjectType | undefined => {
  return flatten(list).find(item => item.id === id)
}

export const updateOneItem = (list: HostsObjectType[], item: PartHostsObjectType): HostsObjectType[] => {
  let new_list: HostsObjectType[] = lodash.cloneDeep(list)

  let i = findItemById(new_list, item.id)
  if (i) {
    Object.assign(i, item)
  }

  return new_list
}

export const getContentOfHosts = (list: HostsObjectType[], hosts: HostsObjectType): string => {
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
    return hosts.include.map(id => {
      let item = findItemById(list, id)
      if (!item) return ''

      return `# file: ${item.title}\n` + getContentOfHosts(list, item)
    }).join('\n\n')
  }

  return ''
}

export const getHostsOutput = (list: HostsObjectType[]): string => {
  const content = flatten(list).filter(item => item.on).map(item => getContentOfHosts(list, item))
    .join('\n\n')

  // 去重

  return content
}
