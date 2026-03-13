import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildUpdaterMetadataMissingMessage,
  isVersionAheadOfLatestRelease,
  parseGithubRepositoryFromUpdaterConfig,
  shouldSkipUpdateCheckForUnpublishedBuild,
} from '../../src/main/core/updater-helpers'

describe('updater helpers', () => {
  it('parses github repository from packaged updater config', () => {
    expect(
      parseGithubRepositoryFromUpdaterConfig(
        ['provider: github', 'owner: oldj', 'repo: SwitchHosts'].join('\n'),
      ),
    ).toEqual({
      owner: 'oldj',
      repo: 'SwitchHosts',
    })
  })

  it('compares the packaged app version with the latest public release', () => {
    expect(isVersionAheadOfLatestRelease('4.3.0', 'v4.2.0')).toBe(true)
    expect(isVersionAheadOfLatestRelease('4.3.0', 'v4.3.0')).toBe(false)
    expect(isVersionAheadOfLatestRelease('4.3.0', 'not-a-version')).toBe(false)
  })

  it('skips update checks for packaged builds ahead of the latest public release', async () => {
    const resourcesPath = await fs.mkdtemp(path.join(os.tmpdir(), 'switchhosts-updater-test-'))
    await fs.writeFile(
      path.join(resourcesPath, 'app-update.yml'),
      ['provider: github', 'owner: oldj', 'repo: SwitchHosts'].join('\n'),
      'utf-8',
    )

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v4.2.0' }),
    })

    await expect(
      shouldSkipUpdateCheckForUnpublishedBuild(
        '/** invalid **/',
        resourcesPath,
        fetchImpl as typeof fetch,
      ),
    ).resolves.toBe(false)

    await expect(
      shouldSkipUpdateCheckForUnpublishedBuild('4.3.0', resourcesPath, fetchImpl as typeof fetch),
    ).resolves.toBe(true)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('builds a clearer release metadata error message', () => {
    const error = Object.assign(
      new Error(
        'Cannot find latest-mac.yml in the latest release artifacts (https://github.com/oldj/SwitchHosts/releases/download/v4.2.0/latest-mac.yml): HttpError: 404',
      ),
      {
        code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
      },
    )

    expect(buildUpdaterMetadataMissingMessage(error)).toContain('latest-mac.yml')
    expect(buildUpdaterMetadataMissingMessage(error)).toContain(
      'electron-updater cannot check for updates',
    )
  })
})
