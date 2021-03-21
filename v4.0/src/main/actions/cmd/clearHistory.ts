/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'

export default async () => {
  return await cfgdb.collection.cmd_history.remove()
}
