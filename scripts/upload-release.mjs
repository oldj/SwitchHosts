import chalk from 'chalk'
import { config as loadEnv } from 'dotenv'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import prettyBytes from 'pretty-bytes'
import {
  getFullVersion,
  getReleaseTag,
  getReleaseVersion,
  isReleaseArtifactFile,
  resolveGithubRepository,
} from './release-config.mjs'
import {
  attachDiagnostic,
  buildDebugPayload,
  buildDiagnostic,
  formatDiagnosticSummary,
  formatRetrySummary,
} from './upload-diagnostics.mjs'
import { createUploadProgressTracker } from './upload-progress.mjs'

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
const retryAttempts = Math.max(
  1,
  Number.parseInt(process.env.RELEASE_UPLOAD_RETRY_ATTEMPTS, 10) || 3,
)
const retryBaseDelayMs = Math.max(
  250,
  Number.parseInt(process.env.RELEASE_UPLOAD_RETRY_BASE_DELAY_MS, 10) || 1500,
)
const retryMaxDelayMs = Math.max(
  retryBaseDelayMs,
  Number.parseInt(process.env.RELEASE_UPLOAD_RETRY_MAX_DELAY_MS, 10) || 10000,
)
const retryableStatusCodes = new Set([ 408, 409, 425, 429, 500, 502, 503, 504 ])
const debugDiagnostics = process.env.RELEASE_UPLOAD_DEBUG === '1'

function log(message) {
  console.log(`[release:upload] ${message}`)
}

function logFileList(files) {
  log('files:')
  files.forEach((file) => {
    console.log(`  - ${file.name} (${prettyBytes(file.size)})`)
  })
}

function getArtifactVersion(fileName) {
  const match = /-v(\d+\.\d+\.\d+\.\d+)-/.exec(fileName)
  return match ? match[1] : null
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getRetryDelayMs(attempt) {
  return Math.min(retryBaseDelayMs * 2 ** Math.max(attempt - 1, 0), retryMaxDelayMs)
}

function formatRetryDelay(ms) {
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`
}

function isRetryableStatus(status) {
  return retryableStatusCodes.has(status)
}

function isRetryableFetchError(error) {
  if (!(error instanceof Error)) {
    return false
  }

  const code =
    typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause
      ? String(error.cause.code || '')
      : ''
  const message = `${error.message} ${code}`.toLowerCase()

  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('eai_again') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('socket')
  )
}

function getProgressSnapshot(progressTracker) {
  return progressTracker?.getSnapshot() ?? null
}

function logDiagnosticDebug(error) {
  if (!debugDiagnostics) {
    return
  }

  const diagnostic = error instanceof Error && 'diagnostic' in error ? error.diagnostic : null
  const payload = buildDebugPayload(diagnostic, error)
  console.error(chalk.gray('[release:upload] debug diagnostic:'))
  console.error(chalk.gray(JSON.stringify(payload, null, 2)))
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
  const selectedFiles = files
    .filter((entry) => isReleaseArtifactFile(entry.name, fullVersion))
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(distDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return Promise.all(
    selectedFiles.map(async (file) => ({
      ...file,
      size: (await fs.stat(file.filePath)).size,
    })),
  )
}

async function githubRequest(
  pathname,
  { method = 'GET', body, headers = {}, stage = 'github-request', fileName = null } = {},
) {
  const requestUrl = `https://api.github.com${pathname}`

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    let response

    try {
      response = await fetch(requestUrl, {
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
    } catch (error) {
      const diagnostic = buildDiagnostic({
        attempt,
        error,
        fileName,
        maxAttempts: retryAttempts,
        method,
        retryable: isRetryableFetchError(error),
        stage,
        target: pathname,
      })

      if (attempt >= retryAttempts || !isRetryableFetchError(error)) {
        throw attachDiagnostic(error, diagnostic)
      }

      const delayMs = getRetryDelayMs(attempt)
      log(formatRetrySummary(diagnostic, formatRetryDelay(delayMs)))
      await sleep(delayMs)
      continue
    }

    if (!response.ok) {
      const text = await response.text()
      const error = new Error(`${method} ${pathname} failed: ${response.status} ${text}`)
      const diagnostic = buildDiagnostic({
        attempt,
        error,
        fileName,
        httpStatus: response.status,
        maxAttempts: retryAttempts,
        method,
        retryable: isRetryableStatus(response.status),
        stage,
        target: pathname,
      })

      if (attempt < retryAttempts && isRetryableStatus(response.status)) {
        const delayMs = getRetryDelayMs(attempt)
        log(formatRetrySummary(diagnostic, formatRetryDelay(delayMs)))
        await sleep(delayMs)
        continue
      }

      throw attachDiagnostic(error, diagnostic)
    }

    if (response.status === 204) {
      return null
    }

    return response.json()
  }

  throw new Error(`${method} ${pathname} failed after ${retryAttempts} attempts.`)
}

async function findReleaseByTag() {
  let page = 1
  const maxPages = 20

  while (page <= maxPages) {
    // The list API is used here because draft releases are not reliably addressable
    // through the single-release-by-tag endpoint.
    const releases = await githubRequest(
      `/repos/${repository.owner}/${repository.repo}/releases?per_page=100&page=${page}`,
      {
        stage: 'find-release',
      },
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
    stage: 'create-release',
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

async function deleteAsset(assetId, assetName) {
  await githubRequest(`/repos/${repository.owner}/${repository.repo}/releases/assets/${assetId}`, {
    method: 'DELETE',
    stage: 'delete-asset',
    fileName: assetName,
  })
}

async function tryDeleteAssetByName(releaseId, assetName) {
  try {
    const assets = await githubRequest(
      `/repos/${repository.owner}/${repository.repo}/releases/${releaseId}/assets?per_page=100`,
      { stage: 'list-assets', fileName: assetName },
    )
    const match = assets?.find((asset) => asset.name === assetName)
    if (match) {
      await deleteAsset(match.id, assetName)
    }
  } catch (_) {
    // Best-effort cleanup — don't block the retry if this fails.
  }
}

async function uploadAsset(uploadUrl, file, { fileIndex, releaseId, progressTracker } = {}) {
  const url = new URL(uploadUrl)
  url.searchParams.set('name', file.name)
  progressTracker?.startFile(file, fileIndex)

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const fileStream = createReadStream(file.filePath)
    const trackedStream = fileStream.pipe(
      new Transform({
        transform(chunk, encoding, callback) {
          progressTracker?.advance(chunk.byteLength)
          callback(null, chunk)
        },
      }),
    )

    let response

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Length': String(file.size),
          'Content-Type': 'application/octet-stream',
          'User-Agent': 'SwitchHosts-release-uploader',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: trackedStream,
        duplex: 'half',
      })
    } catch (error) {
      fileStream.destroy()
      trackedStream.destroy()
      const diagnostic = buildDiagnostic({
        attempt,
        error,
        fileIndex,
        fileName: file.name,
        maxAttempts: retryAttempts,
        method: 'POST',
        progressSnapshot: getProgressSnapshot(progressTracker),
        retryable: isRetryableFetchError(error),
        stage: 'upload-asset',
        target: url,
      })

      if (attempt < retryAttempts && isRetryableFetchError(error)) {
        const delayMs = getRetryDelayMs(attempt)
        await tryDeleteAssetByName(releaseId, file.name)
        progressTracker?.resetCurrentFile()
        progressTracker?.interrupt(`[release:upload] ${formatRetrySummary(diagnostic, formatRetryDelay(delayMs))}`)
        await sleep(delayMs)
        continue
      }

      progressTracker?.fail(file.name)
      throw attachDiagnostic(error, diagnostic)
    }

    if (!response.ok) {
      fileStream.destroy()
      trackedStream.destroy()
      const text = await response.text()
      const error = new Error(`Upload failed for ${file.name}: ${response.status} ${text}`)
      const diagnostic = buildDiagnostic({
        attempt,
        error,
        fileIndex,
        fileName: file.name,
        httpStatus: response.status,
        maxAttempts: retryAttempts,
        method: 'POST',
        progressSnapshot: getProgressSnapshot(progressTracker),
        retryable: isRetryableStatus(response.status),
        stage: 'upload-asset',
        target: url,
      })

      if (attempt < retryAttempts && isRetryableStatus(response.status)) {
        const delayMs = getRetryDelayMs(attempt)
        await tryDeleteAssetByName(releaseId, file.name)
        progressTracker?.resetCurrentFile()
        progressTracker?.interrupt(`[release:upload] ${formatRetrySummary(diagnostic, formatRetryDelay(delayMs))}`)
        await sleep(delayMs)
        continue
      }

      progressTracker?.fail(file.name)
      throw attachDiagnostic(error, diagnostic)
    }

    progressTracker?.completeFile()
    return response.json()
  }

  const exhaustedError = new Error(`Upload failed for ${file.name} after ${retryAttempts} attempts.`)
  progressTracker?.fail(file.name)
  throw attachDiagnostic(
    exhaustedError,
    buildDiagnostic({
      attempt: retryAttempts,
      error: exhaustedError,
      fileIndex,
      fileName: file.name,
      maxAttempts: retryAttempts,
      method: 'POST',
      progressSnapshot: getProgressSnapshot(progressTracker),
      retryable: false,
      stage: 'upload-asset',
      target: url,
    }),
  )
}

async function main() {
  const files = await readReleaseFiles()
  const totalFiles = files.length
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  if (files.length === 0) {
    throw new Error(`No release artifacts found in ${distDir} for version ${fullVersion}.`)
  }

  log(`repository: ${repository.fullName}`)
  log(`release version: ${releaseVersion}`)
  log(`release tag: ${releaseTag}`)
  log(`artifacts: ${totalFiles} files, ${prettyBytes(totalBytes)}`)
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
  const progressTracker = createUploadProgressTracker({
    totalBytes,
    totalFiles,
    log,
  })
  const logUploadStatus = (message) => progressTracker.interrupt(`[release:upload] ${message}`)

  for (const [ index, file ] of files.entries()) {
    const existingAsset = existingAssets.get(file.name)
    if (existingAsset) {
      // Replace same-name assets so different machines can safely append
      // or refresh artifacts for the same draft release.
      logUploadStatus(`replacing existing asset ${file.name}`)
      await deleteAsset(existingAsset.id, file.name)
    } else {
      logUploadStatus(`uploading new asset ${file.name}`)
    }

    await uploadAsset(uploadUrl, file, {
      fileIndex: index + 1,
      releaseId: release.id,
      progressTracker,
    })
  }

  progressTracker.finish()
  log(`done: ${release.html_url}`)
}

try {
  await main()
} catch (error) {
  const diagnostic = error instanceof Error && 'diagnostic' in error ? error.diagnostic : null
  const message = diagnostic ? formatDiagnosticSummary(diagnostic) : error instanceof Error ? error.message : String(error)
  console.error(chalk.red(`[release:upload] ${message}`))
  logDiagnosticDebug(error)
  process.exit(1)
}
