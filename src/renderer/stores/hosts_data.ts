/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import version from '@/version.json'
import { IHostsBasicData, IHostsListObject, VersionType } from '@common/data'
import { atom } from 'jotai'

export const hosts_data_atom = atom<IHostsBasicData>({
  list: [],
  trashcan: [],
  version: version as VersionType,
})

export const current_hosts_atom = atom<IHostsListObject | null>(null)
