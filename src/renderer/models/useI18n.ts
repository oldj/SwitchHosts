/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { LocaleName } from '@common/i18n'
import { i18nAtom, langAtom, localeAtom, resolveSystemLocale } from '@renderer/stores/i18n'
import { useAtom } from 'jotai'

export default function useI18n() {
  const [locale, setLocale] = useAtom(localeAtom)
  const [i18n] = useAtom(i18nAtom)
  const [lang] = useAtom(langAtom)

  return {
    locale,
    setLocale: (locale?: LocaleName) => setLocale(locale || resolveSystemLocale()),
    i18n,
    lang,
  }
}
