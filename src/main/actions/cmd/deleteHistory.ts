/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'

export default async (_id: string) => {
  return await cfgdb.collection.cmd_history.delete((i) => i._id === _id)
}
