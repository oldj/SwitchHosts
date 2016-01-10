/**
 * @author oldj
 * @blog http://oldj.net
 */

"use strict";

var config = require('./config');
//Vue.config.debug = true;
Vue.use(require('./vue_dnd'));
var util = require('./util');
var agent = require('./agent');
var lang = require('./lang').getLang(navigator.language);
var tray_obj;

var app = new Vue({
    el: '#sh-app',
    data: {
        lang: lang,
        hosts: agent.getData({
            VERSION: config.VERSION
        }),
        is_prompt_show: false,
        is_edit_show: false,
        is_pswd_show: false,
        is_search_bar_show: false,
        search_keyword: '',
        current_host: {
            content: agent.getSysHosts(),
            is_sys: true,
            on: true,
            is_editable: false,
            where: 'sys',
            url: '',
            refresh_interval: 24,
            last_refresh: null
        },
        refresh_options: [
            [0, lang.never],
            [1, '1 ' + lang.hour],
            [24, '1 ' + lang.day],
            [24 * 7, '7 ' + lang.days]
        ],
        inform: {
            title: '',
            url: ''
        },
        on_after_permission: [],
        could_tmp_clean_on: true,
        current_edit_host: {},
        add_or_edit: '',
        sudo_pswd: ''
    },
    watch: {
        'current_host': function () {
            this.onCurrentHostChange();
        },
        'current_host.where': function () {
            this.onCurrentHostChange();
        },
        'current_host.content': function () {
            var host = this.current_host;
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
            this.is_pswd_show = false;
            this.current_edit_host = {
                where: 'local'
            };
            this.add_or_edit = 'add';
            //this.chkHostTitle();

            setTimeout(function () {
                $('#ipt-host-title').focus()
            }, 100);
        },
        edit: function (host) {
            this.is_prompt_show = true;
            this.is_edit_show = true;

            host.where = host.where || 'local';
            this._current_edit_host = host;
            this.current_edit_host = util.copyObj(host, true);
            this.add_or_edit = 'edit';

            setTimeout(function () {
                $('#ipt-host-title').focus()
            }, 100);
        },
        chkHostTitle: function () {
            var host = this.current_edit_host;
            var host_title = host ? util.trim(host.title) : '';
            var el = $('#ipt-host-title');
            if (!host_title) {
                this.inform.title = this.lang.host_title_cant_be_empty;
                el.focus();
                return false;
            } else {
                this.inform.title = '';
                //this.host_title = host_title;
                return true;
            }
        },
        chkHostUrl: function () {
            var host = this.current_edit_host;
            if (host.where == 'local') {
                return true;
            }
            var url = host.url = util.trim(host.url);
            var el = $('#ipt-host-url');
            if (!url || !/^https?:\/\/\w+/i.test(url)) {
                this.inform.url = this.lang.bad_url;
                el.focus();
                return false;
            } else {
                this.inform.url = '';
                return true;
            }
        },
        onCurrentHostChange: function (host) {
            // 内部改变，更新到 codeMirror
            if (host && host != this.current_host) return;
            host = this.current_host;
            host.is_editable = (host.where != 'sys' && host.where != 'remote');

            this.codemirror.getDoc().setValue(host.content || '');
            if (host.is_editable === false) {
                this.codemirror.setOption('readOnly', true);
            } else {
                this.codemirror.setOption('readOnly', false);
            }
            host._just_switch = 1;
        },
        onCurrentHostBeChanged: function (v) {
            // 外部改变，更新到内部
            this.current_host.content = v;
        },
        getRemoteHost: function (host) {
            if (host.where !== 'remote' || !host.url) return;
            var tpl = [
                '# REMOTE: ' + host.title,
                '# URL: ' + host.url,
                '# UPDATE: ' + util.now()
            ];

            host.content = '# loading...';
            this.onCurrentHostChange(host);

            var _this = this;
            agent.getURL(host.url, {}, function (s) {
                // success
                host.content = tpl.concat(['', s]).join('\n');
                _this.onCurrentHostChange(host);
                _this.doSave();
            }, function (xhr, status) {
                // fail
                host.content = tpl.concat(['', 'FAIL to get!', status]).join('\n');
                _this.onCurrentHostChange(host);
                _this.doSave();
            });

            this.doSave();
        },
        toSave: function () {
            if (!this.chkHostTitle() || !this.chkHostUrl()) {
                return;
            }
            var host;

            //if (this.hosts.list.indexOf(this.current_edit_host) > -1) {
            if (this.add_or_edit == 'edit') {
                // edit
                util.updateObj(this._current_edit_host, this.current_edit_host);
                this.getRemoteHost(this.current_edit_host);
            } else {
                // add new
                host = {
                    title: this.current_edit_host.title,
                    content: '# ' + this.current_edit_host.title,
                    on: false,
                    where: this.current_edit_host.where,
                    url: this.current_edit_host.url,
                    refresh_interval: this.current_edit_host.refresh_interval,
                    last_refresh: null
                };
                this.hosts.list.push(host);
                this.selectHost(host);
                this.getRemoteHost(host);
            }

            this.doSave(1);
            this.closePrompt();
        },
        doSave: function (now) {
            clearTimeout(this._t_save);
            var _this = this;
            this._t_save = setTimeout(function () {
                agent.setData(_this.hosts);
                tray_obj && tray_obj.updateTrayMenu(_this.hosts);
            }, now ? 0 : 100);
        },
        closePrompt: function (action) {
            this.is_prompt_show = false;
            this.is_edit_show = false;
            this.is_pswd_show = false;

            if (action == 'pswd') {
                //    this._to_switch_host.on = !this._to_switch_host.on;
                this.sudo_pswd = '';
                //this.tmpRecover();
                this._on_hosts && this._on_hosts.map(function (host) {
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

            var _this = this;
            this.caculateHosts(host, function (err) {
                if (err) {
                    alert(err);
                } else {
                    host.on = !host.on;
                    _this.doSave();
                }
                _this._to_switch_host = null;
            });
        },
        updateHost: function () {
            this.doSave();
        },
        showSysHost: function () {
            this.current_host = {
                content: agent.getSysHosts(),
                is_sys: true,
                is_editable: false,
                where: 'sys'
            };
        },
        delHost: function (host) {
            if (!confirm(this.lang.confirm_del)) {
                return;
            }

            var i = this.hosts.list.indexOf(host);
            if (i > -1) {
                //host.on = false;
                this.hosts.list.splice(i, 1);
                this.current_edit_host = {};
                this.closePrompt();
                this.doSave();
            }
        },
        caculateHosts: function (host, callback) {
            var on_hosts = [];
            var _this = this;
            host = host || this.current_host;
            this.hosts.list.map(function (host) {
                if ((host.on && host != _this._to_switch_host) || (!host.on && host == _this._to_switch_host)) {
                    on_hosts.push(host.content);
                }
            });

            var s_hosts = on_hosts.join('\n\n# --------------------\n\n');
            s_hosts = '# SwitchHosts!\n' + s_hosts;
            agent.setSysHosts(s_hosts, this.sudo_pswd, function (err) {
                if (err) {
                    console.log(err);
                    // get permission
                    _this.askForPermission(function () {
                        _this.caculateHosts(host, callback)
                    });
                    return;
                }
                callback && callback.call(_this);
                if (_this.current_host.is_sys) {
                    setTimeout(function () {
                        _this.showSysHost();
                    }, 10);
                }
                // todo nofity
                //MacGap.notify({
                //    type: 'info',
                //    title: 'host applied',
                //    content: 'host [' + host.title + '] has been applied.'
                //});
            });
        },
        askForPermission: function (callback) {
            this.is_prompt_show = true;
            this.is_pswd_show = true;
            this.is_edit_show = false;
            this.sudo_pswd = '';
            callback && this.on_after_permission.push(callback);

            setTimeout(function () {
                $('#ipt-pswd').focus()
            }, 100);
            agent.activate();
        },
        chkPswd: function () {
            //this.switchHost(this._to_switch_host);
            this.closePrompt();
            //this._to_switch_host = null;

            var f;
            while (f = this.on_after_permission.shift()) {
                f && f.call(this);
            }
        },
        tmpClean: function () {
            this.could_tmp_clean_on = false;
            this._to_switch_host = null;
            this._on_hosts = [];
            var _this = this;
            this.hosts.list.map(function (host) {
                if (host.on) {
                    _this._on_hosts.push(host);
                    host.on = false;
                }
            });
            this.caculateHosts();
            this.doSave(1);
        },
        tmpRecover: function () {
            this.could_tmp_clean_on = true;
            if (!this._on_hosts) return;

            this._on_hosts.map(function (host) {
                host.on = true;
            });
            this._on_hosts = [];
            this.caculateHosts();
            this.doSave(1);
        },
        sort: function (list, id, tag, data) {
            var tmp = list[data.index];
            list.splice(data.index, 1);
            list.splice(id, 0, tmp);

            this.doSave(1);
        },
        move: function (from, to, id, tag, data) {
            var tmp = from[data.index];
            from.splice(data.index, 1);
            to.splice(id, 0, tmp);
        },
        remove: function (from, tag, data) {
            from.splice(data.index, 1);
        },

        toggleSearch: function () {
            var el_bar = $("#search-bar");
            this.is_search_bar_show = !this.is_search_bar_show;
            if (this.is_search_bar_show) {
                setTimeout(function () {
                    ui.resize();
                    el_bar.find('input').focus();
                }, 100);
            } else {
                this.search_keyword = '';
                setTimeout(function () {
                    ui.resize();
                }, 100);
            }
        },

        mySearch: function (item) {
            if (!this.search_keyword) return true;

            return item.title.indexOf(this.search_keyword) > -1 ||
                item.content.indexOf(this.search_keyword) > -1;
        },

        log: function (obj) {
            console.log(obj);
            return 1;
        }
    }
});


require('./menu').initMenu(app);
tray_obj = require('./menu').initTray(app);
tray_obj.updateTrayMenu(app.hosts);

var ui = require('./ui');
ui.init(app);
