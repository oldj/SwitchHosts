/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const fs = require('fs')
const path = require('path')
const makeId = require('../libs/make-id')
const version = require('../version')

module.exports = (work_path, sys_hosts_path) => {
  let is_dir = fs.existsSync(work_path) && fs.lstatSync(work_path).isDirectory()
  if (!is_dir) {
    fs.mkdirSync(work_path)
  }

  let cnt = fs.readFileSync(sys_hosts_path, 'utf-8')
  let fn_data = path.join(work_path, 'data.json')
  let data = {
    list: [{
      title: 'My hosts',
      id: makeId(),
      content: '# My hosts'
    }, {
      title: 'backup',
      id: makeId(),
      content: cnt
    }],
    version: version
  }
  fs.writeFileSync(fn_data, JSON.stringify(data), 'utf-8')
}
