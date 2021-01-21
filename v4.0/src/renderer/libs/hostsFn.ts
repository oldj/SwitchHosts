/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsObjectType } from '@root/common/data'
import lodash from 'lodash'

type PartHostsObjectType = Partial<HostsObjectType> & { id: string }

export const flattern = (list: HostsObjectType[]): HostsObjectType[] => {
  let new_list: HostsObjectType[] = []

  list.map(item => {
    new_list.push(item)
    if (item.children) {
      new_list = [...new_list, ...flattern(item.children)]
    }
  })

  return new_list
}

export const updateOneItem = (list: HostsObjectType[], item: PartHostsObjectType): HostsObjectType[] => {
  let new_list: HostsObjectType[] = lodash.cloneDeep(list)

  let i = lodash.filter(new_list, { id: item.id })[0]
  if (i) {
    Object.assign(i, item)
  }

  return new_list
}
