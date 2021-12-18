/**
 * notarize.js
 *
 * @see https://oldj.net/blog/2019/12/29/electron-builder-sign-and-notarize-for-macos
 */

require('dotenv').config()
const { notarize } = require('electron-notarize')

exports.default = async function notarizing(context) {
  const appName = context.packager.appInfo.productFilename
  const { electronPlatformName, appOutDir } = context
  console.log(`in notarize, ${electronPlatformName}...`)
  if (electronPlatformName !== 'darwin') {
    return
  }

  if (process.env.MAKE_FOR === 'dev' || process.env.SKIP_NOTARIZATION) {
    console.log('skip notarization.')
    return // for dev, skip notarization
  }

  let appPath = `${appOutDir}/${appName}.app`
  let { appleId, appBundleId, ascProvider, appleIdPassword } = process.env
  if (!appleIdPassword) {
    appleIdPassword = `@keychain:Apple Notarize: ${appleId}`
  }

  if (!appleId || !appBundleId || !ascProvider || !appleIdPassword) {
    console.log('Not notarized.')
    return
  }

  console.log('Start notarizing...')
  await notarize({
    appBundleId,
    appPath,
    ascProvider,
    appleId,
    appleIdPassword,
  })
  console.log('Notarize done.')
}
