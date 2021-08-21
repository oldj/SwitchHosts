/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getReplaceHistory from '@main/actions/find/getReplaceHistory'
import setReplaceHistory from '@main/actions/find/setReplaceHistory'

const MAX_LENGTH = 20

export default async (value: string) => {
  let history_all = await getReplaceHistory()

  // remove old
  history_all = history_all.filter((v) => v !== value)

  // insert new
  history_all.push(value)

  while (history_all.length > MAX_LENGTH) {
    history_all.shift()
  }

  await setReplaceHistory(history_all)

  return history_all
}
