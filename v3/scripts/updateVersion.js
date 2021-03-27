/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

//const path = require('path')
const fs = require('fs')

module.exports = (fn, pkgs) => {
  let version = require(fn)
  let ver0 = version.join('.')
  version[3]++
  let ver_str = version.join(', ')
  console.log(`version: ${ver0} -> ${version.join('.')}`)

  fs.writeFileSync(fn, `module.exports = [${ver_str}]`, 'utf-8')
  //fs.writeFileSync(path.join(base_dir, fn_ver), `module.exports = [${ver_str}]`)

  pkgs.map(pf => {
    if (fs.existsSync(pf)) {
      let pkg = require(pf)
      pkg.version = version.slice(0, 3).join('.')
      let c = JSON.stringify(pkg, null, 2)
      fs.writeFileSync(pf, c, 'utf-8')
    }
  })

  return version
}
