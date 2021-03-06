/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsBasicData } from '@root/common/data'
import version from '@root/version.json'

export default async (): Promise<IHostsBasicData> => {
  const default_data: IHostsBasicData = {
    list: [],
    trashcan: [],
    version,
  }

  let list = await swhdb.list.tree.all()
  let trashcan = await swhdb.list.trashcan.all()
  let v = await swhdb.dict.meta.get('version', version)

  return {
    ...default_data,
    list,
    trashcan,
    version: v,
  }
}
