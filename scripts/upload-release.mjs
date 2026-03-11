import chalk from 'chalk'
import { config as loadEnv } from 'dotenv'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getFullVersion,
  getReleaseTag,
  getReleaseVersion,
  isReleaseArtifactFile,
  resolveGithubRepository,
} from './release-config.mjs'

loadEnv()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.normalize(path.join(__dirname, '..'))
const distDir = path.join(rootDir, 'dist')

const dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
const token = process.env.GH_TOKEN
const repository = resolveGithubRepository(process.env)
const releaseTag = getReleaseTag(process.env)
const releaseVersion = getReleaseVersion()
const fullVersion = getFullVersion()

function log(message) {
  console.log(`[release:upload] ${message}`)
}

function logFileList(files) {
  log('files:')
  files.forEach((file) => {
    console.log(`  - ${file.name}`)
  })
}

function getArtifactVersion(fileName) {
  const match = /-v(\d+\.\d+\.\d+\.\d+)-/.exec(fileName)
  return match ? match[1] : null
}

async function readReleaseFiles() {
  const entries = await fs.readdir(distDir, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile())
  const mismatchedVersionedFiles = files
    .map((entry) => entry.name)
    .filter((fileName) => {
      const artifactVersion = getArtifactVersion(fileName)
      return artifactVersion && artifactVersion !== fullVersion
    })

  if (mismatchedVersionedFiles.length > 0) {
    throw new Error(
      `Cannot prepare GitHub Release assets for version ${fullVersion}.\n` +
        `Found old build artifacts in dist/: ${mismatchedVersionedFiles.join(', ')}\n` +
        `This usually means src/version.json was updated after the last package build, so only latest*.yml still matches.\n` +
        `Please rebuild the app for version ${fullVersion}, or clean dist/ before uploading.`,
    )
  }

  // Keep the asset picker strict so repeated uploads remain deterministic across machines.
  return files
    .filter((entry) => isReleaseArtifactFile(entry.name, fullVersion))
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(distDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function githubRequest(pathname, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'SwitchHosts-release-uploader',
      'X-GitHub-Api-Version': '2022-11-28',
      ...headers,
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${method} ${pathname} failed: ${response.status} ${text}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

async function findReleaseByTag() {
  let page = 1

  while (true) {
    // The list API is used here because draft releases are not reliably addressable
    // through the single-release-by-tag endpoint.
    const releases = await githubRequest(
      `/repos/${repository.owner}/${repository.repo}/releases?per_page=100&page=${page}`,
    )

    const found = releases.find((release) => release.tag_name === releaseTag)
    if (found) {
      return found
    }

    if (releases.length < 100) {
      return null
    }

    page += 1
  }
}

async function createDraftRelease() {
  return githubRequest(`/repos/${repository.owner}/${repository.repo}/releases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tag_name: releaseTag,
      name: releaseTag,
      draft: true,
      prerelease: false,
      generate_release_notes: false,
    }),
  })
}

function getUploadUrl(release) {
  return release.upload_url.replace(/\{.*$/, '')
}

async function deleteAsset(assetId) {
  await githubRequest(`/repos/${repository.owner}/${repository.repo}/releases/assets/${assetId}`, {
    method: 'DELETE',
  })
}

async function uploadAsset(uploadUrl, file) {
  const contents = await fs.readFile(file.filePath)
  const url = new URL(uploadUrl)
  url.searchParams.set('name', file.name)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Length': String(contents.byteLength),
      'Content-Type': 'application/octet-stream',
      'User-Agent': 'SwitchHosts-release-uploader',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: contents,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Upload failed for ${file.name}: ${response.status} ${text}`)
  }

  return response.json()
}

async function main() {
  const files = await readReleaseFiles()

  if (files.length === 0) {
    throw new Error(`No release artifacts found in ${distDir} for version ${fullVersion}.`)
  }

  log(`repository: ${repository.fullName}`)
  log(`release version: ${releaseVersion}`)
  log(`release tag: ${releaseTag}`)
  logFileList(files)

  if (dryRun) {
    log('dry run enabled, skipping GitHub API calls.')
    return
  }

  if (!token) {
    throw new Error('GH_TOKEN is required unless DRY_RUN=1 is set.')
  }

  let release = await findReleaseByTag()
  if (!release) {
    log(`release ${releaseTag} not found, creating draft release...`)
    release = await createDraftRelease()
  } else {
    log(`using existing release ${releaseTag} (draft=${release.draft}, prerelease=${release.prerelease})`)
  }

  const uploadUrl = getUploadUrl(release)
  const existingAssets = new Map(release.assets.map((asset) => [asset.name, asset]))

  for (const file of files) {
    const existingAsset = existingAssets.get(file.name)
    if (existingAsset) {
      // Replace same-name assets so different machines can safely append
      // or refresh artifacts for the same draft release.
      log(`replacing existing asset ${file.name}`)
      await deleteAsset(existingAsset.id)
    } else {
      log(`uploading new asset ${file.name}`)
    }

    await uploadAsset(uploadUrl, file)
  }

  log(`done: ${release.html_url}`)
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(chalk.red(`[release:upload] ${message}`))
  process.exit(1)
}
