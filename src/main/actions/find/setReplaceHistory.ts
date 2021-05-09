/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'

export default async (data: string[]) => {
  await cfgdb.list.replace_history.set(data)
}
