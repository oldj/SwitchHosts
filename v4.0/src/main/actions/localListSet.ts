/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { HostsListObjectType } from '@root/common/data'

export default async (list: HostsListObjectType[]) => {
  await swhdb.list.tree.set(list)
}
