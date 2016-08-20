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
var sudo = require('sudo-prompt');
const platform = process.platform;
console.log('platform: ', platform);
const sys_host_path = platform == 'win' ?
    'C:\\WINDOWS\\system32\\drivers\\etc\\hosts' : // todo 处理系统没有安装在 C 盘的情况
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

function tryToApply(content, success) {
    let tmp_fn = path.join(work_path, 'tmp.txt');
    let cmd_fn = path.join(work_path, 'cmd.sh');
    fs.writeFileSync(tmp_fn, content, 'utf-8');

    let options = {
        name: 'SwitchHosts'
        //icns: '/Applications/Electron.app/Contents/Resources/Electron.icns', // (optional)
    };
    let cmd;
    let cmd_lines = [];

    if (platform === 'win32') {
        // windows
        cmd = '';

    } else {
        // unix like
        cmd_lines = cmd_lines.concat([
            `cat ${tmp_fn} > ${sys_host_path}`
            , 'launchctl unload -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
            , 'launchctl load -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
            , 'launchctl unload -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
            , 'launchctl load -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
            , 'killall -HUP mDNSResponder'
        ]);

        fs.writeFileSync(cmd_fn, cmd_lines.join('\n'), 'utf-8');
        cmd = `/bin/sh ${cmd_fn}`;
    }

    sudo.exec(cmd, options, function(error, stdout, stderr) {
        if (error) {
            alert(error.message);
            return;
        }
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);

        if (typeof success === 'function') {
            success();
        }
    });
}


// init
tryToCreateWorkDir();

SH_event.on('test', () => {
    console.log('ttt');
});

SH_event.on('apply', (content, success) => {
    console.log(content);
    tryToApply(content, success);
});

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
                is_sys: true
                , content: getSysHosts()
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
