/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { HostsContentObjectType, HostsListObjectType } from '@root/common/data'
import { findItemById, flatten } from '@root/common/hostsFn'

const getContentById = async (id: string) => {
  let hosts_content = await swhdb.collection.hosts.find<HostsContentObjectType>(i => i.id === id)
  return hosts_content?.content || ''
}

const getContentOfHosts = async (list: HostsListObjectType[], hosts: HostsListObjectType): Promise<string> => {
  const { where } = hosts
  if (!where || where === 'local' || where === 'remote') {
    return getContentById(hosts.id)
  }

  if (where === 'folder') {
    const items = flatten(hosts.children || [])

    let a = await Promise.all(items.map(async (item) => {
      return `# file: ${item.title}\n` + (await getContentOfHosts(list, item))
    }))
    return a.join('\n\n')
  }

  if (where === 'group') {
    let a = await Promise.all(hosts.include.map(async (id) => {
      let item = findItemById(list, id)
      if (!item) return ''

      return `# file: ${item.title}\n` + (await getContentOfHosts(list, item))
    }))
    return a.join('\n\n')
  }

  return ''
}

export default getContentOfHosts
