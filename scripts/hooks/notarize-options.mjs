import { execFile } from 'node:child_process'
import { isEnvFlagEnabled } from '../libs/build-env.mjs'

function getPasswordFromKeychain(account, service) {
  return new Promise((resolve, reject) => {
    execFile(
      'security',
      ['find-generic-password', '-a', account, '-s', service, '-w'],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
          return
        }

        resolve(stdout.trim())
      },
    )
  })
}

export async function prepareNotarizeEnv(env = process.env) {
  if (isEnvFlagEnabled(env.SKIP_NOTARIZATION) || env.MAKE_FOR === 'dev') {
    return env
  }

  if (!env.APPLE_TEAM_ID && env.TEAM_ID) {
    env.APPLE_TEAM_ID = env.TEAM_ID
  }

  const hasCompleteCredentials =
    !!env.APPLE_KEYCHAIN_PROFILE ||
    (!!env.APPLE_API_KEY && !!env.APPLE_API_KEY_ID && !!env.APPLE_API_ISSUER) ||
    (!!env.APPLE_ID && !!env.APPLE_APP_SPECIFIC_PASSWORD && !!env.APPLE_TEAM_ID)

  if (hasCompleteCredentials || !env.APPLE_ID) {
    return env
  }

  try {
    env.APPLE_APP_SPECIFIC_PASSWORD = await getPasswordFromKeychain(
      env.APPLE_ID,
      `Apple Notarize: ${env.APPLE_ID}`,
    )
  } catch (error) {
    console.log(`Legacy notarization keychain lookup skipped: ${error.message}`)
  }

  return env
}

export function hasNotarizeCredentials(env = process.env) {
  return Boolean(
    env.APPLE_KEYCHAIN_PROFILE ||
      (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
      (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID),
  )
}

export async function getNotarizeOptions(appPath, env = process.env) {
  await prepareNotarizeEnv(env)

  const {
    APPLE_API_KEY: appleApiKey,
    APPLE_API_KEY_ID: appleApiKeyId,
    APPLE_API_ISSUER: appleApiIssuer,
    APPLE_ID: appleId,
    APPLE_APP_SPECIFIC_PASSWORD: appleIdPassword,
    APPLE_KEYCHAIN: keychain,
    APPLE_KEYCHAIN_PROFILE: keychainProfile,
    APPLE_TEAM_ID: teamId,
  } = env

  const tool = 'notarytool'

  if (appleId || appleIdPassword) {
    if (!appleId) {
      throw new Error('APPLE_ID env var needs to be set')
    }
    if (!appleIdPassword) {
      throw new Error('APPLE_APP_SPECIFIC_PASSWORD env var needs to be set')
    }
    if (!teamId) {
      throw new Error('APPLE_TEAM_ID env var needs to be set')
    }
    return { tool, appPath, appleId, appleIdPassword, teamId }
  }

  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error('Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set')
    }
    return { tool, appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
  }

  if (keychainProfile) {
    return {
      tool,
      appPath,
      keychainProfile,
      ...(keychain ? { keychain } : {}),
    }
  }

  return null
}
