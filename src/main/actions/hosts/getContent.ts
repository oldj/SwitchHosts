/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet, getItemFromList, getList } from '@main/actions'
import { swhdb } from '@main/data'
import { IHostsContentObject } from '@common/data'
import { findItemById, flatten } from '@common/hostsFn'

const getContentById = async (id: string) => {
  let hosts_content = await swhdb.collection.hosts.find<IHostsContentObject>((i) => i.id === id)
  return hosts_content?.content || ''
}

const getContentOfHosts = async (id: string): Promise<string> => {
  let hosts = await getItemFromList(id)
  if (!hosts) {
    return await getContentById(id)
  }

  const { type } = hosts
  if (!type || type === 'local' || type === 'remote') {
    return await getContentById(id)
  }

  let list = await getList()

  let multi_chose_folder_switch_all = await configGet('multi_chose_folder_switch_all')
  let isSkipFolder = multi_chose_folder_switch_all && hosts.folder_mode !== 1

  if (type === 'folder' && !isSkipFolder) {
    const items = flatten(hosts.children || [])

    let a = await Promise.all(
      items.map(async (item) => {
        return `# file: ${item.title}\n` + (await getContentOfHosts(item.id))
      }),
    )
    return a.join('\n\n')
  }

  if (type === 'group') {
    let a = await Promise.all(
      (hosts.include || []).map(async (id) => {
        let item = findItemById(list, id)
        if (!item) return ''

        return `# file: ${item.title}\n` + (await getContentOfHosts(id))
      }),
    )
    return a.join('\n\n')
  }

  return ''
}

export default getContentOfHosts
