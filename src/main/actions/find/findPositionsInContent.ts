/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IFindPosition } from '@common/types'

type MatchResult = Pick<
  IFindPosition,
  'start' | 'end' | 'before' | 'match' | 'after' | 'line' | 'line_pos' | 'end_line' | 'end_line_pos'
>

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

    let i_ln = i.split('\n')
    let end_line = line + i_ln.length - 1
    let end_line_pos = before.length + i.length
    if (i_ln.length > 1) {
      end_line_pos = i_ln[i_ln.length - 1].length
    }

    result_items.push({
      start,
      end: start + i.length,
      before,
      match: i,
      after,
      line,
      line_pos: before.length,
      end_line,
      end_line_pos,
    })

    start += i.length
  }

  return result_items
}
