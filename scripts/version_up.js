/**
 * version_up
 * @author: oldj
 * @homepage: https://oldj.net
 */

const fs = require('fs')
const path = require('path')

const version_file = path.join(path.dirname(__dirname), 'src', 'version.json')
const version = require(version_file)

version[3]++

console.log(`version -> ${version.slice(0, 3).join('.')}(${version[3]})`)
fs.writeFileSync(version_file, `[${version.join(', ')}]`)
