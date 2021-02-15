/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'

export default async (id: string, content: string) => {
  let d = await swhdb.collection.hosts.find(i => i.id === id)
  if (!d || !d._id) {
    await swhdb.collection.hosts.insert({ id, content })
  } else {
    await swhdb.collection.hosts.update(d._id, { content })
  }
}
