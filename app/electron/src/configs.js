/**
 * configs.js
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import path from 'path';
import * as util from './libs/util';
console.log(util.getUserHome());

export const work_path = path.join(util.getUserHome(), '.SwitchHosts');
export const data_path = work_path + '/data.json';
export const preference_path = work_path + '/preferences.json';

let _sys_host_path;
if (process.platform === 'win32') {
    // windows
    _sys_host_path = ''; // todo
} else {
    // macOS, linux
    _sys_host_path = '/etc/hosts';
}

export const sys_host_path = _sys_host_path;
