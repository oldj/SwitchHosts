import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const version = require('../src/version.json')

export const DEFAULT_GITHUB_REPOSITORY = 'oldj/SwitchHosts'

export function getReleaseVersion() {
  return version.slice(0, 3).join('.')
}

export function getFullVersion() {
  return `${version[0]}.${version[1]}.${version[2]}.${version[3]}`
}

export function getReleaseTag(env = process.env) {
  const expectedTag = `v${getReleaseVersion()}`
  const tag = env.RELEASE_TAG || expectedTag

  // Keep GitHub Release tags aligned with the app's public semver so
  // the uploader cannot silently publish assets under a mismatched tag.
  if (tag !== expectedTag) {
    throw new Error(`RELEASE_TAG must be "${expectedTag}", got "${tag}".`)
  }

  return tag
}

export function resolveGithubRepository(env = process.env) {
  const rawRepository =
    env.GH_RELEASE_REPOSITORY || env.GITHUB_REPOSITORY || DEFAULT_GITHUB_REPOSITORY

  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(rawRepository || '')
  if (!match) {
    throw new Error(
      `Invalid GitHub repository "${rawRepository}". Expected the format "owner/repo".`,
    )
  }

  const [, owner, repo] = match

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  }
}

export function isReleaseArtifactFile(fileName, fullVersion = getFullVersion()) {
  if (!fileName || fileName.startsWith('.')) {
    return false
  }

  // builder-debug.yml is useful locally, but publishing it would only clutter the release page.
  if (fileName === 'builder-debug.yml') {
    return false
  }

  // latest*.yml files are required by electron-updater to discover GitHub-hosted updates.
  if (/^latest.*\.ya?ml$/i.test(fileName)) {
    return true
  }

  return fileName.includes(`v${fullVersion}`)
}
