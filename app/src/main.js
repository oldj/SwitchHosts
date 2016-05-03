/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

/* global Vue */

var config = require('./config');
// $-FOR-TEST
require('./g_test');
// $-END
//Vue.config.debug = true;
var dnd = require('./vue_dnd');
Vue.use(dnd);
var util = require('./util');
var agent = require('./agent');
var refresh = require('./refresh');
var lang = require('./lang').getLang(navigator.language);
var stat = require('./stat');
var tray_obj;

require('./component/hostList');

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
            //[0.001, 'for-test'],
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
        //_current_edit_host: {}, // 指向当前 host 对象
        current_edit_host: {}, // 当前 host 对象的一个深拷贝
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
        },
        'search_keyword': function () {
            /* eslint no-empty: ["error", { "allowEmptyCatch": true }] */
            var kw = this.search_keyword;
            this.search_regexp = null;

            // 模糊搜索
            var r;
            var m;
            var flag = [];
            if ((m = kw.match(/^\/([^\/]+)\/?(\w*)$/))) {
                if (m[2].indexOf('i') > -1) {
                    flag.push('i');
                }
                if (m[2].indexOf('g') > -1) {
                    flag.push('g');
                }
                try {
                    r = new RegExp(m[1], flag.join(''));
                } catch (e) {
                }
            } else if (kw.indexOf('*') > -1) {
                try {
                    r = new RegExp(kw.replace(/\*/g, '.*'), 'ig');
                } catch (e) {
                }
            }
            this.search_regexp = r;

            //this.codemirror.refresh();
            this.onCurrentHostChange();
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
                $('#ipt-host-title').focus();
            }, 100);
        },
        edit: function (host) {
            this.is_prompt_show = true;
            this.is_edit_show = true;

            host.where = host.where || 'local';
            //this._current_edit_host = host;
            this.current_edit_host = util.copyObj(host, true);
            this.add_or_edit = 'edit';

            setTimeout(function () {
                $('#ipt-host-title').focus();
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
            refresh.getRemoteHost(this, host);
        },
        refreshHosts: function (host) {
            this.getRemoteHost(host);
        },
        toSave: function () {
            if (!this.chkHostTitle() || !this.chkHostUrl()) {
                return;
            }
            var host;

            //if (this.hosts.list.indexOf(this.current_edit_host) > -1) {
            if (this.add_or_edit == 'edit') {
                // edit
                util.updateObj(this.current_host, this.current_edit_host);
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
            this.$broadcast('current-host-change', host);
        },
        toggleHost: function (host) {
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

            stat.record('switch');
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
            this.$broadcast('current-host-change', this.current_host);
        },
        getShowHosts: function () {
            var list = [];
            this.hosts.list.map(function (item) {
                if (item._is_show) {
                    list.push(item);
                }
            });

            return list;
        },
        previouseHosts: function () {
            var list = this.getShowHosts();
            var i = list.indexOf(this.current_host);
            if (this.current_host.is_sys) {
                i = list.length;
            }
            var to_hosts = list[i - 1];
            if (to_hosts) {
                this.selectHost(to_hosts);
            } else {
                this.showSysHost();
            }
        },
        nextHosts: function () {
            var list = this.getShowHosts();
            var i = list.indexOf(this.current_host);
            var to_hosts = list[i + 1];
            if (to_hosts) {
                this.selectHost(to_hosts);
            } else {
                this.showSysHost();
            }
        },
        delHosts: function (host) {
            if (!confirm(this.lang.confirm_del)) {
                return;
            }

            var i = this.hosts.list.indexOf(host);
            var next_hosts;
            if (i > -1) {
                //host.on = false;
                this.hosts.list.splice(i, 1);
                this.current_edit_host = {};
                this.closePrompt();
                this.doSave();

                next_hosts = this.hosts.list[i] || this.hosts.list[i - 1];
                if (next_hosts) {
                    this.selectHost(next_hosts);
                } else {
                    this.showSysHost();
                }
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
                    //_this.log(err);
                    // get permission
                    _this.askForPermission(function () {
                        _this.caculateHosts(host, callback);
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
                $('#ipt-pswd').focus();
            }, 100);
            agent.activate();
        },
        chkPswd: function () {
            //this.switchHost(this._to_switch_host);
            this.closePrompt();
            //this._to_switch_host = null;

            /*eslint no-cond-assign: "error"*/
            var f;
            while ((f = this.on_after_permission.shift())) {
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
        move: function (from, to, id, tag, data) {
            var tmp = from[data.index];
            from.splice(data.index, 1);
            to.splice(id, 0, tmp);
        },
        remove: function (from, tag, data) {
            from.splice(data.index, 1);
        },

        toggleSearch: function () {
            var el_bar = $('#search-bar');
            var ipt = el_bar.find('input');

            if (this.is_search_bar_show) {
                this.is_search_bar_show = false;
                return;
            }

            this.is_search_bar_show = !this.is_search_bar_show;
            if (this.is_search_bar_show) {
                setTimeout(function () {
                    ui.resize();
                    ipt.focus();
                }, 100);
            } else {
                this.search_keyword = '';
                setTimeout(function () {
                    ui.resize();
                }, 100);
            }
        },

        mySearch: function (item) {
            if (!item) return false;
            
            var kw = this.search_keyword;
            var r = this.search_regexp;
            item._is_show = true;
            if (!kw) return true;

            if (item.title.indexOf(kw) > -1 || item.content.indexOf(kw) > -1) {
                return true;
            }

            // 模糊搜索
            if (r && r.test(item.content)) {
                return true;
            }

            item._is_show = false;
            return false;
        },

        checkRefresh: function () {
            var _this = this;
            var t = 60 * 5 * 1000;
            //var t = 1000;
            refresh.checkRefresh(this);

            setTimeout(function () {
                _this.checkRefresh();
            }, t);
        },

        onESC: function () {
            this.is_edit_show = false;
            this.is_pswd_show = false;
            this.is_prompt_show = false;
            if (this.is_search_bar_show) {
                this.search_keyword = '';
                this.is_search_bar_show = false;
                setTimeout(function () {
                    ui.resize();
                }, 100);
            }
        },

        log: function (obj) {
            agent.log(obj);
            return 1;
        }
    },
    events: {
        'select-host': function (host) {
            this.selectHost(host);
        },
        'toggle-host': function (host) {
            this.toggleHost(host);
        },
        'edit-host-info': function (host) {
            this.edit(host);
        },
        'do-save': function (now) {
            this.doSave(now);
        }
    }
});


require('./menu').initMenu(app);
tray_obj = require('./menu').initTray(app);
tray_obj.updateTrayMenu(app.hosts);

var ui = require('./ui');
ui.init(app);
dnd.init(app);

setTimeout(function () {
    app.checkRefresh();
}, 1000);

stat.record('launch');
