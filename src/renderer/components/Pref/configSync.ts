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
    // Events identify the changed fields. Their values can be stale by the
    // time configAll resolves; use the authoritative snapshot for those fields
    // while preserving unrelated, unsaved drafts.
    const updates = Object.fromEntries(
      Object.keys(patch)
        .filter((key) => Object.hasOwn(snapshot, key))
        .map((key) => [key, snapshot[key as keyof ConfigsType]]),
    )
    return { ...draft, ...updates }
  }
  return snapshot
}
