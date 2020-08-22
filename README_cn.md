# SwitchHosts!

 - [英文](README.md)

主页：[https://oldj.github.io/SwitchHosts/](https://oldj.github.io/SwitchHosts/)

这是一个用于快速切换 hosts 文件的小程序，基于 [Electron](http://electron.atom.io/) 开发，同时使用了 [React](https://facebook.github.io/react/)、[Ant Design](https://ant.design) 以及 [CodeMirror](http://codemirror.net/) 等框架/库。

## 截图

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Capture" width="960">


## 功能特性

 - 快速切换 hosts
 - hosts 文件语法高亮
 - 在线 hosts 方案
 - 系统托盘图标快速切换
 - macOS: 支持 [Alfred workflow](http://www.packal.org/workflow/switchhosts) 快速切换


## 安装

### 下载安装

你可以直接下载源码到本地运行或编辑，或者在下面下载可执行版本：

 - [SwitchHosts! 下载地址（GitHub release）](https://github.com/oldj/SwitchHosts/releases)

### brew

在 macOS 上，也可以使用 `brew cask` 安装，命令如下：

```bash
brew cask install switchhosts
```

感谢 [@gobinathm](https://github.com/gobinathm)、[@iamybj](https://github.com/iamybj) 更新 `brew cask` 版本。

### scoop

在 Windows 上，也可以使用 [scoop](https://scoop.sh/) 安装，命令如下：

```
scoop install switchhosts
```

感谢 [@batkiz](https://github.com/batkiz) 更新 `scoop` 版本。

## 文件备份

SwitchHosts! 的数据文件在 `~/.SwitchHosts` 目录下（Windows 用户为个人主目录下的 `.SwitchHosts` 目录下），其中 `~/.SwitchHosts/data.json` 是 hosts 数据文件，`~/.SwitchHosts/preferences.json` 是配置信息。


## 运行/打包方法

### 环境配置

 - 安装 [Node.js](https://nodejs.org/) 环境；
 - 在根目录 `./` 下，运行 `npm install` 命令，安装开发依赖库；
 - 在 `./app` 目录下，运行 `npm install` 命令，安装 App 运行依赖库；

    ```bash
    npm install
    cd app && npm install && cd ..
    ```

### 构建及运行

 - 在 `./` 目录下，运行 `npm run dll` 命令，构建公共文件（仅需在第一次构建或公共库发生改变时执行）；
 - 在 `./` 目录下，运行 `npm run build` 命令，构建所需文件；
 - 在 `./` 目录下，运行 `npm start` 命令，即可运行程序。

    ```bash
    # create dll file
    npm run dll
 
    # build
    npm run build

    # start
    npm start

    # or start in developer mode
    npm run dev
    ```

### 打包

 - 建议使用 [electron-builder](https://github.com/electron-userland/electron-builder) 进行打包
 - 在 `./` 目录下，运行 `npm run make` 命令，打包后的文件位于 `./dist` 目录；
 - 首次执行此命令可能需要花费较多时间（需要下载对应的构建文件），也可先手动下载[对应的发布版本](https://github.com/electron/electron/releases)（[淘宝镜像](https://npm.taobao.org/mirrors/electron/)），手动保存到 `~/.electron` 目录下。更多信息请参考 [Electron 文档](http://electron.atom.io/docs/)。

    ```bash
    # pack
    npm run make # the packed files will be in ./dist

    # 或者
    npm run build-and-make
    ```

## 更新历史

### v3.5

 - 2019-08-19 发布 v3.5，启用新 logo，方案列表中增加文件夹支持

### v3.4

 - 2019-07-26 发布 v3.4，样式改进，部分细节重新设计，增加【亮色】、【暗色】主题

### v3.3

 - 2017-05-30 引入 [Ant Design](https://ant.design) 重写部分 UI 组件
 - 2017-04-03 支持通过 Alfred 快速切换（[下载 workflow](http://www.packal.org/workflow/switchhosts)）
 - 2017-04-01 代码重构，增加「分组」功能

### v3.2

 - 2016-09-06 使用 Electron 打包，增加 Windows 版[下载](https://github.com/oldj/SwitchHosts/releases)。

### v3.1

 - 2016-04-29 更新自动清除 DNS 缓存功能 [#90](https://github.com/oldj/SwitchHosts/issues/90)。
 - 2016-01-15 搜索时增加模糊搜索支持（eg. `go*le` matches `google`）及正则支持（eg. `/go.*le` matches `google`）。
 - 2016-01-10 远程方案可以设置自动更新时间。
 - 2015-12-26 实现 Tray 菜单切换、Dock 图标隐藏、方案导入导出等功能。
 - 2015-12-20 从 Electron 切换至 MacGap 。

### v3.0

 - 2015-11-30 完成 3.0 版基本功能。

### v2.0

 - 2013-02-06 解决 Linux/Mac 下没有修改系统 hosts 文件权限的问题。
 - 2012-12-27 启动时检查是否为单一实例，禁止同时运行多个实例。
 - 2012-11-16 接受 @charlestang 网友的 pull request，同时参考了 @allenm 的修改，实现了 Common Hosts 功能。
 - 2012-11-09 简单优化：Common Hosts 不允许删除，不允许“切换到”，将右键菜单相关条目禁用，允许更换图标颜色。修复新增在线方案时，url 框默认禁用的小 bug。
 - 2012-10-09 增加 hosts 方案拖拽排序功能。
 - 2012-10-05 修复在中文目录下程序无法正常启动的问题。
 - 2012-09-30 初步完成 0.2.0 版。

### v1.0

 - 2011-12-14 允许输入超长的 hosts 方案。
 - 2011-10-09 发布 0.1.6 版，修复若干 bug，增加自动检查最新版本的功能。
 - 2011-09-29 发布 0.1.5 版，新增 hosts 内容语法高亮。
 - 2011-09-28 发布 0.1.4 版，新增“添加”、“删除”按钮；hosts 内容修改后自动保存；修复若干 bug。
 - 2011-09-19 发布 0.1.3 版，修复若干 bug。
 - 2011-09-15 发布 0.1.2 版，添加主面板，可以在主面板上对 hosts 进行增加、删除、编辑、重命名等操作。
 - 2011-09-02 发布 0.1.0 版，完成基本功能。


## 版权

本程序完全免费，并基于 MIT 协议开源。
