/**
 * io
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const fs = require('fs')

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
  fs.writeFile(fn, data, 'utf-8', callback)
}

exports.pWriteFile = (fn, data) => {
  return new Promise((resolve, reject) => {
    writeFile(fn, data, (e, v) => e ? reject(e) : resolve(v))
  })
}

let readFile = exports.readFile = (fn, callback) => {
  if (!isFile) {
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
