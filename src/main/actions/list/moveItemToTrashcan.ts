/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { swhdb } from '@main/data'
import { IHostsListObject, ITrashcanObject } from '@common/data'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'

export default async (id: string) => {
  let list: IHostsListObject[] = await getList()

  let node = hostsFn.findItemById(list, id)
  if (!node) {
    console.error(`can't find node by id #${id}.`)
    return
  }

  if (node.on) {
    // current hosts is in use, update system hosts
    broadcast(events.toggle_item, node.id, false)
  }

  let obj: ITrashcanObject = {
    data: {
      ...node,
      on: false,
    },
    add_time_ms: new Date().getTime(),
    parent_id: hostsFn.getParentOfItem(list, id)?.id || null,
  }

  await swhdb.list.trashcan.push(obj)

  hostsFn.deleteItemById(list, id)
  await swhdb.list.tree.set(list)
}
