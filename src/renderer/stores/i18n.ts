/**
 * i18n.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { I18N, LocaleName } from '@common/i18n'
import { atom } from 'jotai'

let _locale = localStorage.getItem('locale') as LocaleName | undefined

export const locale_atom = atom<LocaleName>(_locale || 'en')
export const i18n_atom = atom((get) => new I18N(get(locale_atom)))
export const is_half_width_atom = atom((get) => get(i18n_atom).lang.colon.startsWith(':'))
export const lang_atom = atom((get) => get(i18n_atom).lang)
