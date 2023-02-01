/**
 * getHistoryList
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import { ICommandRunResult } from '@common/data'

export default async (): Promise<ICommandRunResult[]> => {
  return await cfgdb.collection.cmd_history.all()
}
