/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { default as findInContent } from 'src/main/actions/find/findPositionsInContent'

describe('find in content test', () => {
  it('basic test 1', () => {
    let content = `abc12 abc123 abc`
    let m = findInContent(content, /bc/ig)
    assert(m.length === 3)
    assert(m[0].line === 1)
    assert(m[0].start === 1)
    assert(m[0].end === 3)
    assert(m[0].before === 'a')
    assert(m[0].match === 'bc')
    assert(typeof m[0].after === 'string')

    assert(m[1].line === 1)
    assert(m[1].start === 7)
    assert(m[1].end === 9)
    assert(m[1].before === 'abc12 a')
    assert(m[1].match === 'bc')
    assert(m[1].after === '123 abc')

    assert(m[2].line === 1)
    assert(m[2].start === 14)
    assert(m[2].end === 16)
    assert(m[2].before === 'abc12 abc123 a')
    assert(m[2].match === 'bc')
    assert(m[2].after === '')
  })

  it('basic test 2', () => {
    let content = `abc12 abc123 abc\nxyza3b`
    let m = findInContent(content, /a\w*3/ig)
    // console.log(m)
    assert(m.length === 2)
    assert(m[0].line === 1)
    assert(m[0].start === 6)
    assert(m[0].end === 12)
    assert(m[0].before === 'abc12 ')
    assert(m[0].match === 'abc123')
    assert(m[0].after === ' abc')

    assert(m[1].line === 2)
    assert(m[1].start === 20)
    assert(m[1].end === 22)
    assert(m[1].before === 'xyz')
    assert(m[1].match === 'a3')
    assert(m[1].after === 'b')
  })
})
