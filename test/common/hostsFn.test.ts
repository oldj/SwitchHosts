/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { describe, expect, it } from 'vitest'
import type { IHostsListObject } from '../../src/common/data'
import { findItemById, setOnStateOfItem } from '../../src/common/hostsFn'

describe('hostsFn test', () => {
  const makeAList = (): IHostsListObject[] => {
    return [
      { id: '1' },
      {
        id: '2', type: 'folder', folder_mode: 0, children: [
          { id: '2.1' },
          { id: '2.2' },
          { id: '2.3' },
        ],
      },
      {
        id: '3', type: 'folder', folder_mode: 1, children: [
          { id: '3.1' },
          { id: '3.2' },
          { id: '3.3' },
          {
            id: '3.4', type: 'folder', folder_mode: 2, children: [
              { id: '3.4.1' },
              { id: '3.4.2' },
              { id: '3.4.3' },
            ],
          },
        ],
      },
      {
        id: '4', type: 'folder', folder_mode: 2, children: [
          { id: '4.1' },
          { id: '4.2' },
          { id: '4.3' },
          {
            id: '4.4', type: 'folder', folder_mode: 1, children: [
              { id: '4.4.1' },
              { id: '4.4.2' },
              { id: '4.4.3' },
            ],
          },
        ],
      },
      { id: '5' },
      { id: '6' },
    ]
  }

  const getItem = (list: IHostsListObject[], id: string): any => findItemById(list, id) || {}
  const expectItemOn = (list: IHostsListObject[], id: string, value: boolean) => {
    expect(Boolean(getItem(list, id).on)).toBe(value)
  }
  const expectTopLevelOn = (list: IHostsListObject[], expected: boolean[]) => {
    expect(list.slice(0, expected.length).map((item) => Boolean(item.on))).toEqual(expected)
  }

  it('updateOneItem top level test', () => {
    let list: IHostsListObject[] = [
      { id: '1' },
    ]
    list = setOnStateOfItem(list, '1', true, 0)
    expectTopLevelOn(list, [true])

    list = [
      { id: '1' },
      { id: '2' },
    ]
    list = setOnStateOfItem(list, '1', true, 0)
    expectTopLevelOn(list, [true, false])

    list = setOnStateOfItem(list, '2', true, 0)
    expectTopLevelOn(list, [true, true])

    list = [
      { id: '1' },
      { id: '2', on: true },
      { id: '3', on: true },
    ]
    list = setOnStateOfItem(list, '1', true, 1)
    expectTopLevelOn(list, [true, false, false])

    list = [
      { id: '1' },
      { id: '2', on: true },
      { id: '3', on: true },
    ]
    list = setOnStateOfItem(list, '1', true, 2)
    expectTopLevelOn(list, [true, true, true])
  })

  it('updateOneItem folder test', () => {
    let list = makeAList()
    list = setOnStateOfItem(list, '1', true, 1)
    expectTopLevelOn(list, [true, false, false, false])

    list = setOnStateOfItem(list, '2', true, 1)
    expectTopLevelOn(list, [false, true, false, false])

    list = setOnStateOfItem(list, '2.1', true, 0)
    expectItemOn(list, '2.1', true)
    expectItemOn(list, '2.2', false)
    expectItemOn(list, '2.3', false)

    list = setOnStateOfItem(list, '2.2', true, 0)
    expectItemOn(list, '2.1', true)
    expectItemOn(list, '2.2', true)
    expectItemOn(list, '2.3', false)

    list = setOnStateOfItem(list, '2.3', true, 1)
    expectItemOn(list, '2.1', false)
    expectItemOn(list, '2.2', false)
    expectItemOn(list, '2.3', true)

    list = setOnStateOfItem(list, '2.1', true, 1)
    expectItemOn(list, '2.1', true)
    expectItemOn(list, '2.2', false)
    expectItemOn(list, '2.3', false)

    list = setOnStateOfItem(list, '2.2', true, 2)
    expectItemOn(list, '2.1', true)
    expectItemOn(list, '2.2', true)
    expectItemOn(list, '2.3', false)

    list = setOnStateOfItem(list, '3.1', true, 0)
    expectItemOn(list, '3.1', true)
    expectItemOn(list, '3.2', false)
    expectItemOn(list, '3.3', false)

    list = setOnStateOfItem(list, '3.2', true, 0)
    expectItemOn(list, '3.1', false)
    expectItemOn(list, '3.2', true)
    expectItemOn(list, '3.3', false)

    list = setOnStateOfItem(list, '3.3', true, 1)
    expectItemOn(list, '3.1', false)
    expectItemOn(list, '3.2', false)
    expectItemOn(list, '3.3', true)

    list = setOnStateOfItem(list, '3.1', true, 2)
    expectItemOn(list, '3.1', true)
    expectItemOn(list, '3.2', false)
    expectItemOn(list, '3.3', false)
    expectItemOn(list, '3.4', false)

    list = setOnStateOfItem(list, '3.4.1', true, 0)
    expectItemOn(list, '3.4.1', true)
    expectItemOn(list, '3.4.2', false)
    expectItemOn(list, '3.4.3', false)

    list = setOnStateOfItem(list, '3.4.2', true, 0)
    expectItemOn(list, '3.4.1', true)
    expectItemOn(list, '3.4.2', true)
    expectItemOn(list, '3.4.3', false)

    list = setOnStateOfItem(list, '3.4.3', true, 1)
    expectItemOn(list, '3.4.1', true)
    expectItemOn(list, '3.4.2', true)
    expectItemOn(list, '3.4.3', true)

    list = setOnStateOfItem(list, '3.4.3', false, 2)
    expectItemOn(list, '3.4.1', true)
    expectItemOn(list, '3.4.2', true)
    expectItemOn(list, '3.4.3', false)

    list = setOnStateOfItem(list, '4.1', true, 0)
    expectItemOn(list, '4.1', true)
    expectItemOn(list, '4.2', false)
    expectItemOn(list, '4.3', false)

    list = setOnStateOfItem(list, '4.2', true, 1)
    expectItemOn(list, '4.1', true)
    expectItemOn(list, '4.2', true)
    expectItemOn(list, '4.3', false)

    list = setOnStateOfItem(list, '4.3', true, 2)
    expectItemOn(list, '4.1', true)
    expectItemOn(list, '4.2', true)
    expectItemOn(list, '4.3', true)

    list = setOnStateOfItem(list, '4.4.1', true, 0)
    expectItemOn(list, '4.4.1', true)
    expectItemOn(list, '4.4.2', false)
    expectItemOn(list, '4.4.3', false)

    list = setOnStateOfItem(list, '4.4.2', true, 1)
    expectItemOn(list, '4.4.1', false)
    expectItemOn(list, '4.4.2', true)
    expectItemOn(list, '4.4.3', false)

    list = setOnStateOfItem(list, '4.4.3', true, 2)
    expectItemOn(list, '4.4.1', false)
    expectItemOn(list, '4.4.2', false)
    expectItemOn(list, '4.4.3', true)

    list = setOnStateOfItem(list, '4.4.3', false, 2)
    expectItemOn(list, '4.4.1', false)
    expectItemOn(list, '4.4.2', false)
    expectItemOn(list, '4.4.3', false)
  })
})
