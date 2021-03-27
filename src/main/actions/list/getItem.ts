/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { IHostsListObject } from '@root/common/data'
import { findItemById } from '@root/common/hostsFn'

export default async (id: string): Promise<IHostsListObject | undefined> => {
  let list = await getList()
  return findItemById(list, id)
}
