/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsContentObject } from '@common/data'

export default async (id: string, content: string) => {
  let d = await swhdb.collection.hosts.find<IHostsContentObject>((i) => i.id === id)
  if (!d || !d._id) {
    await swhdb.collection.hosts.insert({ id, content })
  } else {
    await swhdb.collection.hosts.update((i) => i._id === d?._id, { content })
  }
}
