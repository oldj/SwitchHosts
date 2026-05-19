import { describe, expect, it } from 'vitest'

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

  it('lists every canonical bundled language', () => {
    expect(languageOptions.map(({ value }) => value)).toEqual([
      'zh',
      'zh_hant',
      'en',
      'fr',
      'de',
      'ja',
      'tr',
      'ko',
      'pl',
    ])
  })
})
