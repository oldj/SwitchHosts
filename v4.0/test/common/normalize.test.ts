/**
 * normalize.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import normalize, { parseLine } from '@root/common/normalize'
import { promises as fs } from 'fs'
import * as path from 'path'

const mock_dir = path.join(__dirname, 'mock')

describe('normalize test', function () {
  const loadData = async (fn: string) => {
    return fs.readFile(path.join(mock_dir, fn), 'utf-8')
  }

  it('basic test', () => {
    assert(normalize('aaa') === 'aaa')
  })

  it('paresLine test', () => {
    let d = parseLine('1.2.3.4 abc.com')
    assert(d.ip === '1.2.3.4')
    assert(d.domains.length === 1 && d.domains[0] === 'abc.com')
    assert(d.comment === '')

    d = parseLine('1.2.3.4  \t abc.com abc2.com  abc3.com\ttest.com  ')
    assert(d.ip === '1.2.3.4')
    assert(d.domains.length === 4)
    assert(d.domains.join(',') === 'abc.com,abc2.com,abc3.com,test.com')
    assert(d.comment === '')

    d = parseLine('1.2.3.4  \t abc.com abc2.com  abc3.com\ttest.com  # this is comment ')
    assert(d.ip === '1.2.3.4')
    assert(d.domains.length === 4)
    assert(d.domains.join(',') === 'abc.com,abc2.com,abc3.com,test.com')
    assert(d.comment === 'this is comment')

    d = parseLine('1.2.3.4  \t  # this is comment ')
    assert(d.ip === '1.2.3.4')
    assert(d.domains.length === 0)
    assert(d.comment === 'this is comment')

    d = parseLine('  \t  # this is comment ')
    assert(d.ip === '')
    assert(d.domains.length === 0)
    assert(d.comment === 'this is comment')

    d = parseLine('# this is comment ')
    assert(d.ip === '')
    assert(d.domains.length === 0)
    assert(d.comment === 'this is comment')
  })

  it('duplicate test', async () => {
    const eq = async (number: string) => {
      let input = await loadData(`normalize.${number}.input.hosts`)
      let output = await loadData(`normalize.${number}.output.hosts`)

      // console.log(normalize(input, { remove_duplicate_records: true }))
      assert(normalize(input, { remove_duplicate_records: true }) === output)
    }

    await eq('001')
  })
})
