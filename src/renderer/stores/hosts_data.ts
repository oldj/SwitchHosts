/**
 * hosts_data.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { IHostsBasicData, IHostsListObject, VersionType } from '@root/common/data'
import { atom } from 'jotai'
import version from '@root/version.json'

export const hosts_data_atom = atom<IHostsBasicData>({
  list: [],
  trashcan: [],
  version: version as VersionType,
})

export const current_hosts_atom = atom<IHostsListObject | null>(null)
