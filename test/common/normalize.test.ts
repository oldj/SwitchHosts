/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import normalize, { parseLine } from '../../src/common/normalize'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const mock_dir = path.join(dirname, 'mock')

describe('normalize test', () => {
  const loadData = async (fn: string) => {
    return fs.readFile(path.join(mock_dir, fn), 'utf-8')
  }

  it('basic test', () => {
    expect(normalize('aaa')).toBe('aaa')
  })

  it('paresLine test', () => {
    let d = parseLine('1.2.3.4 abc.com')
    expect(d.ip).toBe('1.2.3.4')
    expect(d.domains).toEqual([ 'abc.com' ])
    expect(d.comment).toBe('')

    d = parseLine('1.2.3.4  \t abc.com abc2.com  abc3.com\ttest.com  ')
    expect(d.ip).toBe('1.2.3.4')
    expect(d.domains).toEqual([ 'abc.com', 'abc2.com', 'abc3.com', 'test.com' ])
    expect(d.comment).toBe('')

    d = parseLine('1.2.3.4  \t abc.com abc2.com  abc3.com\ttest.com  # this is comment ')
    expect(d.ip).toBe('1.2.3.4')
    expect(d.domains).toEqual([ 'abc.com', 'abc2.com', 'abc3.com', 'test.com' ])
    expect(d.comment).toBe('this is comment')

    d = parseLine('1.2.3.4  \t  # this is comment ')
    expect(d.ip).toBe('1.2.3.4')
    expect(d.domains).toEqual([])
    expect(d.comment).toBe('this is comment')

    d = parseLine('  \t  # this is comment ')
    expect(d.ip).toBe('')
    expect(d.domains).toEqual([])
    expect(d.comment).toBe('this is comment')

    d = parseLine('# this is comment ')
    expect(d.ip).toBe('')
    expect(d.domains).toEqual([])
    expect(d.comment).toBe('this is comment')
  })

  it('duplicate test', async () => {
    const eq = async (number: string) => {
      const input = await loadData(`normalize.${number}.input.hosts`)
      const output = await loadData(`normalize.${number}.output.hosts`)

      expect(normalize(input, { remove_duplicate_records: true })).toBe(output)
    }

    await eq('001')
  })
})
