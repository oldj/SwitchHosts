/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import chalk from 'chalk'
import { config as loadEnv } from 'dotenv'
import fse from 'fs-extra'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import artifactBuildCompletedHook from './hooks/artifactBuildCompleted.mjs'
import { PLATFORM_LABELS, formatDuration, logBanner, logPlatform, logStep, logSuccess, logWarning } from './libs/build-log.mjs'
import { createBuildTracker, getBuildPlan } from './libs/build-plan.mjs'
import { resolveMacBuildState, resolveWindowsBuildState } from './libs/build-state.mjs'
import { resolveGithubRepository } from './release-config.mjs'
import { APP_NAME, distDir, electronLanguages, rootDir } from './vars.mjs'

loadEnv()

// Use CommonJS require for local JSON/package reads so the script stays portable
// across Node runtimes without relying on JSON import assertions.
const require = createRequire(import.meta.url)
const version = require('../src/version.json')

const TARGET_PLATFORMS_CONFIGS = {
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

const { APP_BUNDLE_ID, IDENTITY, MAKE_FOR } = process.env
const appId = APP_BUNDLE_ID || 'SwitchHosts'
const fullVersion = `${version[0]}.${version[1]}.${version[2]}.${version[3]}`
const publishMode = process.env.PUBLISH_POLICY || 'never'
const githubRepository = resolveGithubRepository(process.env)
const WINDOWS_TIMESTAMP_SERVER = 'http://rfc3161timestamp.globalsign.com/advanced'

function createBuilderConfig(hooks, macBuildState, winBuildState) {
  // Build the full electron-builder config in one place so every entrypoint
  // (`make`, `make:*`) stays on the same packaging pipeline.
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
      identity: macBuildState.sign ? IDENTITY : null,
      hardenedRuntime: true,
      entitlements: 'scripts/entitlements.mac.plist',
      entitlementsInherit: 'scripts/entitlements.mac.plist',
      extendInfo: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleLocalizations: electronLanguages,
        CFBundleDevelopmentRegion: 'en',
      },
      artifactName: '${productName}-v' + fullVersion + '-${arch}-mac.${ext}',
      ...(macBuildState.notarize ? {} : { notarize: false }),
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
      sign: macBuildState.sign,
      artifactName: '${productName}-v' + fullVersion + '-mac-${arch}.${ext}',
    },
    win: {
      icon: 'assets/icon.ico',
      verifyUpdateCodeSignature: winBuildState.sign,
      signAndEditExecutable: winBuildState.sign,
      // NSIS/portable targets still try to sign final `.exe` artifacts unless
      // we explicitly exclude them when Windows signing is disabled.
      ...(winBuildState.sign ? {} : { signExts: ['!.exe'] }),
      ...(winBuildState.sign
        ? {
            signtoolOptions: {
              signingHashAlgorithms: ['sha256'],
              publisherName: winBuildState.publisherName,
              certificateSubjectName: winBuildState.certificateSubjectName,
              timeStampServer: WINDOWS_TIMESTAMP_SERVER,
              rfc3161TimeStampServer: WINDOWS_TIMESTAMP_SERVER,
            },
          }
        : {}),
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
      // Keep the GitHub provider configured so electron-builder emits update metadata
      // for GitHub Releases, while the actual asset upload stays in scripts/upload-release.mjs.
      provider: 'github',
      owner: githubRepository.owner,
      repo: githubRepository.repo,
      releaseType: 'draft',
      vPrefixedTagName: true,
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
  compression: 'maximum',
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
  const compression = MAKE_FOR === 'dev' ? 'store' : 'maximum'
  cfgCommon.compression = compression
  const plan = getBuildPlan(MAKE_FOR, TARGET_PLATFORMS_CONFIGS)
  const macBuildState = await resolveMacBuildState(plan)
  const winBuildState = resolveWindowsBuildState(plan)
  const tracker = createBuildTracker({
    plan,
    compression,
    macBuildState,
    winBuildState,
    artifactBuildCompletedHook,
  })

  logBanner('Build Plan')
  logStep(`MAKE_FOR: ${MAKE_FOR || 'all'}`)
  logStep(`version: ${fullVersion}`)
  logStep(`appId: ${appId}`)
  logStep(`compression: ${cfgCommon.compression}`)
  logStep(`publish: ${publishMode}`)
  logStep(`platforms: ${plan.map(({ platform }) => PLATFORM_LABELS[platform]).join(', ')}`)
  if (macBuildState.includesMac) {
    if (macBuildState.logLevel === 'warning') {
      logWarning(macBuildState.message)
    } else if (macBuildState.logLevel === 'success') {
      logSuccess(macBuildState.message)
    } else {
      logStep(macBuildState.message)
    }
  }
  if (winBuildState.includesWin) {
    if (winBuildState.logLevel === 'warning') {
      logWarning(winBuildState.message)
    } else if (winBuildState.logLevel === 'success') {
      logSuccess(winBuildState.message)
    } else {
      logStep(winBuildState.message)
    }
  }

  if (macBuildState.notarize) {
    logStep('notarization environment prepared')
  } else if (macBuildState.includesMac) {
    logStep('running macOS packaging without notarization')
  } else {
    logStep('skipping macOS notarization preparation')
  }

  logStep('loading electron-builder...')
  const eb = await import('electron-builder')
  const builder = eb.default || eb
  logSuccess('electron-builder loaded')

  // Build one platform per invocation so electron-builder's own logs stay grouped
  // and easy to read even when each platform expands to multiple arch/target jobs.
  for (const { platform, targets } of plan) {
    logPlatform(platform, 'starting electron-builder run...')
    await builder.build({
      [platform]: targets,
      publish: publishMode,
      config: createBuilderConfig(tracker.hooks, macBuildState, winBuildState),
    })
    logPlatform(platform, 'electron-builder run finished.')
  }

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
