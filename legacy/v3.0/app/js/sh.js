/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

const config = require('../config');
const $ = require('jquery');
const Vue = require('vue');
//Vue.config.debug = true;
Vue.use(require('./dnd'));
const CodeMirror = require('codemirror');
//require('codemirror/mode/shell/shell');
require('./cm_hl');
const cf = require('./cf');
const lang = require('./lang').getLang(navigator.language);
const is_win = process.platform == 'win32';
let my_codemirror;

const app = new Vue({
    el: '#sh-app',
    data: {
        lang: lang,
        hosts: cf.getData({
            VERSION: config.VERSION
        }),
        is_prompt_show: false,
        is_edit_show: false,
        is_pswd_show: false,
        current_host: {
            content: cf.getSysHosts(),
            is_sys: true,
            is_editable: false
        },
        on_after_permission: [],
        could_tmp_clean_on: true,
        current_edit_host: {},
        add_or_edit: '',
        sudo_pswd: ''
    },
    watch: {
        'current_host': function (host) {
            my_codemirror.getDoc().setValue(host.content || '');
            if (host.is_editable === false) {
                my_codemirror.setOption('readOnly', true);
            } else {
                my_codemirror.setOption('readOnly', false);
            }

            host._just_switch = 1;
        },
        'current_host.content': function () {
            let host = this.current_host;
            if (host._just_switch) {
                host._just_switch = 0;
                return;
            }
            this.doSave();
            if (host.on) {
                this.caculateHosts(host);
            }
        }
    },
    methods: {
        add: function () {
            this.is_prompt_show = true;
            this.is_edit_show = true;
            this.current_edit_host = {};
            this.add_or_edit = 'add';
            //this.chkHostTitle();

            setTimeout(() => $('#ipt-host-title').focus(), 100);
        },
        edit: function (host) {
            this.is_prompt_show = true;
            this.is_edit_show = true;
            this.current_edit_host = host;
            this.add_or_edit = 'edit';

            setTimeout(() => $('#ipt-host-title').focus(), 100);
        },
        chkHostTitle: function () {
            let host_title = this.current_edit_host.title.replace(/^\s+|\s+$/g, '');
            if (!host_title) {
                this.current_edit_host.title_inform = this.lang.host_title_cant_be_empty;
                $('#ipt-host-title').focus();
                return false;
            } else {
                this.current_edit_host.title_inform = '';
                this.host_title = host_title;
                return true;
            }
        },
        toSave: function () {
            if (!this.chkHostTitle()) {
                return;
            }
            let host;

            //if (this.hosts.list.indexOf(this.current_edit_host) > -1) {
            if (this.add_or_edit == 'edit') {
                // edit
            } else {
                // add new
                host = {
                    title: this.current_edit_host.title,
                    content: `# ${this.current_edit_host.title}`,
                    on: false
                };
                this.hosts.list.push(host);
                this.selectHost(host);
            }

            this.doSave(true);
            this.closePrompt();
        },
        doSave: function (now) {
            clearTimeout(this._t_save);
            this._t_save = setTimeout(() => cf.saveData(this.hosts), now ? 0 : 1000);
        },
        closePrompt: function (action) {
            this.is_prompt_show = false;
            this.is_edit_show = false;
            this.is_pswd_show = false;

            if (action == 'pswd') {
                //    this._to_switch_host.on = !this._to_switch_host.on;
                this.sudo_pswd = '';
                //this.tmpRecover();
                this._on_hosts && this._on_hosts.map((host) => {
                    host.on = true;
                });
                this._on_hosts = [];
            }
        },
        selectHost: function (host) {
            this.current_host = host;
        },
        switchHost: function (host) {
            if (!host) return;
            this._to_switch_host = host;
            if (!host.is_sys) {
                this.could_tmp_clean_on = true;
            }

            this.caculateHosts(host, (err) => {
                if (err) {
                } else {
                    host.on = !host.on;
                    this.doSave();
                }
                this._to_switch_host = null;
            });
        },
        updateHost: function (host) {
            this.doSave();
        },
        showSysHost: function () {
            this.current_host = {
                content: cf.getSysHosts(),
                is_sys: true,
                is_editable: false
            };
        },
        delHosts: function (host) {
            if (!confirm(this.lang.confirm_del)) {
                return;
            }

            let i = this.hosts.list.indexOf(host);
            if (i > -1) {
                this.hosts.list.splice(i, 1);
                this.current_edit_host = {};
                this.closePrompt();
                this.doSave();
            }
        },
        caculateHosts: function (host, callback) {
            let on_hosts = [];
            host = host || this.current_host;
            this.hosts.list.map((host) => {
                if ((host.on && host != this._to_switch_host) || (!host.on && host == this._to_switch_host)) {
                    on_hosts.push(host.content);
                }
            });

            let s_hosts = on_hosts.join('\n\n# --------------------\n\n');
            s_hosts = `# SwitchHosts!\n${s_hosts}`;
            cf.saveHost(s_hosts, this.sudo_pswd, (err) => {
                if (err) {
                    console.log(err);
                    if (!is_win) {
                        // mac & linux
                        if (err.message.indexOf('EACCES') > -1 || err.message.indexOf('permission denied') > -1) {
                            // get permission
                            this.askForPermission(() => {
                                this.caculateHosts(host, callback)
                            });
                        } else if (err.message.indexOf('Command failed') > -1) {
                            // todo show inform
                            this.sudo_pswd = '';
                        } else {
                            alert(err);
                        }
                    } else {
                        // windows
                        alert(err);
                    }
                    return;
                }
                callback && callback.call(this);
                if (this.current_host.is_sys) {
                    this.showSysHost();
                }
            });
        },
        askForPermission: function (callback) {
            this.is_prompt_show = true;
            this.is_pswd_show = true;
            this.sudo_pswd = '';
            callback && this.on_after_permission.push(callback);

            setTimeout(() => $('#ipt-pswd').focus(), 100);
        },
        chkPswd: function () {
            //this.switchHost(this._to_switch_host);
            this.closePrompt();
            //this._to_switch_host = null;

            let f;
            while (f = this.on_after_permission.shift()) {
                f && f.call(this);
            }
        },
        tmpClean: function () {
            this.could_tmp_clean_on = false;
            this._to_switch_host = null;
            this._on_hosts = [];
            this.hosts.list.map((host) => {
                if (host.on) {
                    this._on_hosts.push(host);
                    host.on = false;
                }
            });
            this.caculateHosts();
            this.doSave(true);
        },
        tmpRecover: function () {
            this.could_tmp_clean_on = true;
            if (!this._on_hosts) return;

            this._on_hosts.map((host) => {
                host.on = true;
            });
            this._on_hosts = [];
            this.caculateHosts();
            this.doSave(1);
        },
        sort: function (list, id, tag, data) {
            let tmp = list[data.index];
            list.splice(data.index, 1);
            list.splice(id, 0, tmp);

            this.doSave(1);
        },
        move: function (from, to, id, tag, data) {
            let tmp = from[data.index];
            from.splice(data.index, 1);
            to.splice(id, 0, tmp);
        },
        remove: function (from, tag, data) {
            from.splice(data.index, 1);
        },
        log: function (obj) {
            console.log(obj);
            return 1;
        }
    }
});

function resize() {
    let wh = window.innerHeight;
    let h = wh - $('#sys-list').height() - 20;
    $('#custom-list').css('height', h);
    my_codemirror.setSize('100%', wh);
}

$(document).ready(function () {
    let el_textarea = $('#host-code');
    //el_textarea.css('height', window.innerHeight - 8);

    my_codemirror = CodeMirror.fromTextArea(el_textarea[0], {
        lineNumbers: true,
        readOnly: true,
        mode: 'host'
    });

    my_codemirror.on('change', function (a, b) {
        app.current_host.content = a.getDoc().getValue();
    });

    my_codemirror.on('gutterClick', function (cm, n) {
        if (app.current_host.is_editable === false) return;

        let info = cm.lineInfo(n);
        //cm.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeMarker());
        let ln = info.text;
        if (/^\s*$/.test(ln)) return;

        let new_ln;
        if (/^#/.test(ln)) {
            new_ln = ln.replace(/^#\s*/, '');
        } else {
            new_ln = '# ' + ln;
        }
        my_codemirror.getDoc().replaceRange(new_ln, {line: info.line, ch: 0}, {line: info.line, ch: ln.length});
        //app.caculateHosts();
    });

    resize();
    $(window).resize(resize);
});
