/**
 * getHistoryList
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsHistoryObject } from '@common/data'

export default async (): Promise<IHostsHistoryObject[]> => {
  let list = await swhdb.collection.history.all<IHostsHistoryObject>()

  list = list.map((item) => {
    item.content = item.content || ''
    return item
  })

  return list
}
