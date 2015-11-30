/**
 * @author oldj
 */

$(document).ready(function () {
    var sh = require("./sh.js");
    var hooks = {};

    function updateLayout() {
        var w = $(window).width();
        var h = $(window).height();
        var toph = $("#top").height();
        var topb = $(".operations").height();

        var el_main = $("#main");
        el_main.width(w - $("#left").width() - 11);
        $("#left, #main").height(h - toph - topb - 3);
        el_main.find(".operations").width(el_main.width() - 20);
    }

    $(window).resize(updateLayout);

    updateLayout();
    $("#hosts-content").html(sh.getSysHosts());

    // 右键菜单
    var remote = require("remote");
    var Menu = remote.require("menu");
    var MenuItem = remote.require("menu-item");

    var menu = new Menu();
    menu.append(new MenuItem({
        label: "MenuItem1", click: function () {
            console.log("item 1 clicked");
        }
    }));
    menu.append(new MenuItem({type: "separator"}));
    menu.append(new MenuItem({label: "MenuItem2", type: "checkbox", checked: true}));

    window.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        menu.popup(remote.getCurrentWindow());
    }, false);

    // 界面按钮等
    $(".btn-add").click(function () {
        if (hooks.beforeWindowShow) hooks.beforeWindowShow();
        $('#w').window("open");
    });

    $("#btn-cancel").click(function () {
        $('#w').window("close");
    });

    $("#btn-ok").click(function () {

    });

    return hooks;
});
