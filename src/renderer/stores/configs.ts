/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { loadConfigSnapshot } from '@renderer/core/configSnapshot'
import { atom } from 'jotai'

export const configsAtom = atom<ConfigsType | null>(null)
configsAtom.onMount = (setAtom) => {
  void loadConfigSnapshot(setAtom)
}
