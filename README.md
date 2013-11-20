#SwitchHosts!

 * Author: oldj
 * Email: oldj.wu@gmail.com
 * Blog: http://oldj.net/
 * Source: https://github.com/oldj/SwitchHosts
 * Homepage: http://oldj.github.com/SwitchHosts/
 * Latest Stable: 0.2.2.1801


这是一个用于快速切换 hosts 文件的小程序，基于 Python 和 wxPython 开发。


##功能特性：

 * 支持Common Host文件，切换到任意环境都将生效的host --- charlestang
 * 快速切换 hosts
 * 跨平台（基于 wxPython）
 * hosts 文件语法高亮
 * 可为不同的 hosts 方案设置不同的图标
 * 切换 hosts 方案时浮出窗口提示
 * 支持在线 hosts 方案
 * 方案档案可导入/导出


##下载地址：

你可以直接下载源码到本地运行或编辑，或者在下面下载可执行版本：

 * [SwitchHosts! 下载](http://pan.baidu.com/share/link?shareid=150951&uk=3607385901)


##程序截图：

以下为本程序的运行截图。

###Windows

![程序主界面](https://github.com/oldj/SwitchHosts/blob/master/screenshots/7.png?raw=true)

*程序主界面*


![系统托盘菜单](https://github.com/oldj/SwitchHosts/blob/master/screenshots/2.png?raw=true)

*系统托盘菜单*

###Mac

![程序主界面](https://github.com/oldj/SwitchHosts/blob/master/screenshots/6.png?raw=true)

*程序主界面*

![系统托盘菜单](https://github.com/oldj/SwitchHosts/blob/master/screenshots/4.png?raw=true)

*系统托盘菜单*

##更新历史：

 - 2013-02-06 解决Linux/Mac下没有修改系统hosts文件权限的问题。
 - 2012-12-27 启动时检查是否为单一实例，禁止同时运行多个实例。
 - 2012-11-16 接受 @charlestang 网友的 pull request，同时参考了 @allenm 的修改，实现了 Common Hosts 功能。
 - 2012-11-09 简单优化：Common Hosts 不允许删除，不允许“切换到”，将右键菜单相关条目禁用，允许更换图标颜色。修复新增在线方案时，url 框默认禁用的小 bug。
 - 2012-10-09 增加 hosts 方案拖拽排序功能。
 - 2012-10-05 修复在中文目录下程序无法正常启动的问题。
 - 2012-09-30 初步完成 0.2.0 版。
 - 2011-12-14 允许输入超长的 hosts 方案。
 - 2011-10-09 发布 0.1.6 版，修复若干 bug，增加自动检查最新版本的功能。
 - 2011-09-29 发布 0.1.5 版，新增 hosts 内容语法高亮。
 - 2011-09-28 发布 0.1.4 版，新增“添加”、“删除”按钮；hosts 内容修改后自动保存；修复若干 bug。
 - 2011-09-19 发布 0.1.3 版，修复若干 bug。
 - 2011-09-15 发布 0.1.2 版，添加主面板，可以在主面板上对 hosts 进行增加、删除、编辑、重命名等操作。
 - 2011-09-02 发布 0.1.0 版，完成基本功能。

##开发计划：

 - 增加选项配置界面
 - 自动监测当前使用的 hosts，如果有修改马上刷新
 - 可选择是否修改注册表以便让 IE 浏览器在修改 hosts 后马上更新
 - 增加快捷键
 - 备份系统初始 hosts


##已知问题

 - Hosts 编辑器中输入法有问题。


##打包方法

您可以使用 [py2exe](http://www.py2exe.org/)（Windows 平台）或 [pyInstaller](http://www.pyinstaller.org/)（Windows/Linux/Mac 平台）将本项目打包制作成可执行文件。推荐使用 *pyInstaller*，因为它在各大主流系统中都可使用。另外，感谢网友_Yan Jian_的提醒，如果使用 py2exe 打包，则需要先将源码中的 `__file__` 替换为 `.`。
 
###使用 pyInstaller 打包
 
使用 pyInstaller 打包本程序非常简单，大致需要以下步骤：

 - 去 [pyInstaller](http://www.pyinstaller.org/) 官方主页下载最新版本的 pyIntaller，比如目前为 2.0 版
 - 将下载的 pyInstaller 解压，比如解压至 `D:\tools\pyinstaller-2.0` 目录
 - 打开 CMD 终端，转到 pyInstaller 所在目录，输入打包命令

如果你的源码位于目录`D:\studio\SwitchHosts`，则打包命令形如：
 
    D:\tools\pyinstaller-2.0> pyinstaller.py -w -F --icon=D:\studio\SwitchHosts\src\img\logo.ico --name=SwitchHosts --out=D:\studio\SwitchHosts\dist D:\studio\SwitchHosts\src\SwitchHosts.py
 
执行完成之后，即可在`D:\studio\SwitchHosts\dist`目录下看到打包成功的可执行文件。
 

###使用 py2app 打包

Mac 下可以使用 py2app 将本程序打包为一个 APP，在终端中进入程序的`src`目录，运行以下命令：

    $rm -rf dist build
    $python setup.py py2app

如果一切顺利，即可在当前目录下的`dist/`目录下看到打包完成的`SwitchHosts!.app`。


##版权及致谢：

 本程序的 Windows 版和 Mac 分别使用了 [ToasterBox](http://xoomer.virgilio.it/infinity77/main/ToasterBox.html) 和 [gntp](https://github.com/kfdm/gntp) 作为浮出提示解决方案，在此对作者的工作表示感谢！

 本程序完全免费，并基于 LGPL 协议开源。
