/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Arch } from 'builder-util'
import chalk from 'chalk'
import { config as loadEnv } from 'dotenv'
import fse from 'fs-extra'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import artifactBuildCompletedHook from './hooks/artifactBuildCompleted.mjs'
import { prepareNotarizeEnv } from './hooks/notarize-options.mjs'
import { APP_NAME, distDir, electronLanguages, rootDir } from './vars.mjs'

loadEnv()

// Use CommonJS require for local JSON/package reads so the script stays portable
// across Node runtimes without relying on JSON import assertions.
const require = createRequire(import.meta.url)
const version = require('../src/version.json')
const PLATFORM_ORDER = ['mac', 'win', 'linux']
const PLATFORM_LABELS = {
  mac: 'macOS',
  win: 'Windows',
  linux: 'Linux',
}
const PLATFORM_COLORS = {
  mac: chalk.magenta,
  win: chalk.cyan,
  linux: chalk.green,
}

const TARGET_PLATFORMS_configs = {
  mac: {
    mac: ['dmg:x64', 'dmg:arm64'],
  },
  win: {
    win: ['nsis:ia32', 'nsis:x64', 'nsis:arm64', 'portable:x64'],
  },
  linux: {
    linux: ['AppImage:x64', 'AppImage:arm64', 'deb:x64', 'deb:arm64'],
  },
  all: {
    mac: ['dmg:x64', 'dmg:arm64', 'zip:universal'],
    win: ['nsis:ia32', 'nsis:x64', 'nsis:arm64', 'portable:x64', 'zip:x64' /* , 'appx:x64'*/],
    linux: ['AppImage:x64', 'AppImage:arm64', 'deb:x64', 'deb:arm64'],
  },
}

const { APP_BUNDLE_ID, IDENTITY, MAKE_FOR, SKIP_NOTARIZATION } = process.env
const appId = APP_BUNDLE_ID || 'SwitchHosts'
const fullVersion = `${version[0]}.${version[1]}.${version[2]}.${version[3]}`
const publishMode = process.env.PUBLISH_POLICY || 'never'

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

function logBanner(message) {
  console.log(chalk.bold.blue(`\n=== ${message} ===`))
}

function logStep(message) {
  console.log(chalk.blue(`-> ${message}`))
}

function logSuccess(message) {
  console.log(chalk.green(`✓ ${message}`))
}

function logWarning(message) {
  console.log(chalk.yellow(`! ${message}`))
}

function logPlatform(platform, message) {
  const color = PLATFORM_COLORS[platform] || chalk.white
  const label = PLATFORM_LABELS[platform] || platform
  console.log(color(`[${label}] ${message}`))
}

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

function getBuildPlan() {
  // Keep the old target matrix behavior, but normalize it into a single plan shape
  // so logging and timing can treat single-platform and multi-platform runs uniformly.
  cfgCommon.compression = 'maximum'

  if (MAKE_FOR === 'dev') {
    cfgCommon.compression = 'store'
    return [{ platform: 'mac', targets: TARGET_PLATFORMS_configs.mac.mac }]
  }

  if (MAKE_FOR === 'mac') {
    return [{ platform: 'mac', targets: TARGET_PLATFORMS_configs.mac.mac }]
  }

  if (MAKE_FOR === 'win') {
    return [{ platform: 'win', targets: TARGET_PLATFORMS_configs.win.win }]
  }

  if (MAKE_FOR === 'linux') {
    return [{ platform: 'linux', targets: TARGET_PLATFORMS_configs.linux.linux }]
  }

  return PLATFORM_ORDER.map((platform) => ({
    platform,
    targets: TARGET_PLATFORMS_configs.all[platform],
  }))
}

function createBuildTracker(plan) {
  // Track platform timing through electron-builder hooks so we keep a single
  // builder.build() invocation and avoid changing the packaging execution model.
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
      logPlatform(platform, `compression: ${cfgCommon.compression}`)
      logPlatform(
        platform,
        `notarization: ${MAKE_FOR === 'dev' || SKIP_NOTARIZATION ? 'disabled' : 'auto when credentials are available'}`,
      )
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
        await artifactBuildCompletedHook(context)

        if (!platform) {
          return
        }

        markFinished(platform)
        const targetName = context.target?.name || path.extname(context.file).slice(1)
        logPlatform(platform, `artifact ready (${targetName}): ${path.basename(context.file)}`)
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

function createBuilderConfig(hooks) {
  // Build the full electron-builder config in one place so every entrypoint
  // (`make`, `make:*`, `publish`) stays on the same packaging pipeline.
  return {
    ...cfgCommon,
    appId,
    productName: APP_NAME,
    mac: {
      type: 'distribution',
      category: 'public.app-category.productivity',
      icon: 'assets/app.icns',
      gatekeeperAssess: false,
      electronLanguages,
      identity: IDENTITY,
      hardenedRuntime: true,
      entitlements: 'scripts/entitlements.mac.plist',
      entitlementsInherit: 'scripts/entitlements.mac.plist',
      extendInfo: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleLocalizations: electronLanguages,
        CFBundleDevelopmentRegion: 'en',
      },
      artifactName: '${productName}-v' + fullVersion + '-${arch}-mac.${ext}',
      ...(MAKE_FOR === 'dev' || SKIP_NOTARIZATION ? { notarize: false } : {}),
    },
    dmg: {
      background: 'assets/dmg-bg.png',
      iconSize: 160,
      window: {
        width: 600,
        height: 420,
      },
      contents: [
        {
          x: 150,
          y: 200,
        },
        {
          x: 450,
          y: 200,
          type: 'link',
          path: '/Applications',
        },
      ],
      sign: false,
      artifactName: '${productName}-v' + fullVersion + '-mac-${arch}.${ext}',
    },
    win: {
      icon: 'assets/icon.ico',
      artifactName: '${productName}-v' + fullVersion + '-win-${arch}.${ext}',
    },
    nsis: {
      installerIcon: 'assets/installer-icon.ico',
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      deleteAppDataOnUninstall: false,
      shortcutName: 'SwitchHosts',
      artifactName: '${productName}-v' + fullVersion + '-win-${arch}-installer.${ext}',
    },
    portable: {
      artifactName: '${productName}-v' + fullVersion + '-win-${arch}-portable.${ext}',
    },
    linux: {
      icon: 'assets/app.icns',
      artifactName: '${productName}-v' + fullVersion + '-linux-${arch}.${ext}',
      category: 'Utility',
      synopsis: 'An App for hosts management and switching.',
      desktop: {
        entry: {
          Name: 'SwitchHosts',
          Type: 'Application',
          GenericName: 'An App for hosts management and switching.',
        },
      },
    },
    publish: {
      provider: 'github',
      owner: 'oldj',
      repo: 'SwitchHosts',
    },
    beforePack: hooks.beforePack,
    afterPack: hooks.afterPack,
    artifactBuildCompleted: hooks.artifactBuildCompleted,
  }
}

if (!APP_BUNDLE_ID) {
  logWarning('APP_BUNDLE_ID is not set, falling back to appId "SwitchHosts".')
}
logStep(`APP_BUNDLE_ID: ${APP_BUNDLE_ID || '(fallback: SwitchHosts)'}`)

const cfgCommon = {
  copyright: `Copyright © ${new Date().getFullYear()}`,
  buildVersion: version[3].toString(),
  directories: {
    buildResources: 'build',
    app: 'build',
    output: 'dist',
  },
  electronDownload: {
    cache: path.join(homedir(), '.electron'),
    mirror: 'https://registry.npmmirror.com/-/binary/electron/',
  },
  asar: true,
}

const beforeMake = async () => {
  const t0 = Date.now()
  logBanner('Prepare Build Directory')

  // Start every package run from a clean dist directory to avoid mixing artifacts
  // from different target sets or previous versions.
  fse.removeSync(distDir)
  fse.ensureDirSync(distDir)
  logStep(`dist cleaned: ${distDir}`)

  const toCopy = [[path.join(rootDir, 'assets', 'app.png'), path.join(rootDir, 'build', 'assets', 'app.png')]]

  toCopy.map(([src, target]) => {
    fse.copySync(src, target)
  })
  logStep(`copied build assets: ${toCopy.map(([src]) => path.basename(src)).join(', ')}`)

  let pkgBase = require(path.join(rootDir, 'package.json'))
  let pkgApp = require(path.join(rootDir, 'app', 'package.json'))

  // Refresh the app package manifest inside build/ so electron-builder always
  // packages the current dependency set and release version.
  pkgApp.name = APP_NAME
  pkgApp.version = version.slice(0, 3).join('.')
  pkgApp.dependencies = pkgBase.dependencies

  fse.writeFileSync(
    path.join(rootDir, 'build', 'package.json'),
    JSON.stringify(pkgApp, null, 2),
    'utf-8',
  )
  logSuccess(`build/package.json refreshed in ${formatDuration(Date.now() - t0)}`)
}

const afterMake = async () => {
  const t0 = Date.now()
  logBanner('Finalize Packaging')

  // Reserved for post-build cleanup or metadata fixes if packaging needs them later.
  logSuccess(`post-build steps finished in ${formatDuration(Date.now() - t0)}`)
}

const doMake = async () => {
  // Resolve the requested platform set first so every later step can log against
  // the same plan and timing model.
  const plan = getBuildPlan()
  const tracker = createBuildTracker(plan)
  const targetOptions = Object.fromEntries(plan.map(({ platform, targets }) => [platform, targets]))

  logBanner('Build Plan')
  logStep(`MAKE_FOR: ${MAKE_FOR || 'all'}`)
  logStep(`version: ${fullVersion}`)
  logStep(`appId: ${appId}`)
  logStep(`compression: ${cfgCommon.compression}`)
  logStep(`publish: ${publishMode}`)
  logStep(`platforms: ${plan.map(({ platform }) => PLATFORM_LABELS[platform]).join(', ')}`)

  if (!(MAKE_FOR === 'dev' || SKIP_NOTARIZATION)) {
    logStep('preparing notarization environment...')
    // Normalize official APPLE_* variables before electron-builder reads them.
    await prepareNotarizeEnv(process.env)
    logSuccess('notarization environment prepared')
  } else {
    logStep('skipping notarization environment preparation')
  }

  logStep('loading electron-builder...')
  const eb = await import('electron-builder')
  const builder = eb.default || eb
  logSuccess('electron-builder loaded')

  // Keep packaging in a single electron-builder invocation so cross-platform runs
  // behave the same as before while still emitting our custom timing logs.
  await builder.build({
    ...targetOptions,
    publish: publishMode,
    config: createBuilderConfig(tracker.hooks),
  })

  tracker.printSummary()
}

async function main() {
  const t0 = Date.now()
  try {
    // The top-level flow is intentionally linear: prepare inputs, run packaging,
    // then finish with summary output and any future cleanup.
    await beforeMake()
    await doMake()
    await afterMake()

    logBanner('Done')
    logSuccess(`total elapsed: ${formatDuration(Date.now() - t0)}`)
  } catch (e) {
    logBanner('Build Failed')
    console.error(chalk.red(e?.stack || String(e)))
    console.log(chalk.red(`total elapsed before failure: ${formatDuration(Date.now() - t0)}`))
    process.exit(1)
  }
}

await main()
