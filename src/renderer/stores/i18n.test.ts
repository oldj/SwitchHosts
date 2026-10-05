import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSystemLocale } from './i18n'

afterEach(() => vi.unstubAllGlobals())

describe('system language detection for added locales', () => {
  it.each([
    ['es-ES', 'es'],
    ['es-MX', 'es'],
    ['it-IT', 'it'],
    ['nl-NL', 'nl'],
    ['nl-BE', 'nl'],
    ['pt-PT', 'pt'],
    ['pt-BR', 'pt'],
    ['vi-VN', 'vi'],
    ['ru-RU', 'ru'],
    ['th-TH', 'th'],
  ])('resolves %s to %s', (systemLocale, expectedLocale) => {
    vi.stubGlobal('navigator', { language: systemLocale })
    expect(resolveSystemLocale()).toBe(expectedLocale)
    vi.stubGlobal('navigator', { language: expectedLocale })
    expect(resolveSystemLocale()).toBe(expectedLocale)
  })
})
