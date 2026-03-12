/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearData } from '../_base'
import {
  getBasicData,
  getHostsContent,
  getList,
  setHostsContent,
  setList,
} from '../../src/main/actions'
import { swhdb } from '../../src/main/data'

describe('basic test', () => {
  beforeEach(async () => {
    await clearData()
  })

  it('add hosts', async () => {
    const basic_data = await getBasicData()
    expect(basic_data.list).toHaveLength(0)
    expect(basic_data.trashcan).toHaveLength(0)
    expect(basic_data.version).toHaveLength(4)

    await swhdb.collection.hosts.insert({ id: '1' })
    let items = await swhdb.collection.hosts.all()
    expect(items).toHaveLength(1)

    await setHostsContent('1', '# 111')
    expect(await getHostsContent('1')).toBe('# 111')

    let list = await getList()
    expect(list).toHaveLength(0)
    await setList([ { id: '1' } ])
    list = await getList()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('1')
  })

  it('normalizes CRLF when reading and writing hosts content', async () => {
    await swhdb.collection.hosts.insert({
      id: 'crlf-item',
      content: '127.0.0.1 localhost\r\n# comment\r\n',
    })

    expect(await getHostsContent('crlf-item')).toBe('127.0.0.1 localhost\n# comment\n')

    await setHostsContent('crlf-item', '127.0.0.1 localhost\r\n# next\r\n')

    const raw = await swhdb.collection.hosts.find<{ content: string }>((i) => i.id === 'crlf-item')
    expect(raw?.content).toBe('127.0.0.1 localhost\n# next\n')
    expect(await getHostsContent('crlf-item')).toBe('127.0.0.1 localhost\n# next\n')
  })

  it('group hosts', async () => {
    await setList([
      { id: '1' },
      { id: '2' },
      { id: '3', type: 'group', include: [ '1', '2' ] },
    ])
    const c1 = '# 425748244153'
    const c2 = '# 642156457548'
    await setHostsContent('1', c1)
    await setHostsContent('2', c2)

    expect(await getHostsContent('1')).toBe(c1)
    expect(await getHostsContent('2')).toBe(c2)

    const c3 = await getHostsContent('3')
    expect(c3).toContain(c1)
    expect(c3.indexOf(c2)).toBeGreaterThan(c3.indexOf(c1))

    await setList([
      { id: '1' },
      { id: '2' },
      {
        id: '4', type: 'folder', children: [
          { id: '5', type: 'group', include: [ '1', '2' ] },
        ],
      },
    ])

    const c5 = await getHostsContent('5')
    expect(c3).toBe(c5)
  })
})
