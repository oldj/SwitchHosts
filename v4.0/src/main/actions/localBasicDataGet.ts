/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { HostsDataType } from '@root/common/data'
import version from '@root/version.json'

export default async (): Promise<HostsDataType> => {
  const default_data: HostsDataType = {
    list: [],
    version,
  }

  let list = await swhdb.list.tree.all()
  let v = await swhdb.dict.meta.get('version', version)

  return {
    ...default_data,
    list,
    version: v,
  }
}
