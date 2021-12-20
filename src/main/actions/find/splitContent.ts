/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IFindPosition, IFindSplitter } from '@root/common/types'

type MatchResult = Pick<IFindPosition, 'start' | 'end' | 'match'> & {
  [key: string]: any
}

export default (
  content: string,
  find_results: MatchResult[],
): IFindSplitter[] => {
  let spliters: IFindSplitter[] = []

  let last_end = 0
  find_results.map((r, idx) => {
    let { start, match } = r
    let before = content.slice(last_end, start)
    let after = ''

    last_end += before.length + match.length
    if (idx === find_results.length - 1) {
      after = content.slice(last_end)
    }

    let spliter: IFindSplitter = {
      before,
      after,
      match,
    }

    spliters.push(spliter)
  })

  return spliters
}
