/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'

export interface IFindHistoryData {
  value: string
  is_regexp: boolean
  is_ignore_case: boolean
}

export default async (data: IFindHistoryData[]) => {
  await cfgdb.list.find_history.set(data)
}
