/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsListObject } from '@root/common/data'
import * as hostsFn from '@root/common/hostsFn'

export default async (id: string) => {
  let list: IHostsListObject[] = await swhdb.list.tree.all()

  let node = hostsFn.findItemById(list, id)
  await swhdb.collection.trash.insert({
    data: node,
    add_time_ms: (new Date()).getTime(),
  })

  hostsFn.deleteItemById(list, id)

  await swhdb.list.tree.set(list)
}
