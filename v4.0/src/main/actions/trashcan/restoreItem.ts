/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { ITrashcanListObject } from '@root/common/data'

export default async (id: string): Promise<boolean> => {
  let trashcan_item: ITrashcanListObject = await swhdb.list.trashcan.find(i => i.data.id === id)

  if (!trashcan_item) {
    console.log(`can't find trashcan_item with id #${id}.`)
    return false
  }

  await swhdb.list.tree.push(trashcan_item.data || {})
  await swhdb.list.trashcan.delete(i => i.data.id === id)

  return true
}
