/**
 * @author oldj
 * @blog http://oldj.net
 *
 * 和系统、平台相关的方法
 */

'use strict';

var sys_host_path = '/etc/hosts';
var work_path = MacGap.homePath + '/.SwitchHosts';
var data_path = work_path + '/data.json';
var preference_path = work_path + '/preferences.json';
var is_work_path_made;
var _preferences;


function mixObj(a, b) {
    var k;
    for (k in b) {
        if (b.hasOwnProperty(k)) {
            a[k] = b[k];
        }
    }
    return a;
}

function writeFile(path, content) {
    MacGap.File.write(path, content, 'string');
}

function readFile(path) {
    return MacGap.File.read(path, 'string');
}

function existPath(path) {
    return MacGap.File.exists(path);
}

function makeBackupHosts() {
    return {
        title: 'backup',
        on: true,
        content: getSysHosts()
    };
}

function tryToCreateWorkDir() {
    if (existPath(work_path)) return;

    var cmd = 'mkdir -p \'' + work_path + '\'';
    var my_task = MacGap.Task.create('/bin/sh', function (result) {
        if (result.status == 0) {
            //MacGap.File.write(sys_host_path, val, 'string');
        } else {
            alert('Fail to create work directory!\n\npath: ' + work_path);
        }
    });
    my_task['arguments'] = ['-c', cmd];
    my_task.launch();
}

function getSysHosts() {
    var s;
    try {
        s = readFile(sys_host_path);
    } catch (e) {
        alert(e.message);
    }
    return s || '';
}

function setSysHosts(val, sudo_pswd, callback) {
    var tmp_f = work_path + '/tmp.txt';
    //var cmd_f = work_path + '/cmd.sh';

    sudo_pswd = sudo_pswd || '';
    writeFile(tmp_f, val);

    var cmd;
    //var cmd2;
    if (!sudo_pswd) {
        cmd = [
            'cat "' + tmp_f + '" > ' + sys_host_path
            , 'rm -rf ' + tmp_f
        ].join(' && ');
    } else {
        sudo_pswd = sudo_pswd.replace(/'/g, '\\x27');
        cmd = [
            'echo \'' + sudo_pswd + '\' | sudo -S chmod 777 ' + sys_host_path
            , 'cat "' + tmp_f + '" > ' + sys_host_path
            , 'echo \'' + sudo_pswd + '\' | sudo -S chmod 644 ' + sys_host_path
            , 'rm -rf ' + tmp_f
        ].join(' && ');

        //cmd2 = [
        //    'echo \'' + sudo_pswd + '\' | sudo -S launchctl unload -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
        //    , 'echo \'' + sudo_pswd + '\' | sudo -S launchctl load -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
        //    , 'echo \'' + sudo_pswd + '\' | sudo -S launchctl unload -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
        //    , 'echo \'' + sudo_pswd + '\' | sudo -S launchctl load -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
        //].join(' ; ');
        //cmd = cmd + ';' + cmd2;
        //cmd = "$'" + cmd.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    }

    var task = MacGap.Task.create('/bin/sh', function (result) {
        if (result.status == 0) {
            setTimeout(function () {
                afterSetHosts(sudo_pswd);
            }, 10);
            callback && callback();
        } else {
            //alert('An error occurred!');
            callback && callback(result);
        }
    });
    task['arguments'] = ['-c', cmd];
    task.launch();
}

function getData(config) {
    if (!is_work_path_made) {
        tryToCreateWorkDir();
        is_work_path_made = true;
    }

    var default_hosts = {
        title: 'My Hosts',
        on: false,
        content: '# My Hosts\n'
    };
    var default_vals = {
        sys: getSysHosts(),
        list: [default_hosts, makeBackupHosts()]
    };
    if (!existPath(data_path)) {
        return default_vals;
    }

    var vals = {};
    mixObj(vals, config);

    var s;
    try {
        s = readFile(data_path);
    } catch (e) {
        alert(e.message);
        return default_hosts;
    }

    try {
        s = JSON.parse(s);
    } catch (e) {
        alert(e.message);
        return default_hosts;
    }
    mixObj(vals, s);

    return vals;
}

function setData(data) {
    try {
        writeFile(data_path, JSON.stringify(data));
    } catch (e) {
        alert(e);
    }
}

function getAllPreferences() {
    if (!_preferences) {
        var c = readFile(preference_path);
        try {
            c = JSON.parse(c);
        } catch (e) {
            c = {};
        }
        _preferences = c;
    }

    return _preferences;
}

function getPreference(key) {
    var p = getAllPreferences();
    return p[key];
}

function setPreference(key, value) {
    var p = getAllPreferences();
    p[key] = value;

    writeFile(preference_path, JSON.stringify(p));
}

function getURL(url, data, success, fail) {
    data = data || {};
    if (!data._r) {
        data._r = Math.random();
    }

    $.ajax({
        url: url,
        data: data,
        //async: false,
        success: function (s) {
            success && success(s);
        },
        error: function (e) {
            fail && fail(e);
        }
    });
}

function openURL(url) {
    MacGap.openURL(url);
}

function activate() {
    setTimeout(function () {
        MacGap.activate();
    }, 0);
}

function notify(type, title, content) {
    MacGap.notify({
        type: type,
        title: title,
        content: content
    });
}

function afterSetHosts(sudo_pswd, callback) {
    // sudo launchctl unload -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist
    // sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist
    // sudo launchctl unload -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist
    // sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist

    if (!sudo_pswd) {
        callback && callback();
        return;
    }

    var cmd;
    //sudo_pswd = sudo_pswd.replace(/'/g, '\\x27');
    cmd = [
        //'echo \'' + sudo_pswd + '\' | sudo -S launchctl unload -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
        //, 'echo \'' + sudo_pswd + '\' | sudo -S launchctl load -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
        //, 'echo \'' + sudo_pswd + '\' | sudo -S launchctl unload -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
        //, 'echo \'' + sudo_pswd + '\' | sudo -S launchctl load -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
        'sudo launchctl unload -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
        , 'sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist'
        , 'sudo launchctl unload -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
        , 'sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.discoveryd.plist'
        , 'sudo killall -HUP mDNSResponder'
    ].join('\n');
    //cmd = "$'" + cmd.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    //alert(cmd);
    var path = work_path + '/_restart_mDNSResponder.sh';
    MacGap.File.write(path, cmd, 'string');

    var task = MacGap.Task.create('/bin/sh', function (result) {
        if (result.status == 0) {
            callback && callback();
        } else {
            callback && callback(result);
        }
    });

    cmd = [
        '/bin/sh ' + path
        , 'rm -rf \'' + path + '\''
    ].join(';');
    task['arguments'] = ['-c', cmd];
    //task['arguments'] = [path];
    task.launch();
}

function log(msg) {
    /*eslint no-console: "error"*/
    // console.log(msg);
    MacGap.log(msg.toString());
}

module.exports = {
    log: log,
    readFile: readFile,
    writeFile: writeFile,
    existPath: existPath,
    getSysHosts: getSysHosts,
    setSysHosts: setSysHosts,
    getData: getData,
    setData: setData,
    getAllPreferences: getAllPreferences,
    getPreference: getPreference,
    setPreference: setPreference,
    getURL: getURL,
    openURL: openURL,
    activate: activate,
    notify: notify
};
