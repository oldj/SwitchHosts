/**
 * basic.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { clearData } from '@t/_base'
import { localBasicDataGet } from '@root/main/actions'

describe('basic test', () => {
  beforeEach(async () => {
    await clearData()
  })

  it('add hosts', async () => {
    let hosts = await localBasicDataGet()
    assert(hosts.list.length === 0)
    assert(hosts.trashcan.length === 0)
    assert(hosts.version.length === 3)
  })
})
