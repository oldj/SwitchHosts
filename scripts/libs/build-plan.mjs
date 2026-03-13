import { Arch } from 'builder-util'
import path from 'node:path'
import { PLATFORM_LABELS, formatDuration, logBanner, logPlatform } from './build-log.mjs'

export const PLATFORM_ORDER = ['mac', 'win', 'linux']

function resolvePlatformName(name) {
  const map = {
    darwin: 'mac',
    linux: 'linux',
    mac: 'mac',
    win: 'win',
    win32: 'win',
    windows: 'win',
  }

  return map[name] || null
}

function formatArch(arch) {
  if (arch == null) {
    return 'unknown'
  }

  return Arch[arch] || String(arch)
}

export function getBuildPlan(makeFor, targetPlatformsConfigs) {
  if (makeFor === 'dev') {
    return [{ platform: 'mac', targets: targetPlatformsConfigs.mac.mac }]
  }

  if (makeFor === 'mac') {
    return [{ platform: 'mac', targets: targetPlatformsConfigs.mac.mac }]
  }

  if (makeFor === 'win') {
    return [{ platform: 'win', targets: targetPlatformsConfigs.win.win }]
  }

  if (makeFor === 'linux') {
    return [{ platform: 'linux', targets: targetPlatformsConfigs.linux.linux }]
  }

  return PLATFORM_ORDER.map((platform) => ({
    platform,
    targets: targetPlatformsConfigs.all[platform],
  }))
}

export function createBuildTracker({ plan, compression, macBuildState, winBuildState, artifactBuildCompletedHook }) {
  // Track platform timing through electron-builder hooks while the outer loop
  // runs one platform build at a time for cleaner, non-interleaved logging.
  const stats = new Map(
    plan.map(({ platform, targets }) => [
      platform,
      {
        targets,
        startedAt: 0,
        finishedAt: 0,
      },
    ]),
  )

  function getStat(platform) {
    if (!stats.has(platform)) {
      stats.set(platform, {
        targets: [],
        startedAt: 0,
        finishedAt: 0,
      })
    }

    return stats.get(platform)
  }

  function markStarted(platform) {
    const stat = getStat(platform)

    if (!stat.startedAt) {
      stat.startedAt = Date.now()
      logBanner(`Build ${PLATFORM_LABELS[platform]}`)
      logPlatform(platform, `targets: ${stat.targets.join(', ')}`)
      logPlatform(platform, `compression: ${compression}`)
      if (platform === 'mac') {
        logPlatform(platform, `code signing: ${macBuildState.sign ? 'enabled' : 'disabled'}`)
        logPlatform(platform, `notarization: ${macBuildState.notarize ? 'enabled' : 'disabled'}`)
      } else if (platform === 'win') {
        logPlatform(platform, `code signing: ${winBuildState.sign ? 'enabled' : 'disabled'}`)
      } else {
        logPlatform(platform, 'notarization: disabled')
      }
    }

    return stat
  }

  function markFinished(platform) {
    const stat = getStat(platform)
    stat.finishedAt = Date.now()
    return stat
  }

  return {
    hooks: {
      beforePack(context) {
        const platform = resolvePlatformName(context.electronPlatformName)
        if (!platform) {
          return
        }

        markStarted(platform)
        // beforePack fires for each arch-specific app bundle preparation.
        logPlatform(platform, `packaging app bundle for ${formatArch(context.arch)}...`)
      },

      afterPack(context) {
        const platform = resolvePlatformName(context.electronPlatformName)
        if (!platform) {
          return
        }

        markFinished(platform)
        logPlatform(platform, `app bundle ready for ${formatArch(context.arch)}`)
      },

      async artifactBuildCompleted(context) {
        const platform = resolvePlatformName(context.packager?.platform?.name)
        if (platform) {
          markStarted(platform)
        }

        // Reuse the DMG notarization hook from the packaging config so logging and
        // timing stay in one place while the notarization logic remains isolated.
        const artifactFile = context.file || ''
        const isMacDmg = platform === 'mac' && path.extname(artifactFile) === '.dmg'
        if (isMacDmg && !macBuildState.notarize) {
          logPlatform(platform, `skipping dmg notarization: ${path.basename(artifactFile)}`)
        } else {
          await artifactBuildCompletedHook(context)
        }

        if (!platform) {
          return
        }

        markFinished(platform)
        const targetName = context.target?.name || path.extname(artifactFile).slice(1)
        logPlatform(platform, `artifact ready (${targetName}): ${path.basename(artifactFile)}`)
      },
    },

    printSummary() {
      logBanner('Build Summary')
      for (const { platform } of plan) {
        const stat = getStat(platform)
        const elapsed = stat.startedAt && stat.finishedAt ? stat.finishedAt - stat.startedAt : 0
        logPlatform(platform, `elapsed: ${elapsed > 0 ? formatDuration(elapsed) : 'n/a'}`)
      }
    },
  }
}
