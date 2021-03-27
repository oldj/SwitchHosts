/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const fs = require('fs')
const path = require('path')
const io = require('./io')
const platform = process.platform

// Windows 系统有可能不安装在 C 盘
const sys_hosts_path = platform === 'win32' ? `${process.env.windir || 'C:\\WINDOWS'}\\system32\\drivers\\etc\\hosts` : '/etc/hosts'

const appRoot = path.dirname(__dirname)

function getApplicationPath() {
  if (process.platform === 'darwin') {
    return path.dirname(path.dirname(path.dirname(appRoot)))
  }

  return path.dirname(path.dirname(appRoot))
}

function getPortableDataPath() {
  if (process.env['SWITCHHOSTS_PORTABLE']) {
    return process.env['SWITCHHOSTS_PORTABLE'];
  }

  if (process.platform === 'win32' || process.platform === 'linux') {
    return path.join(getApplicationPath(), 'data');
  }

  return path.join(path.dirname(getApplicationPath()), '.SwitchHosts-Data');
}
const portableDataPath = getPortableDataPath()
const isPortable = fs.existsSync(portableDataPath)

const home_path = io.getUserHome()
const work_path = isPortable ? portableDataPath : path.join(home_path, '.SwitchHosts')
const data_path = path.join(work_path, 'data.json')
const preference_path = path.join(work_path, 'preferences.json')

if (!io.isDirectory(work_path) || !io.isFile(path.join(work_path, 'data.json'))) {
  try {
    require('./initWorkPath')(work_path, sys_hosts_path)
  } catch (e) {
    console.log(e)
    //dialog.showMessageBox({
    //  type: 'error',
    //  title: 'Error',
    //  message: e.message
    //})

    global.error = e
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
