'use strict';

// var app;

exports.init = function (/*_app*/) {
    // app = _app;
};

exports.install = function (Vue/*, options*/) {
    var dropTo = '';
    var _ = Vue.util;
    Vue.directive('draggable', {
        bind: function () {
            this.data = {};
            var _this = this;
            this.dragstart = function (event) {
                dropTo = _this.arg;
                event.target.classList.add(_this.data.dragged);
                event.dataTransfer.effectAllowed = 'all';
                event.dataTransfer.setData('data', JSON.stringify(_this.data));
                event.dataTransfer.setData('tag', _this.arg);
                return false;
            };
            this.dragend = function (event) {
                event.target.classList.remove(_this.data.dragged);
                return false;
            };
            this.el.setAttribute('draggable', true);
            _.on(this.el, 'dragstart', this.dragstart);
            _.on(this.el, 'dragend', this.dragend);
        },
        update: function (value/*, old*/) {
            this.data = value;
        },
        unbind: function () {
            this.el.setAttribute('draggable', false);
            _.off(this.el, 'dragstart', this.dragstart);
            _.off(this.el, 'dragend', this.dragend);
        }
    });

    Vue.directive('dropzone', {
        acceptStatement: true,
        bind: function () {
            var self = this;
            this.dragenter = function (event) {
                if (dropTo == self.arg) {
                    event.target.classList.add(self.arg);
                }
                return false;
            };
            this.dragover = function (event) {
                if (event.preventDefault) {
                    event.preventDefault();
                }
                // XXX
                if (dropTo == self.arg) {
                    event.dataTransfer.effectAllowed = 'all';
                    event.dataTransfer.dropEffect = 'copy';
                } else {
                    event.dataTransfer.effectAllowed = 'none';
                    event.dataTransfer.dropEffect = 'none';
                }
                return false;
            };
            this.dragleave = function (event) {
                if (dropTo == self.arg) {
                    event.target.classList.remove(self.arg);
                }
                return false;
            };
            this.drop = function (event) {
                if (event.preventDefault) {
                    event.preventDefault();
                }
                var tag = event.dataTransfer.getData('tag');
                var data = event.dataTransfer.getData('data');
                if (dropTo == self.arg) {
                    self.handler(tag, JSON.parse(data));
                    event.target.classList.remove(self.arg);
                }
                return false;
            };
            _.on(this.el, 'dragenter', this.dragenter);
            _.on(this.el, 'dragleave', this.dragleave);
            _.on(this.el, 'dragover', this.dragover);
            _.on(this.el, 'drop', this.drop);
        },
        update: function (value/*, old*/) {
            var vm = this.vm;
            this.handler = function (tag, data) {
                vm.$droptag = tag;
                vm.$dropdata = data;
                var res = value(tag, data);
                vm.$droptag = null;
                vm.$dropdata = null;
                return res;
            };
        },
        unbind: function () {
            _.off(this.el, 'dragenter', this.dragenter);
            _.off(this.el, 'dragleave', this.dragleave);
            _.off(this.el, 'dragover', this.dragover);
            _.off(this.el, 'drop', this.drop);
        }
    });
};
