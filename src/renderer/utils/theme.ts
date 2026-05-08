import { ThemeType } from '@common/default_configs'

export type ResolvedThemeType = Exclude<ThemeType, 'system'>

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

export function normalizeTheme(theme: unknown): ThemeType {
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system'
}

export function getSystemTheme(): ResolvedThemeType {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }

  return window.matchMedia(DARK_MODE_QUERY).matches ? 'dark' : 'light'
}

export function onSystemThemeChange(onChange: (theme: ResolvedThemeType) => void) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {}
  }

  const mediaQuery = window.matchMedia(DARK_MODE_QUERY)
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light')

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }

  mediaQuery.addListener(listener)
  return () => mediaQuery.removeListener(listener)
}

export function applyThemeToBody(theme: ResolvedThemeType, classNames: string[] = []) {
  document.body.className = document.body.className.replace(/\btheme-\w+/gi, '')
  document.body.classList.add(`theme-${theme}`, ...classNames)
}
