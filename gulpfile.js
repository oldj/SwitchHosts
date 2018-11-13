/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

/**
 * 注：ELECTRON_VERSION 为对应的 Electron 版本
 * 直接运行命令会自动下载对应文件，
 * 也可手动从 https://github.com/electron/electron/releases 下载最新版本，放到 ~/.electron 目录下
 * 淘宝镜像：https://npm.taobao.org/mirrors/electron/
 */
const ELECTRON_VERSION = '2.0.7'

const fs = require('fs')
const path = require('path')
// const util = require('util');
const exec = require('child_process').exec
const gulp = require('gulp')
// const shell = require('gulp-shell')
// const webpack = require('webpack')
const beautify = require('js-beautify').js_beautify

const args = require('yargs').argv
//console.log(args)
// const IS_DEBUG = !!args.debug;
// const TPL_FILE_INFO = "echo '> (DEBUG " + (IS_DEBUG ? "on" : "off") + ") <%= file.path %>'";

gulp.task('ver', (done) => {
  let fn = path.join(__dirname, 'app', 'version.js')
  let version = require('./app/version').version
  version[3]++

  console.log(`version -> ${version.join('.')}`)

  let cnt = `exports.version = ${JSON.stringify(version)};`
  fs.writeFileSync(fn, cnt, 'utf-8')

  function updatePackage (fn) {
    cnt = fs.readFileSync(fn)
    let d = JSON.parse(cnt)
    d.version = version.slice(0, 3).join('.')
    cnt = beautify(JSON.stringify(d), {indent_size: 2})
    fs.writeFileSync(fn, cnt, 'utf-8')
  }

  // update package.json
  updatePackage(path.join(__dirname, 'package.json'))
  updatePackage(path.join(__dirname, 'app', 'package.json'))

  done()
})

gulp.task('pack', (done) => {
  let version = require('./app/version').version
  let v1 = version.slice(0, 3).join('.')
  let v2 = version[3]

  let pack = {}
  pack.macOS = `
# for macOS
electron-packager ./app 'SwitchHosts!' --platform=darwin --arch=x64 --electron-version=${ELECTRON_VERSION} --overwrite --asar=true --prune --icon=./assets/app.icns --ignore=node_modules/.bin --ignore=.git --ignore=${__dirname}/dist --ignore="node_modules/electron-(?!(?:window-state)).*" --out=dist --app-version=${v1} --build-version=${v2}
`
  pack.win64 = `
# for windows x64
electron-packager ./app 'SwitchHosts!' --platform=win32  --arch=x64 --electron-version=${ELECTRON_VERSION} --overwrite --asar=true --prune --icon=./assets/app.ico  --ignore=node_modules/.bin --ignore=.git --ignore=${__dirname}/dist --ignore="node_modules/electron-(?!(?:window-state)).*" --out=dist --app-version=${v1} --build-version=${v2}
`
  pack.win32 = `
# for windows ia32
electron-packager ./app 'SwitchHosts!' --platform=win32  --arch=ia32 --electron-version=${ELECTRON_VERSION} --overwrite --asar=true --prune --icon=./assets/app.ico  --ignore=node_modules/.bin --ignore=.git --ignore=${__dirname}/dist --ignore="node_modules/electron-(?!(?:window-state)).*" --out=dist --app-version=${v1} --build-version=${v2}
`
  pack.linux = `
# for linux x86_64
electron-packager ./app 'SwitchHosts!' --platform=linux  --arch=x64 --electron-version=${ELECTRON_VERSION} --overwrite --asar=true --prune --icon=./assets/app.ico  --ignore=node_modules/.bin --ignore=.git --ignore=${__dirname}/dist --ignore="node_modules/electron-(?!(?:window-state)).*" --out=dist --app-version=${v1} --build-version=${v2}
`

  let cmds = []
  if (!args.platform) {
    cmds = [pack.macOS, pack.win64, pack.win32, pack.linux]
  } else {
    let a = args.platform.split(',')
    a.map(i => cmds.push(pack[i] || ''))
  }

  console.log(`start packing, v: ${v1}.${v2} ..`)
  console.log(cmds.join('\n'))
  exec(cmds.join('\n'), (error, stdout, stderr) => {
    console.log('end pack.')
    if (error) {
      console.error(`exec error: ${error}`)
    }
    // if (stdout) console.log(`${stdout}`);
    // if (stderr) console.log(`${stderr}`);

    done()
  })
})

gulp.task('zip', (done) => {
  let version = require('./app/version').version
  let v = version.join('.')

  let cmds = `
cd ./dist
rm -f ./SwitchHosts-*.zip
zip -ry SwitchHosts-macOS-x64_v${v}.zip ./SwitchHosts\\!-darwin-x64/SwitchHosts\\!.app
zip -ry SwitchHosts-win32-x64_v${v}.zip ./SwitchHosts\\!-win32-x64
zip -ry SwitchHosts-win32-ia32_v${v}.zip ./SwitchHosts\\!-win32-ia32
zip -ry SwitchHosts-linux-x64_v${v}.zip ./SwitchHosts\\!-linux-x64
cd ..
`

  console.log(`start zip ..`)
  exec(cmds, (error, stdout, stderr) => {
    console.log('end zip.')
    if (error) {
      console.error(`exec error: ${error}`)
    }
    // if (stdout) console.log(`${stdout}`);
    // if (stderr) console.log(`${stderr}`);
    done()
  })

})

gulp.task('default', () => {
  //gulp.start('webpack')

  gulp.watch([
    'app/**/*.*'
    , '!app/bundle.*'
    , '!app/node_modules/*'
    , '!app/package.json'
    , '!app/version.js'

    , 'app-ui/**/*.*'
    , '!app-ui/node_modules/*'
  ], ['ver'])
})

