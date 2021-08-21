/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getHistory from '@main/actions/find/getHistory'
import setHistory, { IFindHistoryData } from '@main/actions/find/setHistory'

const MAX_LENGTH = 20

export default async (data: IFindHistoryData) => {
  let history_all = await getHistory()

  // remove old
  history_all = history_all.filter((i) => i.value !== data.value)

  // insert new
  history_all.push(data)

  while (history_all.length > MAX_LENGTH) {
    history_all.shift()
  }

  await setHistory(history_all)

  return history_all
}
