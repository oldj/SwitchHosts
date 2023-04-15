/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsListObject } from '@common/data'

export default async (list: IHostsListObject[]) => {
  await swhdb.list.tree.set(list)
}
