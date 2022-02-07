/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { languages, LocaleName } from '@root/common/i18n'
import { app } from 'electron'

const isLocaleName = (locale: string): locale is LocaleName => {
  return Object.keys(languages).includes(locale)
}

export default async () => {
  let locale = app.getLocale()
  if (!locale) {
    return
  }

  console.log(`Systel locale: ${locale}`)
  if (locale.startsWith('en')) {
    locale = 'en'
  } else if (locale.startsWith('zh')) {
    locale = 'zh'
  } else if (locale.startsWith('fr')) {
    locale = 'fr'
  } else if (locale.startsWith('de')) {
    locale = 'de'
  }

  if (!isLocaleName(locale)) {
    return
  }

  global.system_locale = locale
}
