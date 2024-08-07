/**
 * make.js
 * @author: oldj
 * @homepage: https://oldj.net
 */

require('dotenv').config()
const path = require('path')
const fse = require('fs-extra')
const version = require('../src/version.json')
const builder = require('electron-builder')
const homedir = require('os').homedir()
const { APP_NAME, root_dir, dist_dir, electronLanguages } = require('./vars')

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

const { APP_BUNDLE_ID, IDENTITY } = process.env
console.log(`APP_BUNDLE_ID: ${APP_BUNDLE_ID}`)

const cfg_common = {
  copyright: `Copyright © ${new Date().getFullYear()}`,
  buildVersion: version[3].toString(),
  directories: {
    buildResources: 'build',
    app: 'build',
  },
  electronDownload: {
    cache: path.join(homedir, '.electron'),
    mirror: 'https://registry.npmmirror.com/-/binary/electron/',
  },
  asar: true,
}

const beforeMake = async () => {
  console.log('-> beforeMake...')
  fse.removeSync(dist_dir)
  fse.ensureDirSync(dist_dir)

  const to_cp = [
    [path.join(root_dir, 'assets', 'app.png'), path.join(root_dir, 'build', 'assets', 'app.png')],
  ]

  to_cp.map(([src, target]) => {
    fse.copySync(src, target)
  })

  let pkg_base = require(path.join(root_dir, 'package.json'))
  let pkg_app = require(path.join(root_dir, 'app', 'package.json'))

  pkg_app.name = APP_NAME
  pkg_app.version = version.slice(0, 3).join('.')
  pkg_app.dependencies = pkg_base.dependencies

  fse.writeFileSync(
    path.join(root_dir, 'build', 'package.json'),
    JSON.stringify(pkg_app, null, 2),
    'utf-8',
  )
}

const afterMake = async () => {
  console.log('-> afterMake...')
}

const doMake = async () => {
  console.log('-> make...')

  const { MAKE_FOR } = process.env
  let targets = TARGET_PLATFORMS_configs.all

  cfg_common.compression = 'maximum'

  if (MAKE_FOR === 'dev') {
    targets = TARGET_PLATFORMS_configs.mac
    cfg_common.compression = 'store'
  } else if (MAKE_FOR === 'mac') {
    targets = TARGET_PLATFORMS_configs.mac
  } else if (MAKE_FOR === 'win') {
    targets = TARGET_PLATFORMS_configs.win
  } else if (MAKE_FOR === 'linux') {
    targets = TARGET_PLATFORMS_configs.linux
  }

  await builder.build({
    //targets: Platform.MAC.createTarget(),
    ...targets,
    config: {
      ...cfg_common,
      appId: 'SwitchHosts',
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
        notarize: false,
      },
      dmg: {
        //backgroundColor: '#f1f1f6',
        background: 'assets/dmg-bg.png',
        //icon: 'assets/dmg-icon.icns',
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
        artifactName: '${productName}_mac_${arch}_${version}(${buildVersion}).${ext}',
      },
      win: {
        icon: 'assets/icon.ico',
        //requestedExecutionLevel: 'requireAdministrator'
      },
      nsis: {
        installerIcon: 'assets/installer-icon.ico',
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        deleteAppDataOnUninstall: false,
        shortcutName: 'SwitchHosts',
        artifactName: '${productName}_windows_installer_${arch}_${version}(${buildVersion}).${ext}',
      },
      portable: {
        artifactName: '${productName}_windows_portable_${arch}_${version}(${buildVersion}).${ext}',
      },
      linux: {
        icon: 'assets/app.icns',
        artifactName: '${productName}_linux_${arch}_${version}(${buildVersion}).${ext}',
        category: 'Utility',
        synopsis: 'An App for hosts management and switching.',
        desktop: {
          Name: 'SwitchHosts',
          Type: 'Application',
          GenericName: 'An App for hosts management and switching.',
        },
      },
      publish: {
        provider: 'github',
        owner: 'oldj',
        repo: 'SwitchHosts',
      },
    },
  })

  console.log('done!')
}

;(async () => {
  try {
    await beforeMake()
    await doMake()
    await afterMake()
    //await macSign()

    console.log('-> make Done!')
  } catch (e) {
    console.log(e)
  }
})()
