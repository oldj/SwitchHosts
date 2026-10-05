import { describe, expect, it } from 'vitest'
import { I18N, languages } from './index'
import en from './languages/en'
import type { LanguageKey } from '@common/types'

const addedLocales = ['es', 'it', 'nl', 'pt', 'vi', 'ru', 'th'] as const
const placeholders = (value: string) => (value.match(/\{[^{}]+\}/g) ?? []).sort()

describe.each(addedLocales)('%s translations', (locale) => {
  const dictionary = languages[locale]

  it('covers all interface strings with matching interpolation placeholders', () => {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en) as LanguageKey[]) {
      expect(dictionary[key].trim(), key).not.toBe('')
      expect(placeholders(dictionary[key]), key).toEqual(placeholders(en[key]))
    }
    expect(dictionary._key).toBe(locale)
  })

  it('renders translated UI text and interpolates multiple arguments', () => {
    const i18n = new I18N(locale)
    expect(i18n.lang.preferences).toBe(dictionary.preferences)
    expect(i18n.lang.preferences).not.toBe(en.preferences)
    const translated = i18n.trans('import_replace_impact', ['11', '22', '33', '44'])
    for (const value of ['11', '22', '33', '44']) {
      expect(translated).toContain(value)
    }
    expect(placeholders(translated)).toEqual([])
  })
})
