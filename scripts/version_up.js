/**
 * version_up
 * @author: oldj
 * @homepage: https://oldj.net
 */

const fs = require('fs')
const path = require('path')

const version_file = path.join(path.dirname(__dirname), 'src', 'version.json')
const version = require(version_file)
const app_package = require('../app/package.json')

const versionInc = (v) => {
  return ++v
}

version[3] = versionInc(version[3])

console.log(`version -> ${version.slice(0, 3).join('.')}(${version[3]})`)
fs.writeFileSync(version_file, `[${version.join(', ')}]`)

app_package.version = version.slice(0, 3).join('.') + '.' + version[3]
fs.writeFileSync(
  path.join(path.dirname(__dirname), 'app', 'package.json'),
  JSON.stringify(app_package, null, 2),
  'utf8',
)
