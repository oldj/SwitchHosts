/**
 * trashcan.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { clearData } from '@_t/_base'
import {
  deleteItemFromTrashcan,
  getBasicData,
  getHostsContent,
  getList,
  getTrashcanList,
  moveToTrashcan,
  restoreItemFromTrashcan,
  setHostsContent,
  setList,
} from '@root/main/actions'

describe('basic test', () => {
  beforeEach(async () => {
    await clearData()
  })

  it('basic add and delete hosts', async () => {
    let { list, trashcan } = await getBasicData()
    assert(list.length === 0)
    assert(trashcan.length === 0)

    await setList([ { id: '111' } ])
    list = await getList()
    assert(list.length === 1)
    assert((await getBasicData()).list.length === 1)
    assert((await getTrashcanList()).length === 0)

    await moveToTrashcan('111')
    assert((await getList()).length === 0)

    let tlist = await getTrashcanList()
    assert(tlist.length === 1)
    assert(tlist[0].data.id === '111')
    let ts = (new Date()).getTime()
    assert(tlist[0].add_time_ms > ts - 1000 && tlist[0].add_time_ms <= ts)

    await restoreItemFromTrashcan(tlist[0].data.id)
    list = await getList()
    assert(list.length === 1)
    assert(list[0].id === '111')
    assert((await getTrashcanList()).length === 0)

    await setHostsContent('111', 'hosts_111')
    assert((await getHostsContent('111')) === 'hosts_111')

    await moveToTrashcan('111')
    assert((await getList()).length === 0)
    assert((await getTrashcanList()).length === 1)
    assert((await getHostsContent('111')) === 'hosts_111')

    await deleteItemFromTrashcan('111')
    assert((await getList()).length === 0)
    assert((await getTrashcanList()).length === 0)
    assert((await getHostsContent('111')) === '')
  })
})
