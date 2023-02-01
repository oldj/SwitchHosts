/**
 * useI18n
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { LocaleName } from '@common/i18n'
import { useAtom } from 'jotai'
import { i18n_atom, lang_atom, locale_atom } from '@renderer/stores/i18n'

export default function useI18n() {
  const [locale, setLocale] = useAtom(locale_atom)
  const [i18n] = useAtom(i18n_atom)
  const [lang] = useAtom(lang_atom)

  return {
    locale,
    setLocale: (locale?: LocaleName) => setLocale(locale || 'en'),
    i18n,
    lang,
  }
}
