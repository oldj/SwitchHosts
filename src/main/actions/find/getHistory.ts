/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IFindHistoryData } from '@main/actions/find/setHistory'
import { cfgdb } from '@main/data'

export default async (): Promise<IFindHistoryData[]> => {
  return (await cfgdb.list.find_history.all()) as IFindHistoryData[]
}
