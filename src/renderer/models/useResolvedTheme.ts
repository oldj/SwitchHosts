import {
  getSystemTheme,
  normalizeTheme,
  onSystemThemeChange,
  ResolvedThemeType,
} from '@renderer/utils/theme'
import { useSyncExternalStore } from 'react'

const subscribeToSystemTheme = (onStoreChange: () => void) =>
  onSystemThemeChange(() => onStoreChange())

const getServerTheme = () => 'light' as ResolvedThemeType

export default function useResolvedTheme(theme: unknown): ResolvedThemeType {
  const normalizedTheme = normalizeTheme(theme)
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    getServerTheme,
  )

  return normalizedTheme === 'system' ? systemTheme : normalizedTheme
}
