/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { HostsListObjectType } from '@root/common/data'
import * as hostsFn from '@root/common/hostsFn'

export default async (id: string) => {
  let list: HostsListObjectType[] = await swhdb.list.tree.all()

  let cnt = await swhdb.collection.hosts.find<HostsListObjectType>(i => i.id === id)
  if (cnt && cnt._id) {
    await swhdb.collection.hosts.delete(cnt._id)
  }

  hostsFn.deleteItemById(list, id)

  await swhdb.list.tree.set(list)
}
