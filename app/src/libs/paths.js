/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const path = require('path');
const util = require('./util');
const platform = process.platform;
const sys_host_path = platform == 'win32' ?
    `${process.env.windir || 'C:\\WINDOWS'}\\system32\\drivers\\etc\\hosts` : // Windows 系统有可能不安装在 C 盘
    '/etc/hosts';
const home_path = util.getUserHome();
const work_path = path.join(home_path, '.SwitchHosts');
const data_path = path.join(work_path, 'data.json');
const preference_path = path.join(work_path, 'preferences.json');

module.exports = {
    home_path: home_path,
    work_path: work_path,
    data_path: data_path,
    preference_path: preference_path,
    sys_host_path: sys_host_path
};
