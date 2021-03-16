/**
 * getHistoryList
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsHistoryObject } from '@root/common/data'

export default async (): Promise<IHostsHistoryObject[]> => {
  return await swhdb.collection.history.all()
}
