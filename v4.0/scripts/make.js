/**
 * build
 * @author: oldj
 * @homepage: https://oldj.net
 */

const version = require('../src/version.json')
const builder = require('electron-builder')
const execa = require('execa')
const fse = require('fs-extra')
const homedir = require('os').homedir()
const path = require('path')

const root_dir = path.normalize(path.join(__dirname, '..'))
const dist_dir = path.normalize(path.join(__dirname, '..', 'dist'))

const electronLanguages = ['en', 'zh_CN']

const TARGET_PLATFORMS_configs = {
  mac: {
    mac: ['default']
  },
  mas: {
    mac: ['mas']
  },
  macs: {
    mac: ['default', 'mas']
  },
  win: {
    win: ['nsis:ia32', 'portable:ia32']
  },
  all: {
    mac: ['default', 'mas'],
    linux: [/*'zip:x64', */'AppImage:x64'],
    win: ['nsis:ia32', 'nsis:x64', 'portable:ia32']
  }
}

const APP_NAME = 'SwitchHosts!'
const IDENTITY = 'Yingjie Wu'

const cfg_common = {
  copyright: `Copyright © ${(new Date()).getFullYear()}`,
  buildVersion: version[3].toString(),
  directories: {
    buildResources: 'build',
    app: 'build'
  },
  electronDownload: {
    cache: path.join(homedir, '.electron'),
    mirror: 'https://npm.taobao.org/mirrors/electron/'
  }
}

const sign = async () => {
  console.log('-> to sign...')
  let wd = process.cwd()
  process.chdir(__dirname)

  let cmd = path.join(__dirname, 'sign-mac.sh')
  try {
    const { stdout } = await execa(cmd)
    console.log(stdout)
  } catch (e) {
    //console.error(e)
    console.log(e.stdout)
    console.error(e.stderr)
  }

  process.chdir(wd)
}

const beforeMake = async () => {
  console.log('-> beforeMake...')
  fse.removeSync(dist_dir)
  fse.ensureDirSync(dist_dir)

  const to_cp = [
    [
      path.join(root_dir, 'assets', 'app.png'),
      path.join(root_dir, 'build', 'assets', 'app.png')
    ]
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
    'utf-8'
  )
}

const afterMake = async () => {
  console.log('-> afterMake...')
}

const makeDefault = async () => {
  console.log('-> makeDefault...')
  // forFullVersion.task(APP_NAME)

  await builder.build({
    //targets: Platform.MAC.createTarget(),
    ...TARGET_PLATFORMS_configs.mac,
    ...TARGET_PLATFORMS_configs.win,
    config: {
      ...cfg_common,
      appId: 'SwitchHosts',
      productName: APP_NAME,
      mac: {
        category: 'public.app-category.productivity',
        icon: 'assets/app.icns',
        gatekeeperAssess: false,
        electronLanguages,
        identity: IDENTITY,
        hardenedRuntime: true,
        entitlements: 'scripts/entitlements.mac.plist',
        entitlementsInherit: 'scripts/entitlements.mac.plist',
        provisioningProfile: 'scripts/app.provisionprofile',
        artifactName: '${productName}_${version}(${buildVersion}).${ext}'
      },
      dmg: {
        //backgroundColor: '#f1f1f6',
        background: 'assets/dmg-bg.png',
        //icon: 'assets/dmg-icon.icns',
        iconSize: 160,
        window: {
          width: 600,
          height: 420
        },
        contents: [{
          x: 150,
          y: 200
        }, {
          x: 450,
          y: 200,
          type: 'link',
          path: '/Applications'
        }],
        sign: false,
        artifactName: '${productName}_${version}(${buildVersion}).${ext}'
      },
      mas: {
        category: 'public.app-category.productivity',
        icon: 'assets/app.icns',
        //gatekeeperAssess: false,
        electronLanguages,
        identity: IDENTITY,
        entitlements: 'scripts/parent.plist',
        entitlementsInherit: 'scripts/child.plist',
        //artifactName: '${productName}_${version}(${buildVersion}).${ext}',
        binaries: []
      },
      win: {
        icon: 'assets/app.ico'
      },
      nsis: {
        installerIcon: 'assets/installer-icon.ico',
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        artifactName: '${productName}_Installer_${version}(${buildVersion}).${ext}'
      },
      portable: {
        artifactName: '${productName}_Portable_${version}(${buildVersion}).${ext}'
      },
      linux: {
        icon: 'assets/app.png',
        artifactName: '${productName}_linux_${version}(${buildVersion}).${ext}',
        category: 'Office'
      }
    }
  })

  console.log('done!')
}

(async () => {
  try {
    await beforeMake()

    //await makeMASLite()
    await makeDefault()

    await afterMake()
    await sign()

    console.log('-> meke Done!')
  } catch (e) {
    console.log(e)
  }
})()
