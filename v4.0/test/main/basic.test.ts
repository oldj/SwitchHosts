/**
 * basic.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { clearData } from '@_t/_base'
import {
  getBasicData,
  getHostsContent,
  getList,
  setHostsContent,
  setList,
} from '@root/main/actions'
import { swhdb } from '@root/main/data'

describe('basic test', () => {
  beforeEach(async () => {
    await clearData()
  })

  it('add hosts', async () => {
    let basic_data = await getBasicData()
    assert(basic_data.list.length === 0)
    assert(basic_data.trashcan.length === 0)
    assert(basic_data.version.length === 4)

    await swhdb.collection.hosts.insert({ id: '1' })
    let items = await swhdb.collection.hosts.all()
    assert(items.length === 1)

    await setHostsContent('1', '# 111')
    assert(await getHostsContent('1') === '# 111')

    let list = await getList()
    assert(list.length === 0)
    await setList([ { id: '1' } ])
    list = await getList()
    assert(list.length === 1)
    assert(list[0].id === '1')
  })

  it('group hosts', async () => {
    await setList([
      { id: '1' },
      { id: '2' },
      { id: '3', type: 'group', include: [ '1', '2' ] },
    ])
    let c1 = '# 425748244153'
    let c2 = '# 642156457548'
    await setHostsContent('1', c1)
    await setHostsContent('2', c2)

    assert(await getHostsContent('1') === c1)
    assert(await getHostsContent('2') === c2)

    let c3 = await getHostsContent('3')
    assert(c3.indexOf(c1) > -1)
    assert(c3.indexOf(c2) > c3.indexOf(c1))

    await setList([
      { id: '1' },
      { id: '2' },
      {
        id: '4', type: 'folder', children: [
          { id: '5', type: 'group', include: [ '1', '2' ] },
        ],
      },
    ])

    let c5 = await getHostsContent('5')
    assert(c3 === c5)
  })
})
