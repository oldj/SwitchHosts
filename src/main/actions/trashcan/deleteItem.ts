/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { ITrashcanListObject } from '@common/data'
import { flatten } from '@common/hostsFn'

export default async (id: string): Promise<boolean> => {
  // Permanently delete the specified item with id.

  let trashcan_item: ITrashcanListObject | undefined = await swhdb.list.trashcan.find(
    (i) => i.data.id === id,
  )

  if (!trashcan_item) {
    console.log(`can't find trashcan_item with id #${id}.`)
    return false
  }

  let ids: string[] = [id]
  flatten(trashcan_item.data.children || []).map((i) => ids.push(i.id))

  await swhdb.collection.hosts.delete((i) => ids.includes(i.id))
  await swhdb.list.tree.delete((i) => i.id === id)
  await swhdb.list.trashcan.delete((i) => i.data.id === id)

  return true
}
