/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { I18N, LocaleName, languages } from '@common/i18n'
import { atom } from 'jotai'

export function resolveSystemLocale(): LocaleName {
  const raw = (typeof navigator !== 'undefined' && navigator.language) || ''
  if (raw in languages) return raw as LocaleName
  const short = raw.split('-')[0]
  if (short in languages) return short as LocaleName
  return 'en'
}

export const localeAtom = atom<LocaleName>(resolveSystemLocale())
export const i18nAtom = atom((get) => new I18N(get(localeAtom)))
export const isHalfWidthAtom = atom((get) => get(i18nAtom).lang.colon.startsWith(':'))
export const langAtom = atom((get) => get(i18nAtom).lang)
