/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const fs = require('fs')
const paths = require('./paths')
const io = require('./io')

let is_loaded
let data = {}
let _t

function load () {
  if (io.isFile(paths.preference_path)) {
    let cnt = fs.readFileSync(paths.preference_path, 'utf-8')
    try {
      data = JSON.parse(cnt)
    } catch (e) {
      console.log(e)
    }
  }

  return data
}

function get (key, default_value = null) {
  if (!is_loaded) load()
  return key in data ? data[key] : default_value
}

function set (key, value, callback) {
  clearTimeout(_t)
  if (!is_loaded) load()

  data[key] = value
  _t = setTimeout(() => {
    fs.writeFile(paths.preference_path, JSON.stringify(data), 'utf-8', (err) => {
      if (err) {
        console.log(err)
      }
      typeof callback === 'function' && callback(err)
    })
  }, 100)
}

module.exports = {
  load: load,
  get: get,
  set: set
}
