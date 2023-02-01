/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { IHostsListObject } from '@common/data'
import { findItemById } from '@common/hostsFn'

export default async (id: string): Promise<IHostsListObject | undefined> => {
  let list = await getList()
  return findItemById(list, id)
}
