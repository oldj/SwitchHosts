/**
 * basic.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { clearData } from '@_t/_base'
import { getBasicData } from '@root/main/actions'
import { swhdb } from '@root/main/data'

describe('basic test', () => {
  beforeEach(async () => {
    await clearData()
  })

  it('add hosts', async () => {
    let hosts = await getBasicData()
    assert(hosts.list.length === 0)
    assert(hosts.trashcan.length === 0)
    assert(hosts.version.length === 4)

    await swhdb.collection.hosts.insert({ id: '1' })
    let items = await swhdb.collection.hosts.all()
    assert(items.length === 1)
  })
})
