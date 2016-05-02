/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

exports.Component = Vue.component('list-item', {
    //el: '#momolist',
    props: ['host'],
    data: function () {
        return {};
    },
    methods: {
        init_load: function () {
        },
        selectHost: function (host) {
            alert(host);
        }
    },
    watch: {},
    ready: function () {
        this.init_load();
    },
    destroyed: function () {
    },
    template: `<li
            @click="selectHost(host)"
            v-draggable="{index: $index, dragged: 'dragged'}"
            v-dropzone="sort(hosts.list, $index, $droptag, $dropdata)"
            :class="{selected:host==current_host}">
            <i class="iconfont switch" @click="switchHost(host)"
                :class="{'icon-on':host.on, 'icon-off':!host.on}"></i>
            <i class="iconfont icon-doc i-h"></i>xxx
            <span class="title">{{ host.title }}</span>
            <i class="iconfont icon-edit btn-edit" @click="edit(host)"></i>
        </li>
        <!--<li v-cloak
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
        </li>-->
        `
});
