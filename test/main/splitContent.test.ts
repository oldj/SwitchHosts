/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { default as findInContent } from 'src/main/actions/find/findPositionsInContent'
import { default as splitContent } from 'src/main/actions/find/splitContent'

describe('split content test', () => {
  it('basic test 1', () => {
    let content = `abc12 abc123 abc44`
    let m = findInContent(content, /bc/ig)
    let sp = splitContent(content, m)
    assert(sp[0].before === 'a')
    assert(sp[0].after === '')
    assert(sp[1].before === '12 a')
    assert(sp[1].after === '')
    assert(sp[2].before === '123 a')
    assert(sp[2].after === '44')

    let r = sp.map(i => `${i.before}${i.match}${i.after}`).join('')
    assert(r === content)
  })
})
