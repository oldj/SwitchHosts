import type useI18n from '@renderer/models/useI18n'

type Lang = ReturnType<typeof useI18n>['lang']

export const formatInterval = (seconds: number, lang: Lang): string => {
  if (!seconds) return lang.never
  if (seconds < 60) return `${seconds} s`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} ${m === 1 ? lang.minute : lang.minutes}`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? lang.hour : lang.hours}`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? lang.day : lang.days}`
}
