/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.dirname(__dirname)
const versionFile = path.join(rootDir, 'src', 'version.json')
const appPackageFile = path.join(rootDir, 'app', 'package.json')
const version = JSON.parse(fs.readFileSync(versionFile, 'utf8'))
const appPackage = JSON.parse(fs.readFileSync(appPackageFile, 'utf8'))

const versionInc = (v) => {
  return ++v
}

version[3] = versionInc(version[3])

console.log(`version -> ${version.slice(0, 3).join('.')}(${version[3]})`)
fs.writeFileSync(versionFile, `[${version.join(', ')}]`)

appPackage.version = version.slice(0, 3).join('.') + '.' + version[3]
fs.writeFileSync(
  appPackageFile,
  JSON.stringify(appPackage, null, 2),
  'utf8',
)
