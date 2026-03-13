/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { describe, expect, it } from 'vitest'
import { default as findInContent } from '../../src/main/actions/find/findPositionsInContent'

describe('find in content test', () => {
  it('basic test 1', () => {
    const content = `abc12 abc123 abc`
    const matches = findInContent(content, /bc/ig)

    expect(matches).toHaveLength(3)
    expect(matches[0]).toMatchObject({
      line: 1,
      start: 1,
      end: 3,
      before: 'a',
      match: 'bc',
    })
    expect(matches[0].after).toEqual(expect.any(String))
    expect(matches[1]).toMatchObject({
      line: 1,
      start: 7,
      end: 9,
      before: 'abc12 a',
      match: 'bc',
      after: '123 abc',
    })
    expect(matches[2]).toMatchObject({
      line: 1,
      start: 14,
      end: 16,
      before: 'abc12 abc123 a',
      match: 'bc',
      after: '',
    })
  })

  it('basic test 2', () => {
    const content = `abc12 abc123 abc\nxyza3b`
    const matches = findInContent(content, /a\w*3/ig)

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({
      line: 1,
      start: 6,
      end: 12,
      before: 'abc12 ',
      match: 'abc123',
      after: ' abc',
    })
    expect(matches[1]).toMatchObject({
      line: 2,
      start: 20,
      end: 22,
      before: 'xyz',
      match: 'a3',
      after: 'b',
    })
  })
})
