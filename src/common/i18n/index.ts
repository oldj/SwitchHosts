/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import en from './languages/en'
import zh from './languages/zh'
import zh_hant from './languages/zh-hant'
import fr from './languages/fr'
import de from './languages/de'
import ja from './languages/ja'
import tr from './languages/tr'
import ko from './languages/ko'
import pl from './languages/pl'
import { LanguageDict, LanguageKey } from '@common/types'

export const languages = {
  en,
  zh,
  cn: zh,
  'zh-CN': zh,
  zh_hant: zh_hant,
  'zh-TW': zh_hant,
  fr,
  de,
  ja,
  tr,
  ko,
  pl,
}

export type LocaleName = keyof typeof languages

export class I18N {
  locale: LocaleName
  lang: LanguageDict

  constructor(locale: LocaleName = 'en') {
    this.locale = locale

    this.lang = new Proxy(
      {},
      {
        get: (_obj, key: LanguageKey) => this.trans(key),
      },
    ) as LanguageDict
  }

  trans(key: LanguageKey, words?: string[]) {
    const lang = languages[this.locale]

    let s: string = ''

    if (key in lang) {
      s = lang[key].toString()
    }

    if (words) {
      words.map((w, idx) => {
        const reg = new RegExp(`\\{\\s*${idx}\\s*\\}`)
        s = s.replace(reg, w)
      })
    }

    return s
  }
}
