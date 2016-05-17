/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

exports.Component = Vue.component('host-list', {
    //el: '#momolist',
    props: ['host', 'hosts'],
    data: function () {
        return {
            current_host: null
        };
    },
    methods: {
        selectHost: function (host) {
            this.$dispatch('select-host', host);
        },
        toggleHost: function (host) {
            this.$dispatch('toggle-host', host);
        },
        edit: function (host) {
            this.$dispatch('edit-host-info', host);
        },
        sort: function (list, id, tag, data) {
            var tmp = list[data.index];
            list.splice(data.index, 1);
            list.splice(id, 0, tmp);

            this.$dispatch('do-save', 1);
        }
    },
    // watch: {},
    // ready: function () {
    // },
    // destroyed: function () {
    // },
    events: {
        'current-host-change': function (current_host) {
            this.current_host = current_host;
        }
    },
    template: `<ul id="custom-list">
            <li
                v-for="host in hosts.list | filterBy mySearch"
                @click="selectHost(host)"
                v-draggable="{index: $index, dragged: 'dragged'}"
                v-dropzone="sort(hosts.list, $index, $droptag, $dropdata)"
                :class="{selected:host==current_host}">
                <i class="iconfont switch" @click="toggleHost(host)"
                    :class="{'icon-on':host.on, 'icon-off':!host.on}"></i>
                <i class="iconfont icon-doc i-h"></i>
                <span class="title">{{ host.title }}</span>
                <i class="iconfont icon-edit btn-edit" @click="edit(host)"></i>
            </li>
        </ul>`
    /*
     <li v-cloak
     v-for="host in hosts.list | filterBy mySearch"
     @click="selectHost(host)"
     v-draggable="{index: $index, dragged: 'dragged'}"
     v-dropzone="sort(hosts.list, $index, $droptag, $dropdata)"
     :class="{selected:host==current_host}">
     <i class="iconfont switch" @click="switchHost(host)"
     :class="{'icon-on':host.on, 'icon-off':!host.on}"></i>
     <i class="iconfont icon-doc i-h"></i>
     <span class="title">{{ host.title }}</span>
     <i class="iconfont icon-edit btn-edit" @click="edit(host)"></i>
     </li>
     */
});

