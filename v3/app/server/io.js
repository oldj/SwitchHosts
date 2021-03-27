/**
 * io
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const fs = require('fs')
const crypto = require('crypto')
const md5File = require('md5-file')

exports.getUserHome = () => {
  return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']
}

let isFile = exports.isFile = (p) => {
  try {
    if (fs.statSync(p).isFile()) {
      return true
    }
  } catch (e) {
  }
  return false
}

exports.isDirectory = (p) => {
  try {
    if (fs.statSync(p).isDirectory()) {
      return true
    }
  } catch (e) {
  }
  return false
}

let writeFile = exports.writeFile = (fn, data, callback) => {
  let cnt_md5 = crypto.createHash('md5').update(data).digest('hex')
  if (isFile(fn) && md5File.sync(fn) === cnt_md5) {
    callback()
  } else {
    console.log(`md5 not match, save new content to: [${fn}].`)
    fs.writeFile(fn, data, 'utf-8', callback)
  }
}

exports.pWriteFile = (fn, data) => {
  return new Promise((resolve, reject) => {
    writeFile(fn, data, (e, v) => e ? reject(e) : resolve(v))
  })
}

let readFile = exports.readFile = (fn, callback) => {
  if (!isFile(fn)) {
    callback(null, '')
  } else {
    fs.readFile(fn, 'utf-8', callback)
  }
}

exports.pReadFile = (fn) => {
  return new Promise((resolve, reject) => {
    readFile(fn, (e, v) => e ? reject(e) : resolve(v))
  })
}
