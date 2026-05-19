/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { actions } from '@renderer/core/agent'
import { atom } from 'jotai'

export const configsAtom = atom<ConfigsType | null>(null)
configsAtom.onMount = (setAtom) => {
  actions.configAll().then(setAtom)
}
