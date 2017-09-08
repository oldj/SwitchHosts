/**
 * kw
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

function kw2re (kw) {
  // 模糊搜索
  let r
  let m
  let flag = []

  if (kw === '/') {
    return
  } else if ((m = kw.match(/^\/([^\/]+)\/?(\w*)$/))) {
    if (m[2].indexOf('i') > -1) {
      flag.push('i')
    }
    // if (m[2].indexOf('g') > -1) {
    flag.push('g')
    // }
    try {
      r = new RegExp(m[1], flag.join(''))
    } catch (e) {
    }
  } else if (kw.indexOf('*') > -1) {
    try {
      r = new RegExp(kw.replace(/\*/g, '.*'), 'ig')
    } catch (e) {
    }
  }

  return r
}

exports.findPositions = function (kw, code) {
  if (!kw || kw === '/') return []

  let r = kw2re(kw)
  if (!r) {
    try {
      r = new RegExp(kw
          .replace(/([\.\?\*\+\^\$\(\)\-\[\]\{\}])/g, '\\$1')
        , 'ig')
    } catch (e) {
      console.log(e)
      return []
    }
  }
  let indexes = []

  let lines = code.split('\n')

  lines.map((ln, idx) => {
    let match
    let max_loop = 30
    while (match = r.exec(ln)) {
      indexes.push([
        {line: idx, ch: match.index},
        {line: idx, ch: match.index + match[0].length}
      ])
      max_loop--
      if (max_loop < 0) break
    }
  })

  return indexes
}

exports.kw2re = kw2re
