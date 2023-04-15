/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList, setList } from '@main/actions'
import { swhdb } from '@main/data'
import { getNodeById } from '@common/tree'
import { IHostsListObject, ITrashcanListObject } from '@common/data'

export default async (id: string): Promise<boolean> => {
  let trashcan_item: ITrashcanListObject | undefined = await swhdb.list.trashcan.find(
    (i) => i.data.id === id,
  )

  if (!trashcan_item) {
    console.log(`can't find trashcan_item with id #${id}.`)
    return false
  }

  let hosts = trashcan_item.data
  if (!hosts || !hosts.id) {
    console.log(`bad trashcan_item!`)
    return false
  }

  let list = await getList()
  let { parent_id } = trashcan_item

  if (!parent_id) {
    await setList([...list, hosts])
  } else {
    let parent_hosts = getNodeById<IHostsListObject>(list, parent_id)
    if (!parent_hosts) {
      console.log(`can't find parent_hosts with id #${parent_id}.`)
      return false
    }

    parent_hosts.children = [...(parent_hosts.children || []), hosts]
    await setList(list)
  }

  await swhdb.list.trashcan.delete((i) => i.data.id === id)

  return true
}
