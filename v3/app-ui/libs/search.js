/**
 * search
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

export function getNextPos (pos, cursor) {
  let {ch, line} = cursor

  let mm = 1e10
  let target_ch = mm
  let target_line = mm
  let target_pos = null

  pos.map(p => {
    let p_ch = p[0].ch
    let p_line = p[0].line
    if (p_line < line) return
    if (p_line === line && p_ch < ch) return

    if ((p_line < target_line) || (p_line === target_line && p_ch < target_ch)) {
      target_line = p_line
      target_ch = p_ch

      target_pos = p
    }
  })

  return target_pos
}

export function getPreviousPos (pos, cursor) {
  let {ch, line} = cursor

  let target_ch = 0
  let target_line = 0
  let target_pos = null

  pos.map(p => {
    let p_ch = p[1].ch
    let p_line = p[1].line
    if (p_line > line) return
    if (p_line === line && p_ch >= ch) return

    if ((p_line > target_line) || (p_line === target_line && p_ch > target_ch)) {
      target_line = p_line
      target_ch = p_ch

      target_pos = p
    }
  })

  return target_pos
}
