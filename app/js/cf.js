/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const mkdirp = require('mkdirp');

let sys_host_path;

if (process == 'win32') {
    // todo windows 有可能不在 C 盘，需要先取得当前系统安装盘
    sys_host_path = 'c:\\windows\\system32\\driv'; // todo 补全路径
} else {
    sys_host_path = '/etc/hosts';
}

const work_path = path.join(getUserHome(), '.SwitchHosts');
const data_path = path.join(work_path, 'data.json');
mkdirp(work_path, function (err) {
    err && console.log(err);
});

function copyObj(o) {
    let k;
    let o2 = {};
    for (k in o) {
        if (o.hasOwnProperty(k)) {
            o2[k] = o[k];
        }
    }
    return o2;
}

function mixObj(a, b) {
    let k;
    for (k in b) {
        if (b.hasOwnProperty(k)) {
            a[k] = b[k];
        }
    }
    return a;
}

function getSysHosts() {
    let s;
    try {
        s = fs.readFileSync(sys_host_path, 'utf-8');
    } catch (e) {
        alert(e.message);
    }
    return s;
}

function getUserHome() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE || '';
}

function makeBackupHosts() {
    return {
        title: 'backup',
        on: true,
        content: getSysHosts()
    }
}

function getData(config) {
    let s;
    config = copyObj(config || {});

    let default_hosts = {
        title: 'My Hosts',
        on: false,
        content: '# My Hosts\n'
    };

    if (!fs.existsSync(data_path)) {
        return mixObj(config, {
            sys: getSysHosts(),
            list: [default_hosts, makeBackupHosts()]
        });
    } else {
        s = fs.readFileSync(data_path, 'utf-8');
    }

    try {
        s = JSON.parse(s);
        s = mixObj(config, s);
        if (typeof s == 'object') {
            s.sys = getSysHosts();
            s.list = s.list || [default_hosts, makeBackupHosts()];
            s.list.map(function (item) {
                // set default value
                item.title = item.title || '';
                item.on = !!item.on;
                item.content = item.content || '';
            });
            return s
        }
        alert('bad format!');
    } catch (e) {
        alert(e.message);
    }
}

function saveData(data) {
    fs.writeFile(data_path, JSON.stringify(data), 'utf-8', (e) => {
        if (e) {
            alert(e.message);
            return;
        }
        //console.log('data saved.');
    });
}

function saveHost(content, sudo_pswd, callback) {
    let cmd;
    //console.log(fs.statSync(sys_host_path));

    if (sudo_pswd) {
        // try to change the host file's permission
        cmd = `echo '${sudo_pswd}' | sudo -S chmod 766 ${sys_host_path}`;
        exec(cmd, function (err, stdout, stderr) {
            if (!err) {
                fs.writeFile(sys_host_path, content, 'utf-8', function (err) {
                    // change the host file's permission back
                    cmd = `echo '${sudo_pswd}' | sudo -S chmod 644 ${sys_host_path}`;
                    exec(cmd, function (err) {
                        //callback(err);
                        err && console.log(err);
                    });

                    callback(err);
                });
            } else {
                callback(err);
            }
        });
    } else {
        // try to write host directly
        fs.writeFile(sys_host_path, content, 'utf-8', function (err) {
            callback(err);
        });
    }

}

exports.sys_host_path = sys_host_path;
exports.work_path = work_path;
exports.getSysHosts = getSysHosts;
exports.getData = getData;
exports.saveData = saveData;
exports.saveHost = saveHost;
