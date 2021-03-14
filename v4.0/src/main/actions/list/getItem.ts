/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsListObject } from '@root/common/data'
import { findItemById } from '@root/common/hostsFn'

export default async (id: string): Promise<IHostsListObject | undefined> => {
  let list = await swhdb.list.tree.all()
  return findItemById(list, id)
}
