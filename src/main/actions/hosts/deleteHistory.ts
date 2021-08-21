/**
 * removeHistory
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'

export default async (id: string) => {
  console.log('delete history #' + id)
  await swhdb.collection.history.delete((item) => item.id === id)
}
