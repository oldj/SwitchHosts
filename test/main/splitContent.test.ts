/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { describe, expect, it } from 'vitest'
import { default as findInContent } from '../../src/main/actions/find/findPositionsInContent'
import { default as splitContent } from '../../src/main/actions/find/splitContent'

describe('split content test', () => {
  it('basic test 1', () => {
    const content = `abc12 abc123 abc44`
    const matches = findInContent(content, /bc/ig)
    const parts = splitContent(content, matches)

    expect(parts[0]).toMatchObject({ before: 'a', after: '' })
    expect(parts[1]).toMatchObject({ before: '12 a', after: '' })
    expect(parts[2]).toMatchObject({ before: '123 a', after: '44' })

    const rebuilt = parts.map((item) => `${item.before}${item.match}${item.after}`).join('')
    expect(rebuilt).toBe(content)
  })
})
