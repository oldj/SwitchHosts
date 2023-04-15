/**
 * importV3Data
 * @author: oldj
 * @homepage: https://oldj.net
 */

// import data from v3 to v4

import { swhdb } from '@main/data'
import { cleanHostsList, flatten } from '@common/hostsFn'
import version from '@/version.json'

export default async (old_data: any) => {
  old_data = cleanHostsList(old_data)

  await swhdb.collection.hosts.remove()
  await swhdb.list.tree.remove()

  let { list } = old_data
  let hosts = flatten(list)

  for (let h of hosts) {
    if (h.refresh_interval) {
      h.refresh_interval *= 3600
    }

    h.type = h.where
    delete h.where

    await swhdb.collection.hosts.insert(h)
    h.content = ''
  }

  await swhdb.list.tree.extend(...list)
  await swhdb.dict.meta.set('version', version)
}
