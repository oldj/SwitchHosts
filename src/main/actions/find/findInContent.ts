/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IFindResultItem } from '@root/common/types'

type MatchResult = Pick<IFindResultItem, 'line' | 'start' | 'end' | 'before' | 'match' | 'after'>

export default (content: string, exp: RegExp): MatchResult[] => {
  let result_items: MatchResult[] = []

  let m = content.match(exp)
  if (!m) {
    return []
  }

  let line = 1
  let start = 0

  let cnt = content
  for (let i of m) {
    let idx = cnt.indexOf(i)
    if (idx === -1) continue

    let head = cnt.slice(0, idx)
    cnt = cnt.slice(idx + i.length)

    let head_lines = head.split('\n')
    line += head_lines.length - 1
    start += head.length
    let before_lines = content.slice(0, start).split('\n')
    let before = before_lines[before_lines.length - 1]
    let after = cnt.split('\n')[0]

    result_items.push({
      line,
      start,
      end: start + i.length,
      before,
      match: i,
      after,
    })

    start += i.length
  }

  return result_items
}
