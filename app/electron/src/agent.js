/**
 * @author oldj
 * @blog http://oldj.net
 *
 * 和系统、平台相关的方法
 */

'use strict';

const fs = require('fs');
const path = require('path');
const util = require('./libs/util');
const platform = process.platform;
console.log('platform: ', platform);
const sys_host_path = platform == 'win' ?
    'C:\\WINDOWS\\system32\\drivers\\etc\\hosts' :
    '/etc/hosts';
const work_path = path.join(util.getUserHome(), '.SwitchHosts');
const data_path = path.join(work_path, 'data.json');
const preference_path = path.join(work_path, 'preferences.json');


function getSysHosts() {
    let cnt = '';

    try {
        cnt = fs.readFileSync(sys_host_path, 'utf-8');
    } catch (e) {
        console.log(e.message);
    }

    return cnt;
}

function tryToCreateWorkDir() {
    if (util.isDirectory((work_path))) {
        console.log('work dir exists.');
        return;
    }

    console.log(`try to create work directory: ${work_path}`);
    try {
        fs.mkdirSync(work_path);
        console.log('work directory created.');
    } catch (e) {
        alert('Fail to create work directory!');
    }
}


// init
tryToCreateWorkDir();

module.exports = {
    getHosts: function () {
        let data = null;
        try {
            let cnt = fs.readFileSync(data_path, 'utf-8');
            data = JSON.parse(cnt);
        } catch (e) {
            console.log(e);
            return data;
        }

        return {
            sys: {
                content: getSysHosts()
            },
            list: data.list.map((i) => {
                return {
                    title: i.title || ''
                    , content: i.content || ''
                    , on: !!i.on
                    , where: i.where || 'local'
                    , url: i.url || ''
                    , last_refresh: i.last_refresh || null
                    , refresh_interval: i.refresh_interval || 0
                }
            })
        };
    }
};
