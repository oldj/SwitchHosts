export function hasValue(value) {
  return typeof value === 'string' ? value.trim() !== '' : Boolean(value)
}

export function getFirstConfiguredEnv(env, names) {
  for (const name of names) {
    if (hasValue(env[name])) {
      return env[name].trim()
    }
  }

  return null
}

export function isEnvFlagEnabled(value) {
  if (!hasValue(value)) {
    return false
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
      return false
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true
    }
  }

  return Boolean(value)
}
