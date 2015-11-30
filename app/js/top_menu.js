/**
 * @author oldj
 * @blog http://oldj.net
 */


let template = [
    {
        label: "SwitchHosts!",
        submenu: [
            {
                label: "关于 SwitchHosts!",
                selector: "orderFrontStandardAboutPanel:"
            },
            {
                type: "separator"
            },
            {
                label: "Services",
                submenu: []
            },
            {
                type: "separator"
            },
            {
                label: "Hide Atom Shell",
                accelerator: "Command+H",
                selector: "hide:"
            },
            {
                label: "Hide Others",
                accelerator: "Command+Shift+H",
                selector: "hideOtherApplications:"
            },
            {
                label: "Show All",
                selector: "unhideAllApplications:"
            },
            {
                type: "separator"
            },
            {
                label: "Quit",
                accelerator: "Command+Q",
                click: function () {
                    app.quit();
                }
            }
        ]
    },
    {
        label: "编辑",
        submenu: [
            {
                label: "Undo",
                accelerator: "Command+Z",
                selector: "undo:"
            },
            {
                label: "Redo",
                accelerator: "Shift+Command+Z",
                selector: "redo:"
            },
            {
                type: "separator"
            },
            {
                label: "Cut",
                accelerator: "Command+X",
                selector: "cut:"
            },
            {
                label: "Copy",
                accelerator: "Command+C",
                selector: "copy:"
            },
            {
                label: "Paste",
                accelerator: "Command+V",
                selector: "paste:"
            },
            {
                label: "Select All",
                accelerator: "Command+A",
                selector: "selectAll:"
            }
        ]
    },
    {
        label: "View",
        submenu: [
            {
                label: "Reload",
                accelerator: "Command+R",
                click: function () {
                    BrowserWindow.getFocusedWindow().reloadIgnoringCache();
                }
            },
            {
                label: "Toggle DevTools",
                accelerator: "Alt+Command+I",
                click: function () {
                    BrowserWindow.getFocusedWindow().toggleDevTools();
                }
            }
        ]
    },
    {
        label: "Window",
        submenu: [
            {
                label: "Minimize",
                accelerator: "Command+M",
                selector: "performMiniaturize:"
            },
            {
                label: "Close",
                accelerator: "Command+W",
                selector: "performClose:"
            },
            {
                type: "separator"
            },
            {
                label: "Bring All to Front",
                selector: "arrangeInFront:"
            }
        ]
    },
    {
        label: "Help",
        submenu: []
    }
];

exports.template = template;
