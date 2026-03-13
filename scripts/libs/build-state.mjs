import { hasNotarizeCredentials, prepareNotarizeEnv } from '../hooks/notarize-options.mjs'
import { getFirstConfiguredEnv, hasValue, isEnvFlagEnabled } from './build-env.mjs'

function hasSigningIdentityEnv(env = process.env) {
  return hasValue(env.IDENTITY)
}

function describeNotarizationSetup(env = process.env) {
  if (hasValue(env.APPLE_KEYCHAIN_PROFILE)) {
    return 'APPLE_KEYCHAIN_PROFILE'
  }

  if (hasValue(env.APPLE_API_KEY) || hasValue(env.APPLE_API_KEY_ID) || hasValue(env.APPLE_API_ISSUER)) {
    return 'APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER'
  }

  if (
    hasValue(env.APPLE_ID) ||
    hasValue(env.APPLE_APP_SPECIFIC_PASSWORD) ||
    hasValue(env.APPLE_TEAM_ID) ||
    hasValue(env.TEAM_ID)
  ) {
    return 'APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID'
  }

  return null
}

export async function resolveMacBuildState(plan, env = process.env) {
  const includesMac = plan.some(({ platform }) => platform === 'mac')
  const notarizationForcedOff = env.MAKE_FOR === 'dev' || isEnvFlagEnabled(env.SKIP_NOTARIZATION)

  const state = {
    includesMac,
    sign: false,
    notarize: false,
    logLevel: 'step',
    message: 'macOS signing configuration check skipped',
  }

  if (!includesMac) {
    state.message = 'skipping macOS signing configuration check'
    return state
  }

  await prepareNotarizeEnv(env)

  const hasIdentity = hasSigningIdentityEnv(env)
  const hasNotary = hasNotarizeCredentials(env)
  const configuredNotarySetup = describeNotarizationSetup(env)

  if (notarizationForcedOff) {
    if (hasIdentity) {
      state.sign = true
      state.logLevel = 'success'
      state.message = `macOS code signing enabled via IDENTITY; notarization disabled by ${
        env.MAKE_FOR === 'dev' ? 'MAKE_FOR=dev' : 'SKIP_NOTARIZATION'
      }`
    } else {
      state.logLevel = 'warning'
      state.message =
        'IDENTITY is not configured; falling back to unsigned macOS artifacts because notarization is disabled.'
    }

    return state
  }

  if (hasIdentity && hasNotary) {
    state.sign = true
    state.notarize = true
    state.logLevel = 'success'
    state.message = `macOS signing and notarization enabled via IDENTITY + ${configuredNotarySetup}`
    return state
  }

  const missing = []
  if (!hasIdentity) {
    missing.push('IDENTITY')
  }
  if (!hasNotary) {
    missing.push(
      'APPLE_KEYCHAIN_PROFILE or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID',
    )
  }

  state.logLevel = 'warning'
  state.message =
    `macOS signing/notarization config is missing or incomplete (${missing.join(', ')}). ` +
    'Falling back to unsigned and unnotarized macOS artifacts.'

  return state
}

export function resolveWindowsBuildState(plan, env = process.env) {
  const includesWin = plan.some(({ platform }) => platform === 'win')
  const certificateSubjectName = getFirstConfiguredEnv(env, [
    'WIN_CERTIFICATE_SUBJECT_NAME',
    'WINDOWS_CERTIFICATE_SUBJECT_NAME',
    'WIN_CERT_SUBJECT_NAME',
  ])
  const configuredPublisherName = getFirstConfiguredEnv(env, ['WIN_PUBLISHER_NAME', 'WINDOWS_PUBLISHER_NAME'])
  const publisherName = configuredPublisherName || certificateSubjectName

  const state = {
    includesWin,
    sign: false,
    logLevel: 'step',
    message: 'skipping Windows signing configuration check',
    publisherName,
    certificateSubjectName,
  }

  if (!includesWin) {
    state.message = 'skipping Windows signing configuration check'
    return state
  }

  if (certificateSubjectName) {
    state.sign = true
    state.logLevel = 'success'
    state.message =
      configuredPublisherName
        ? 'Windows code signing enabled via WIN_CERTIFICATE_SUBJECT_NAME and WIN_PUBLISHER_NAME.'
        : 'Windows code signing enabled via WIN_CERTIFICATE_SUBJECT_NAME; publisherName defaults to the certificate subject name.'
    return state
  }

  if (configuredPublisherName) {
    state.logLevel = 'warning'
    state.message =
      'Windows signing config is incomplete (missing WIN_CERTIFICATE_SUBJECT_NAME or WINDOWS_CERTIFICATE_SUBJECT_NAME or WIN_CERT_SUBJECT_NAME). ' +
      'Skipping Windows code signing for this build.'
    return state
  }

  state.message =
    'Windows code signing disabled by default. Set WIN_CERTIFICATE_SUBJECT_NAME to enable it; WIN_PUBLISHER_NAME is optional.'
  return state
}
