/**
 * trashcan.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearData } from '../_base'
import type { IHostsContentObject } from '../../src/common/data'
import {
  clearTrashcan,
  deleteItemFromTrashcan,
  getBasicData,
  getHostsContent,
  getList,
  getTrashcanList,
  moveToTrashcan,
  restoreItemFromTrashcan,
  setHostsContent,
  setList,
} from '../../src/main/actions'
import { swhdb } from '../../src/main/data'

describe('trashcan test', () => {
  beforeEach(async () => {
    await clearData()
  })

  it('basic add and delete hosts', async () => {
    let { list, trashcan } = await getBasicData()
    expect(list).toHaveLength(0)
    expect(trashcan).toHaveLength(0)

    await setList([ { id: '111' } ])
    list = await getList()
    expect(list).toHaveLength(1)
    expect((await getBasicData()).list).toHaveLength(1)
    expect(await getTrashcanList()).toHaveLength(0)

    await moveToTrashcan('111')
    expect(await getList()).toHaveLength(0)

    let tlist = await getTrashcanList()
    expect(tlist).toHaveLength(1)
    expect(tlist[0].data.id).toBe('111')
    const ts = (new Date()).getTime()
    expect(tlist[0].add_time_ms).toBeGreaterThan(ts - 1000)
    expect(tlist[0].add_time_ms).toBeLessThanOrEqual(ts)

    await restoreItemFromTrashcan(tlist[0].data.id)
    list = await getList()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('111')
    expect(await getTrashcanList()).toHaveLength(0)

    await setHostsContent('111', 'hosts_111')
    expect(await getHostsContent('111')).toBe('hosts_111')

    await moveToTrashcan('111')
    expect(await getList()).toHaveLength(0)
    expect(await getTrashcanList()).toHaveLength(1)
    expect(await getHostsContent('111')).toBe('hosts_111')

    await deleteItemFromTrashcan('111')
    expect(await getList()).toHaveLength(0)
    expect(await getTrashcanList()).toHaveLength(0)
    expect(await getHostsContent('111')).toBe('')
  })

  it('folder test', async () => {
    await setList([
      { id: '1' },
      { id: '2' },
      {
        id: '3', type: 'folder', children: [
          { id: '3.1' },
          { id: '3.2' },
          {
            id: '3.3', type: 'folder', children: [
              { id: '3.3.1' },
              { id: '3.3.2' },
              { id: '3.3.3' },
            ],
          },
          { id: '3.4' },
        ],
      },
      { id: '4' },
    ])

    let list = await getList()
    expect(list).toHaveLength(4)
    let tlist = await getTrashcanList()
    expect(tlist).toHaveLength(0)

    await moveToTrashcan('2')
    list = await getList()
    expect(list).toHaveLength(3)
    tlist = await getTrashcanList()
    expect(tlist).toHaveLength(1)
    expect(tlist[0].data.id).toBe('2')
    expect(tlist[0].parent_id).toBeNull()

    await restoreItemFromTrashcan('2')
    list = await getList()
    expect(list).toHaveLength(4)
    expect(list[3].id).toBe('2')

    await moveToTrashcan('3.3.1')
    list = await getList()
    expect(list).toHaveLength(4)
    expect(list[1].id).toBe('3')
    expect(list[1].children?.[2].id).toBe('3.3')
    expect(list[1].children?.[2].children).toHaveLength(2)
    expect(list[1].children?.[2].children?.[0].id).toBe('3.3.2')
    tlist = await getTrashcanList()
    expect(tlist).toHaveLength(1)
    expect(tlist[0].data.id).toBe('3.3.1')
    expect(tlist[0].parent_id).toBe('3.3')

    await restoreItemFromTrashcan('3.3.1')
    list = await getList()
    expect(list[1].children?.[2].id).toBe('3.3')
    expect(list[1].children?.[2].children).toHaveLength(3)
    expect(list[1].children?.[2].children?.[0].id).toBe('3.3.2')
    expect(list[1].children?.[2].children?.[1].id).toBe('3.3.3')
    expect(list[1].children?.[2].children?.[2].id).toBe('3.3.1')
  })

  it('folder delete test', async () => {
    await setList([
      { id: '1' },
      { id: '2' },
      {
        id: '3', type: 'folder', children: [
          { id: '3.1' },
          { id: '3.2' },
          {
            id: '3.3', type: 'folder', children: [
              { id: '3.3.1' },
              { id: '3.3.2' },
              { id: '3.3.3' },
            ],
          },
          { id: '3.4' },
        ],
      },
      { id: '4' },
    ])

    let hs: IHostsContentObject[] = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(0)

    await setHostsContent('1', '# 1')
    await setHostsContent('2', '# 2')
    await setHostsContent('3', '# 3')
    await setHostsContent('3.1', '# 3.1')
    await setHostsContent('3.2', '# 3.2')
    await setHostsContent('3.3', '# 3.3')
    await setHostsContent('3.3.1', '# 3.3.1')
    await setHostsContent('3.3.2', '# 3.3.2')
    await setHostsContent('3.3.3', '# 3.3.3')
    await setHostsContent('3.4', '# 3.4')
    await setHostsContent('4', '# 4')

    const list = await getList()
    expect(list).toHaveLength(4)
    const tlist = await getTrashcanList()
    expect(tlist).toHaveLength(0)

    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(11)
    expect(hs[0].content).toBe('# 1')

    await moveToTrashcan('3.2')
    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(11)
    await deleteItemFromTrashcan('3.2')
    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(10)

    await moveToTrashcan('3')
    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(10)
    await deleteItemFromTrashcan('3')
    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(3)
  })

  it('clear test', async () => {
    await setList([
      { id: '1' },
      { id: '2' },
      {
        id: '3', type: 'folder', children: [
          { id: '3.1' },
          { id: '3.2' },
          {
            id: '3.3', type: 'folder', children: [
              { id: '3.3.1' },
              { id: '3.3.2' },
              { id: '3.3.3' },
            ],
          },
          { id: '3.4' },
        ],
      },
      { id: '4' },
    ])

    let hs: IHostsContentObject[] = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(0)

    await setHostsContent('1', '# 1')
    await setHostsContent('2', '# 2')
    await setHostsContent('3', '# 3')
    await setHostsContent('3.1', '# 3.1')
    await setHostsContent('3.2', '# 3.2')
    await setHostsContent('3.3', '# 3.3')
    await setHostsContent('3.3.1', '# 3.3.1')
    await setHostsContent('3.3.2', '# 3.3.2')
    await setHostsContent('3.3.3', '# 3.3.3')
    await setHostsContent('3.4', '# 3.4')
    await setHostsContent('4', '# 4')

    const list = await getList()
    expect(list).toHaveLength(4)
    const tlist = await getTrashcanList()
    expect(tlist).toHaveLength(0)

    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(11)

    await moveToTrashcan('1')
    await moveToTrashcan('2')
    await moveToTrashcan('3')
    await moveToTrashcan('4')

    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(11)

    await clearTrashcan()
    hs = await swhdb.collection.hosts.all()
    expect(hs).toHaveLength(0)
    expect(await getList()).toHaveLength(0)
    expect(await getTrashcanList()).toHaveLength(0)
  })
})
