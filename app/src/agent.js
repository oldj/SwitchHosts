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
var is_work_path_made;

//function copyObj(o) {
//    var k;
//    var o2 = {};
//    for (k in o) {
//        if (o.hasOwnProperty(k)) {
//            o2[k] = o[k];
//        }
//    }
//    return o2;
//}
//
//function obj2str(o) {
//    var s = [];
//    var k;
//    for (k in o) {
//        s.push(k + '=' + o[k]);
//    }
//    return s.join('\n');
//}

function mixObj(a, b) {
    var k;
    for (k in b) {
        if (b.hasOwnProperty(k)) {
            a[k] = b[k];
        }
    }
    return a;
}

function makeBackupHosts() {
    return {
        title: 'backup',
        on: true,
        content: getSysHosts()
    }
}

function tryToCreateWorkDir() {
    if (MacGap.File.exists(work_path)) return;

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
        s = MacGap.File.read(sys_host_path, 'string');
    } catch (e) {
        alert(e.message);
    }
    return s || '';
}

function setSysHosts(val, sudo_pswd, callback) {
    var tmp_f = work_path + '/tmp.txt';
    //var cmd_f = work_path + '/cmd.sh';

    sudo_pswd = sudo_pswd || '';
    MacGap.File.write(tmp_f, val, 'string');

    var cmd;
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
    }
    //MacGap.File.write(cmd_f, cmd, 'string');

    var myTask = MacGap.Task.create('/bin/sh', function (result) {
        if (result.status == 0) {
            //MacGap.File.write(sys_host_path, val, 'string');
            callback && callback();
        } else {
            //alert('An error occurred!');
            callback && callback(result);
        }
    });
    myTask['arguments'] = ['-c', cmd];
    myTask.launch();
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
    if (!MacGap.File.exists(data_path)) {
        return default_vals;
    }

    var vals = {};
    mixObj(vals, config);

    var s;
    try {
        s = MacGap.File.read(data_path, 'string');
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
        MacGap.File.write(data_path, JSON.stringify(data), 'string');
    } catch (e) {
        alert(e);
    }
}

function getURL(url, data, success, fail) {
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

module.exports = {
    getSysHosts: getSysHosts,
    setSysHosts: setSysHosts,
    getData: getData,
    setData: setData,
    getURL: getURL,
    openURL: openURL,
    activate: activate,
    notify: notify
};
