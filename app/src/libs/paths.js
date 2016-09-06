/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const path = require('path');
const util = require('./util');
const platform = process.platform;
const sys_host_path = platform == 'win32' ?
    'C:\\WINDOWS\\system32\\drivers\\etc\\hosts' : // todo 处理系统没有安装在 C 盘的情况
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
