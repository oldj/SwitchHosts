import { compareVersions } from 'compare-versions'
import { promises as fs } from 'node:fs'
import path from 'node:path'

interface GithubRepository {
  owner: string
  repo: string
}

interface GithubLatestReleaseResponse {
  tag_name?: string
}

export function parseGithubRepositoryFromUpdaterConfig(
  configContent: string,
): GithubRepository | null {
  const provider = configContent.match(/^\s*provider:\s*([^\s#]+)\s*$/m)?.[1]
  if (provider !== 'github') {
    return null
  }

  const owner = configContent.match(/^\s*owner:\s*([^\s#]+)\s*$/m)?.[1]
  const repo = configContent.match(/^\s*repo:\s*([^\s#]+)\s*$/m)?.[1]
  if (!owner || !repo) {
    return null
  }

  return { owner, repo }
}

export async function readPackagedGithubRepository(
  resourcesPath: string,
): Promise<GithubRepository | null> {
  const updateConfigPath = path.join(resourcesPath, 'app-update.yml')
  const updateConfig = await fs.readFile(updateConfigPath, 'utf-8')
  return parseGithubRepositoryFromUpdaterConfig(updateConfig)
}

export function normalizeReleaseVersion(tagName?: string | null): string | null {
  if (!tagName) {
    return null
  }

  const version = tagName.trim().replace(/^v/i, '')
  return /^\d+\.\d+\.\d+$/.test(version) ? version : null
}

export function isVersionAheadOfLatestRelease(
  currentVersion: string,
  latestReleaseTag?: string | null,
): boolean {
  const latestReleaseVersion = normalizeReleaseVersion(latestReleaseTag)
  if (!latestReleaseVersion) {
    return false
  }

  try {
    return compareVersions(currentVersion, latestReleaseVersion) > 0
  } catch {
    return false
  }
}

export async function shouldSkipUpdateCheckForUnpublishedBuild(
  currentVersion: string,
  resourcesPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const repository = await readPackagedGithubRepository(resourcesPath)
  if (!repository) {
    return false
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SwitchHosts-updater',
      },
    },
  )

  if (!response.ok) {
    return false
  }

  const latestRelease = (await response.json()) as GithubLatestReleaseResponse
  return isVersionAheadOfLatestRelease(currentVersion, latestRelease.tag_name)
}

function isUpdaterChannelFileNotFound(error: unknown): error is Error & { code?: string } {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
  )
}

export function buildUpdaterMetadataMissingMessage(error: unknown): string | null {
  if (!isUpdaterChannelFileNotFound(error)) {
    return null
  }

  const originalMessage = error.message || 'Updater metadata file is missing.'
  const missingFile =
    originalMessage.match(/Cannot find ([^ ]+) in the latest release artifacts/i)?.[1] ||
    'latest*.yml'

  return (
    `Update metadata file ${missingFile} is missing from the latest GitHub release artifacts, ` +
    `so electron-updater cannot check for updates.`
  )
}
