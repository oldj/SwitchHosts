/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const path = require('path')
const {dialog} = require('electron')
const io = require('./io')
const platform = process.platform

// Windows 系统有可能不安装在 C 盘
const sys_hosts_path = platform === 'win32' ? `${process.env.windir || 'C:\\WINDOWS'}\\system32\\drivers\\etc\\hosts` : '/etc/hosts'

const home_path = io.getUserHome()
const work_path = path.join(home_path, '.SwitchHosts')
const data_path = path.join(work_path, 'data.json')
const preference_path = path.join(work_path, 'preferences.json')

if (!io.isDirectory(work_path) || !io.isFile(path.join(work_path, 'data.json'))) {
  try {
    require('./initWorkPath')(work_path, sys_hosts_path)
  } catch (e) {
    console.log(e)
    dialog.showMessageBox({
      type: 'error',
      title: 'Error',
      message: e.message
    })
  }
}

module.exports = {
  home_path: home_path
  , work_path: work_path
  , data_path: data_path
  , preference_path: preference_path
  , sys_hosts_path: sys_hosts_path
  // ,current_app_path: getCurrentAppPath()
}
