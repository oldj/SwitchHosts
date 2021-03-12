/**
 * useI18n
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { I18N, LocaleName } from '@root/common/i18n'
import { useState } from 'react'

export default function useI18n() {
  const [ locale, setLocale ] = useState<LocaleName>('en')

  const i18n = new I18N(locale)

  return {
    locale,
    setLocale,
    i18n,
    lang: i18n.lang,
  }
}
