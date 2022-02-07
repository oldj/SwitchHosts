/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import en from './languages/en'
import zh from './languages/zh'
import fr from './languages/fr'
import de from './languages/de'
import { LanguageDict, LanguageKey } from '@root/common/types'

export const languages = {
  en,
  zh,
  cn: zh,
  'zh-CN': zh,
  fr,
  de,
}

export type LocaleName = keyof typeof languages

export class I18N {
  locale: LocaleName
  lang: LanguageDict

  constructor(locale: LocaleName = 'en') {
    this.locale = locale

    const _this = this

    this.lang = new Proxy(
      {},
      {
        get(obj, key: LanguageKey) {
          return _this.trans(key)
        },
      },
    ) as LanguageDict
  }

  trans(key: LanguageKey, words?: string[]) {
    let lang = languages[this.locale]

    let s: string = ''

    if (key in lang) {
      s = lang[key].toString()
    }

    if (words) {
      words.map((w, idx) => {
        let reg = new RegExp(`\{\s*${idx}\s*}`)
        s = s.replace(reg, w)
      })
    }

    return s
  }
}
