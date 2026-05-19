/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import version from '@/version.json'
import { IHostsBasicData, IHostsListObject } from '@common/data'
import { atom } from 'jotai'

export const hostsDataAtom = atom<IHostsBasicData>({
  list: [],
  trashcan: [],
  version,
})

export const currentHostsAtom = atom<IHostsListObject | null>(null)
