/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { broadcast } from '@main/core/agent'
import { swhdb } from '@main/data'
import { IHostsListObject } from '@root/common/data'
import * as hostsFn from '@root/common/hostsFn'

export default async (id: string) => {
  let list: IHostsListObject[] = await swhdb.list.tree.all()

  let node = hostsFn.findItemById(list, id)
  if (!node) {
    console.error(`can't find node by id #${id}.`)
    return
  }

  if (node.on) {
    // current hosts is in use, update system hosts
    broadcast('toggle_item', node.id, false)
  }

  await swhdb.list.trashcan.push({
    data: {
      ...node,
      on: false,
    },
    add_time_ms: (new Date()).getTime(),
  })

  hostsFn.deleteItemById(list, id)

  await swhdb.list.tree.set(list)
}
