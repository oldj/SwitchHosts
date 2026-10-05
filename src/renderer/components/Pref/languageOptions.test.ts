import { describe, expect, it } from 'vitest'
import { languages } from '@common/i18n'

import {
  languageOptions,
  normalizeLanguageOptionValue,
  resolveLanguageSelectValue,
} from './languageOptions'

describe('language preference options', () => {
  it('shows the active system language when no locale is saved', () => {
    expect(resolveLanguageSelectValue(undefined, 'zh-CN')).toBe('zh')
  })

  it('normalizes locale aliases to selectable option values', () => {
    expect(normalizeLanguageOptionValue('cn')).toBe('zh')
    expect(normalizeLanguageOptionValue('zh-CN')).toBe('zh')
    expect(normalizeLanguageOptionValue('zh-TW')).toBe('zh_hant')
  })

  it('prefers a saved language over the active system language', () => {
    expect(resolveLanguageSelectValue('de', 'zh-CN')).toBe('de')
  })

  it('lists every canonical bundled language alphabetically, with non-Latin names last', () => {
    expect(languageOptions.map(({ value }) => value)).toEqual([
      'de',
      'en',
      'es',
      'fr',
      'it',
      'nl',
      'pl',
      'pt',
      'vi',
      'tr',
      'ru',
      'th',
      'ja',
      'ko',
      'zh',
      'zh_hant',
    ])
    expect(new Set(languageOptions.map(({ value }) => languages[value]))).toEqual(
      new Set(Object.values(languages)),
    )
  })
})
