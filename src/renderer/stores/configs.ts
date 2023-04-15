/**
 * configs.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { actions } from '@renderer/core/agent'
import { atom } from 'jotai'

export const configs_atom = atom<ConfigsType | null>(null)
configs_atom.onMount = (setAtom) => {
  actions.configAll().then(setAtom)
}
