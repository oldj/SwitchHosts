/**
 * @author oldj
 * @blog http://oldj.net
 */

function MenuItem(configs) {
    this.configs = configs;
    this.init();
}
MenuItem.idx = 0;

MenuItem.prototype = {
    init: function () {
        this.title = this.configs.title || "untitled";
        this.name = this.configs.name;
        this.id = MenuItem.idx;
        MenuItem.idx++;
    }
};

exports.MenuItem = MenuItem;
