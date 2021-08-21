/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import {
  IHostsBasicData,
  IHostsListObject,
  ITrashcanListObject,
  VersionType,
} from '@root/common/data'
import { flatten } from '@root/common/hostsFn'
import { v4 as uuid4 } from 'uuid'
import version from '@root/version.json'

const normalizeList = (list: IHostsListObject[]): IHostsListObject[] => {
  let flat = flatten(list)
  flat.map((item) => {
    if (!item.id) {
      item.id = uuid4()
    }
  })

  return list
}

const normalizeTrashcan = (
  list: ITrashcanListObject[],
): ITrashcanListObject[] => {
  list.map((item) => {
    if (!item.id) {
      item.id = uuid4()
    }
  })

  return list
}

export default async (): Promise<IHostsBasicData> => {
  const default_data: IHostsBasicData = {
    list: [],
    trashcan: [],
    version: version as VersionType,
  }

  let list = normalizeList(await swhdb.list.tree.all())
  let trashcan = normalizeTrashcan(await swhdb.list.trashcan.all())
  let v = await swhdb.dict.meta.get<VersionType>('version', version)

  return {
    ...default_data,
    list,
    trashcan,
    version: v,
  }
}
