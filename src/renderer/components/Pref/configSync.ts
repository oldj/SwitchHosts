import { ConfigsType } from '@common/default_configs'

export function isConfigPatch(value: unknown): value is Partial<ConfigsType> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function mergeConfigUpdateIntoDraft(
  draft: ConfigsType | null,
  snapshot: ConfigsType,
  patch: unknown,
): ConfigsType {
  if (!draft) {
    return snapshot
  }
  if (isConfigPatch(patch)) {
    return { ...draft, ...patch }
  }
  return snapshot
}
