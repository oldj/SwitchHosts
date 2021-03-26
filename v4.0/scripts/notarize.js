/**
 * notarize.js
 *
 * @see https://oldj.net/blog/2019/12/29/electron-builder-sign-and-notarize-for-macos
 */

require('dotenv').config()
const {notarize} = require('electron-notarize')

exports.default = async function notarizing (context) {
  const appName = context.packager.appInfo.productFilename
  const {electronPlatformName, appOutDir} = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  let appPath = `${appOutDir}/${appName}.app`
  let {appleId, appBundleId, ascProvider, appleIdPassword} = process.env
  if (!appleIdPassword) {
    appleIdPassword = `@keychain:Application Loader: ${appleId}`
  }

  if (!appleId || !appBundleId || !ascProvider || !appleIdPassword) {
    console.log('Not notarized.')
    return
  }

  return await notarize({
    appBundleId,
    appPath,
    ascProvider,
    appleId,
    appleIdPassword
  })
}
