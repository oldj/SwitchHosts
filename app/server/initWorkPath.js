/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const fs = require('fs')
const path = require('path')
const version = require('../version').version

module.exports = (work_path, sys_hosts_path) => {
  try {
    fs.mkdirSync(work_path)
  } catch (e) {
    console.log(e)
  }

  let cnt = fs.readFileSync(sys_hosts_path, 'utf-8')
  let fn_data = path.join(work_path, 'data.json')
  let data = {
    list: [{
      title: 'My hosts',
      content: '# My hosts'
    }, {
      title: 'backup',
      content: cnt
    }],
    version: version
  }
  fs.writeFileSync(fn_data, JSON.stringify(data), 'utf-8')
}
