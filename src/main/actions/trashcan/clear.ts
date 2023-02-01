/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { flatten } from '@common/hostsFn'

export default async () => {
  let trashcan_items = await swhdb.list.trashcan.all()

  let ids: string[] = []
  trashcan_items.map((i) => {
    ids.push(i.data.id)
    flatten(i.data.children || []).map((i) => ids.push(i.id))
  })

  await swhdb.collection.hosts.delete((i) => ids.includes(i.id))
  await swhdb.list.tree.delete((i) => ids.includes(i.id))
  await swhdb.list.trashcan.remove()

  return true
}
