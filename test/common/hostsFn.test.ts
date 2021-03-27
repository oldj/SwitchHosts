/**
 * hostsFn.test.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import { IHostsListObject } from '@root/common/data'
import { findItemById, setOnStateOfItem } from '@root/common/hostsFn'

describe('hostsFn test', function () {

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

  it('updateOneItem top level test', () => {
    let list: IHostsListObject[] = [
      { id: '1' },
    ]
    list = setOnStateOfItem(list, '1', true, 0)
    assert(list[0].on)

    list = [
      { id: '1' },
      { id: '2' },
    ]
    list = setOnStateOfItem(list, '1', true, 0)
    assert(list[0].on)
    assert(!list[1].on)

    list = setOnStateOfItem(list, '2', true, 0)
    assert(list[0].on)
    assert(list[1].on)

    // 单选
    list = [
      { id: '1' },
      { id: '2', on: true },
      { id: '3', on: true },
    ]
    list = setOnStateOfItem(list, '1', true, 1)
    assert(list[0].on)
    assert(!list[1].on)
    assert(!list[2].on)

    // 多选
    list = [
      { id: '1' },
      { id: '2', on: true },
      { id: '3', on: true },
    ]
    list = setOnStateOfItem(list, '1', true, 2)
    assert(list[0].on)
    assert(list[1].on)
    assert(list[2].on)
  })

  it('updateOneItem folder test', () => {
    // default
    let list = makeAList()
    list = setOnStateOfItem(list, '1', true, 1)
    assert(list[0].on)
    assert(!list[1].on)
    assert(!list[2].on)
    assert(!list[3].on)

    list = setOnStateOfItem(list, '2', true, 1)
    assert(!list[0].on)
    assert(list[1].on)
    assert(!list[2].on)
    assert(!list[3].on)

    list = setOnStateOfItem(list, '2.1', true, 0)
    assert(getItem(list, '2.1').on)
    assert(!getItem(list, '2.2').on)
    assert(!getItem(list, '2.3').on)

    list = setOnStateOfItem(list, '2.2', true, 0)
    assert(getItem(list, '2.1').on)
    assert(getItem(list, '2.2').on)
    assert(!getItem(list, '2.3').on)

    list = setOnStateOfItem(list, '2.3', true, 1)
    assert(!getItem(list, '2.1').on)
    assert(!getItem(list, '2.2').on)
    assert(getItem(list, '2.3').on)

    list = setOnStateOfItem(list, '2.1', true, 1)
    assert(getItem(list, '2.1').on)
    assert(!getItem(list, '2.2').on)
    assert(!getItem(list, '2.3').on)

    list = setOnStateOfItem(list, '2.2', true, 2)
    assert(getItem(list, '2.1').on)
    assert(getItem(list, '2.2').on)
    assert(!getItem(list, '2.3').on)

    list = setOnStateOfItem(list, '3.1', true, 0)
    assert(getItem(list, '3.1').on)
    assert(!getItem(list, '3.2').on)
    assert(!getItem(list, '3.3').on)

    list = setOnStateOfItem(list, '3.2', true, 0)
    assert(!getItem(list, '3.1').on)
    assert(getItem(list, '3.2').on)
    assert(!getItem(list, '3.3').on)

    list = setOnStateOfItem(list, '3.3', true, 1)
    assert(!getItem(list, '3.1').on)
    assert(!getItem(list, '3.2').on)
    assert(getItem(list, '3.3').on)

    list = setOnStateOfItem(list, '3.1', true, 2)
    assert(getItem(list, '3.1').on)
    assert(!getItem(list, '3.2').on)
    assert(!getItem(list, '3.3').on)
    assert(!getItem(list, '3.4').on)

    list = setOnStateOfItem(list, '3.4.1', true, 0)
    assert(getItem(list, '3.4.1').on)
    assert(!getItem(list, '3.4.2').on)
    assert(!getItem(list, '3.4.3').on)

    list = setOnStateOfItem(list, '3.4.2', true, 0)
    assert(getItem(list, '3.4.1').on)
    assert(getItem(list, '3.4.2').on)
    assert(!getItem(list, '3.4.3').on)

    list = setOnStateOfItem(list, '3.4.3', true, 1)
    assert(getItem(list, '3.4.1').on)
    assert(getItem(list, '3.4.2').on)
    assert(getItem(list, '3.4.3').on)

    list = setOnStateOfItem(list, '3.4.3', false, 2)
    assert(getItem(list, '3.4.1').on)
    assert(getItem(list, '3.4.2').on)
    assert(!getItem(list, '3.4.3').on)

    list = setOnStateOfItem(list, '4.1', true, 0)
    assert(getItem(list, '4.1').on)
    assert(!getItem(list, '4.2').on)
    assert(!getItem(list, '4.3').on)

    list = setOnStateOfItem(list, '4.2', true, 1)
    assert(getItem(list, '4.1').on)
    assert(getItem(list, '4.2').on)
    assert(!getItem(list, '4.3').on)

    list = setOnStateOfItem(list, '4.3', true, 2)
    assert(getItem(list, '4.1').on)
    assert(getItem(list, '4.2').on)
    assert(getItem(list, '4.3').on)

    list = setOnStateOfItem(list, '4.4.1', true, 0)
    assert(getItem(list, '4.4.1').on)
    assert(!getItem(list, '4.4.2').on)
    assert(!getItem(list, '4.4.3').on)

    list = setOnStateOfItem(list, '4.4.2', true, 1)
    assert(!getItem(list, '4.4.1').on)
    assert(getItem(list, '4.4.2').on)
    assert(!getItem(list, '4.4.3').on)

    list = setOnStateOfItem(list, '4.4.3', true, 2)
    assert(!getItem(list, '4.4.1').on)
    assert(!getItem(list, '4.4.2').on)
    assert(getItem(list, '4.4.3').on)

    list = setOnStateOfItem(list, '4.4.3', false, 2)
    assert(!getItem(list, '4.4.1').on)
    assert(!getItem(list, '4.4.2').on)
    assert(!getItem(list, '4.4.3').on)
  })
})
