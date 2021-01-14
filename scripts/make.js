/**
 * build
 * @author: oldj
 * @homepage: https://oldj.net
 */

const path = require('path')
const builder = require('electron-builder')
const homedir = require('os').homedir()
const moment = require('moment')
//const Platform = builder.Platform
const version = require('../app/version')
//const dist_dir = path.normalize(path.join(__dirname, '..', 'dist'))

const cfg_common = {
  appId: 'SwitchHosts',
  productName: 'SwitchHosts!',
  copyright: moment().format('Y'),
  buildVersion: version[3],
  directories: {
    buildResources: 'app',
    app: 'app'
  },
  electronDownload: {
    cache: path.join(homedir, '.electron'),
    mirror: 'https://npm.taobao.org/mirrors/electron/'
  }
}

const makeApp = async () => {
  await builder.build({
    //targets: Platform.MAC.createTarget(),
    mac: ['default'], // ['default', 'mas'],
    win: ['nsis:ia32', 'nsis:x64', 'portable:ia32'],
    linux: ['zip:x64', 'AppImage:x64'],
    config: {
      ...cfg_common,
      mac: {
        category: 'public.app-category.productivity',
        icon: 'assets/app.icns',
        gatekeeperAssess: false,
        hardenedRuntime: true,
        entitlements: 'scripts/entitlements.mac.plist',
        entitlementsInherit: 'scripts/entitlements.mac.plist',
        artifactName: '${productName}_macOS_${version}(${buildVersion}).${ext}'
      },
      dmg: {
        backgroundColor: '#f1f1f6',
        //background: 'assets/dmg-bg.png',
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
        artifactName: '${productName}_macOS_${version}(${buildVersion}).${ext}'
      },
      win: {
        icon: 'assets/app.ico',
        requestedExecutionLevel: 'requireAdministrator'
      },
      nsis: {
        //installerIcon: 'assets/installer-icon.ico',
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        artifactName: '${productName}_windows_installer_${version}(${buildVersion}).${ext}'
      },
      portable: {
        artifactName: '${productName}_windows_portable_${version}(${buildVersion}).${ext}'
      },
      linux: {
        category: 'Development',
        artifactName: '${productName}_linux_${arch}_${version}(${buildVersion}).${ext}'
      }
    }
  })

  console.log('done!')
}

(async () => {
  await makeApp()
})()
