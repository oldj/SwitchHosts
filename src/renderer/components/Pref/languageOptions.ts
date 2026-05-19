import type { LocaleName } from '@common/i18n'

export const languageOptions = [
  { value: 'zh', label: '简体中文' },
  { value: 'zh_hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: '日本語' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ko', label: '한국어' },
  { value: 'pl', label: 'Polski' },
] as const satisfies ReadonlyArray<{ value: LocaleName; label: string }>

type LanguageOptionValue = (typeof languageOptions)[number]['value']

const languageOptionValues = new Set<LocaleName>(
  languageOptions.map(({ value }) => value),
)

const localeAliases: Partial<Record<LocaleName, LanguageOptionValue>> = {
  cn: 'zh',
  'zh-CN': 'zh',
  'zh-TW': 'zh_hant',
}

export function normalizeLanguageOptionValue(
  locale?: LocaleName,
): LanguageOptionValue | undefined {
  if (!locale) return undefined

  const alias = localeAliases[locale]
  if (alias) return alias

  return languageOptionValues.has(locale) ? (locale as LanguageOptionValue) : undefined
}

export function resolveLanguageSelectValue(
  configLocale: LocaleName | undefined,
  activeLocale: LocaleName,
): LanguageOptionValue {
  return (
    normalizeLanguageOptionValue(configLocale) ??
    normalizeLanguageOptionValue(activeLocale) ??
    'en'
  )
}
