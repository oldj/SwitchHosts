# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import os
import sys
import glob
import simplejson as json
import wx
import ui
import urllib
import re
import traceback
import random
import Queue
from Hosts import Hosts
from TaskbarIcon import TaskBarIcon
from BackThreads import BackThreads
import common_operations as co
import lang

if os.name == "posix":
    if sys.platform != "darwin":
        # Linux
        try:
            import pynotify
        except ImportError:
            pynotify = None

    else:
        # Mac
        import gntp.notifier

        growl = gntp.notifier.GrowlNotifier(
            applicationName="SwitchHosts!",
            notifications=["New Updates", "New Messages"],
            defaultNotifications=["New Messages"],
            hostname = "127.0.0.1", # Defaults to localhost
            # password = "" # Defaults to a blank password
        )
        growl.register()


class MainFrame(ui.Frame):

    ID_RENAME = wx.NewId()

    def __init__(self,
            parent=None, id=wx.ID_ANY, title=None, pos=wx.DefaultPosition,
            size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE,
            version=None, working_path=None,
    ):
        u""""""

        self.version = version
        self.default_title = "SwitchHosts! %s" % version

        ui.Frame.__init__(self, parent, id,
            title or self.default_title, pos, size, style)

        self.taskbar_icon = TaskBarIcon(self)
        self.latest_stable_version = "0"
        self.is_switching_text = False
        self.__sys_hosts_path = None

        self.configs = {}
        if working_path:
            self.working_path = working_path
            self.configs_path = os.path.join(self.working_path, "configs.json")
            self.hosts_path = os.path.join(self.working_path, "hosts")
        self.current_using_hosts = None
        self.current_showing_hosts = None
        self.current_tree_hosts = None

        self.showing_rnd_id = random.random()

        self.origin_hostses = []
        self.hostses = []
        self.task_qu = Queue.Queue(4096)

        self.init2()
        self.initBind()


    def initBind(self):
        u"""初始化时绑定事件"""

        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.Bind(wx.EVT_MENU, self.OnExit, id=wx.ID_EXIT)
        self.Bind(wx.EVT_MENU, self.OnAbout, id=wx.ID_ABOUT)
        self.Bind(wx.EVT_MENU, self.OnChkUpdate, self.m_menuItem_chkUpdate)
        self.Bind(wx.EVT_MENU, self.OnNew, self.m_menuItem_new)
        self.Bind(wx.EVT_MENU, self.OnDel, id=wx.ID_DELETE)
        self.Bind(wx.EVT_MENU, self.OnApply, id=wx.ID_APPLY)
        self.Bind(wx.EVT_MENU, self.OnRename, id=self.ID_RENAME)
        self.Bind(wx.EVT_MENU, self.OnEdit, id=wx.ID_EDIT)
        self.Bind(wx.EVT_MENU, self.OnRefresh, id=wx.ID_REFRESH)
        self.Bind(wx.EVT_BUTTON, self.OnNew, self.m_btn_add)
        self.Bind(wx.EVT_BUTTON, self.OnApply, id=wx.ID_APPLY)
        self.Bind(wx.EVT_BUTTON, self.OnDel, id=wx.ID_DELETE)
        self.Bind(wx.EVT_TREE_SEL_CHANGED, self.OnTreeSelectionChange, self.m_tree)
        self.Bind(wx.EVT_TREE_ITEM_RIGHT_CLICK, self.OnTreeRClick, self.m_tree)
        self.Bind(wx.EVT_TREE_ITEM_ACTIVATED, self.OnTreeActive, self.m_tree)
        self.Bind(wx.EVT_TREE_END_LABEL_EDIT, self.OnRenameEnd, self.m_tree)
        self.Bind(wx.EVT_TEXT, self.OnHostsChange, self.m_textCtrl_content)


    def init2(self):

        self.loadConfigs()
        self.startBackThreads(2)

        self.getSystemHosts()
        self.scanSavedHosts()
        self.makeHostsContextMenu()

        if not os.path.isdir(self.hosts_path):
            os.makedirs(self.hosts_path)


    def startBackThreads(self, count=1):

        self.back_threads = []
        for i in xrange(count):
            t = BackThreads(task_qu=self.task_qu)
            t.start()
            self.back_threads.append(t)


    def stopBackThreads(self):

        for t in self.back_threads:
            t.stop()


    def makeHostsContextMenu(self):

        self.hosts_item_menu = wx.Menu()
        self.hosts_item_menu.Append(wx.ID_APPLY, u"切换到当前hosts")
        #        self.hosts_item_menu.Append(wx.ID_EDIT, u"编辑")
        self.hosts_item_menu.Append(self.ID_RENAME, u"重命名")
        self.hosts_item_menu.Append(wx.ID_EDIT, u"详情")
        self.hosts_item_menu.AppendMenu(-1, u"图标", self.makeSubIconMenu())

        self.hosts_item_menu.AppendSeparator()
        self.hosts_item_menu.Append(wx.ID_REFRESH, u"刷新")
        self.hosts_item_menu.Append(wx.ID_DELETE, u"删除")

#        self.m_btn_apply.Disable()


    def makeSubIconMenu(self):
        u"""生成图标子菜单"""

        menu = wx.Menu()

        def _f(i):
            return lambda e: self.setHostsIcon(e, i)

        icons_length = len(co.ICONS)
        for i in range(icons_length):
            item_id = wx.NewId()
            mitem = wx.MenuItem(menu, item_id, u"图标#%d" % (i + 1))
            mitem.SetBitmap(co.GetMondrianBitmap(i))
            menu.AppendItem(mitem)

            self.Bind(wx.EVT_MENU, _f(i), id=item_id)

        return menu


    def setHostsIcon(self, event=None, i=0):

        hosts = self.current_showing_hosts
        if not hosts:
            return

        hosts.icon_idx = i
        self.updateHostsIcon(hosts)
        hosts.save()


    def scanSavedHosts(self):
        u"""扫描目前保存的各个hosts"""

        fns = glob.glob(os.path.join(self.hosts_path, "*.hosts"))
        fns = [os.path.split(fn)[1] for fn in fns]

        cfg_hosts = self.configs.get("hosts", [])
        # 移除不存在的 hosts
        tmp_hosts = []
        for fn in cfg_hosts:
            if fn in fns:
                tmp_hosts.append(fn)
        cfg_hosts = tmp_hosts

        # 添加新的 hosts
        for fn in fns:
            if fn not in cfg_hosts:
                cfg_hosts.append(fn)
        self.configs["hosts"] = cfg_hosts
        self.saveConfigs()

        for fn in self.configs["hosts"]:
            path = os.path.join(self.hosts_path, fn)
            hosts = Hosts(path)
            if hosts.content:
                pass
            self.addHosts(hosts)


    def setHostsDir(self):
        pass


    @property
    def sys_hosts_path(self):
        u"""取得系统 host 文件的路径"""

        if not self.__sys_hosts_path:

            if os.name == "nt":
                path = "C:\\Windows\\System32\\drivers\\etc\\hosts"
            else:
                path = "/etc/hosts"

            self.__sys_hosts_path = path if os.path.isfile(path) else None

        return self.__sys_hosts_path



    def getSystemHosts(self):

        path = self.sys_hosts_path
        if path:
            hosts = Hosts(path=path, title=lang.trans("origin_hosts"), is_origin=True)
            self.origin_hostses = [hosts]
            self.addHosts(hosts)
#            self.useHosts(hosts)
            self.highLightHosts(hosts)


    def textStyle(self, old_content=None):
        u"""更新文本区的样式"""

        from highLight import highLight

        co.log("styling...")

        self.m_textCtrl_content.SetFont(self.font_mono)
        highLight(self.m_textCtrl_content, old_content=old_content)



    def showHosts(self, hosts):

        self.showing_rnd_id = random.random()

#        hosts.getContentOnce()
        self.is_switching_text = True
#        co.log(hosts.content)
        content = hosts.content if not hosts.is_loading else "loading..."
        self.m_textCtrl_content.SetValue(content)
        self.m_textCtrl_content.Enable(not hosts.is_online and not hosts.is_loading)
        self.is_switching_text = False

        if self.current_showing_hosts:
            self.m_tree.SetItemBackgroundColour(self.current_showing_hosts.tree_item_id, None)
        self.m_tree.SetItemBackgroundColour(hosts.tree_item_id, "#ccccff")

#        self.task_qu.put(lambda : self.textStyle())
        self.textStyle()

        self.current_showing_hosts = hosts


    def tryToShowHosts(self, hosts):

        if hosts == self.current_showing_hosts:
            self.showHosts(hosts)


    def useHosts(self, hosts):

        if hosts.is_loading:
            wx.MessageBox(u"当前 hosts 内容正在下载中，请稍后再试...")
            return

        try:
            hosts.save(path=self.sys_hosts_path)
            self.notify(msg=u"hosts 已切换为『%s』。" % hosts.title, title=u"hosts 切换成功")

        except Exception:

            err = traceback.format_exc()
            co.log(err)

            if "Permission denied:" in err:
                msg = u"切换 hosts 失败！\n没有修改 '%s' 的权限！" % self.sys_hosts_path

            else:
                msg = u"切换 hosts 失败！\n\n%s" % err

            if self.current_showing_hosts:
                wx.MessageBox(msg)
                return

        self.highLightHosts(hosts)


    def highLightHosts(self, hosts):

        self.m_tree.SelectItem(hosts.tree_item_id)

        if self.current_using_hosts:
            self.m_tree.SetItemBold(self.current_using_hosts.tree_item_id, bold=False)
        self.m_tree.SetItemBold(hosts.tree_item_id)

        self.showHosts(hosts)
        self.current_using_hosts = hosts
        self.taskbar_icon.updateIcon()


    def addHosts(self, hosts, show_after_add=False):

        if hosts.is_origin:
            tree = self.m_tree_origin
            list_hosts = self.origin_hostses
        elif hosts.is_online:
            tree = self.m_tree_online
            list_hosts = self.hostses
        else:
            tree = self.m_tree_local
            list_hosts = self.hostses

        if hosts.is_origin:
            hosts.tree_item_id = self.m_tree_origin

        else:
            list_hosts.append(hosts)
            hosts.tree_item_id = self.m_tree.AppendItem(tree, hosts.title)

        self.updateHostsIcon(hosts)
        self.m_tree.Expand(tree)

        if show_after_add:
#            self.showHosts(hosts)
            self.m_tree.SelectItem(hosts.tree_item_id)


    def updateHostsIcon(self, hosts):

        icon_idx = hosts.icon_idx
        if type(icon_idx) not in (int, long) or icon_idx < 0:
            icon_idx = 0
        elif icon_idx >= len(self.ico_colors_idx):
            icon_idx = len(self.ico_colors_idx) - 1

        self.m_tree.SetItemImage(
            hosts.tree_item_id, self.ico_colors_idx[icon_idx], wx.TreeItemIcon_Normal
        )
        if hosts == self.current_using_hosts:
            self.taskbar_icon.updateIcon()


    def delHosts(self, hosts):

        if not hosts:
            return False

        if hosts.is_origin:
            wx.MessageBox(u"初始 hosts 不能删除哦～")
            return False

        if hosts == self.current_using_hosts:
            wx.MessageBox(u"这个 hosts 方案正在使用，不能删除哦～")
            return False

        dlg = wx.MessageDialog(None, u"确定要删除 hosts '%s'？" % hosts.title, u"删除 hosts",
            wx.YES_NO | wx.ICON_QUESTION
        )
        ret_code = dlg.ShowModal()
        if ret_code != wx.ID_YES:
            return False

        try:
            hosts.remove()

        except Exception:
            err = traceback.format_exc()
            wx.MessageBox(u"出错啦！\n\n%s" % err)
            return False

        self.m_tree.Delete(hosts.tree_item_id)
        self.hostses.remove(hosts)

        cfg_hostses = self.configs.get("hostses")
        if cfg_hostses:
            cfg_hostses.remove(hosts.title)

        return True


    def notify(self, msg="", title=u"消息"):

        def macNotify(msg, title):

            growl.notify(
                noteType="New Messages",
                title=title,
                description=msg,
                sticky=False,
                priority=1,
            )


        if os.name == "posix":

            if sys.platform != "darwin":
                # linux 系统
                pynotify.Notification(title, msg).show()

            else:
                # Mac 系统
                macNotify(msg, title)

            return


        try:
            import ToasterBox as TB
        except ImportError:
            TB = None

        sw, sh = wx.GetDisplaySize()
        width, height = 210, 50
        px = sw - 230
        py = sh - 100

        tb = TB.ToasterBox(self)
        tb.SetPopupText(msg)
        tb.SetPopupSize((width, height))
        tb.SetPopupPosition((px, py))
        tb.Play()

        self.SetFocus()



    def loadConfigs(self):

        if os.path.isfile(self.configs_path):
            try:
                configs = json.loads(open(self.configs_path, "rb").read())
            except Exception:
                wx.MessageBox("读取配置信息失败！")
                return

            if type(configs) != dict:
                wx.MessageBox("配置信息格式有误！")
                return

            keys = ("hostses",)
            for k in keys:
                if k in configs:
                    self.configs[k] = configs[k]

            # 校验配置有效性
            if type(self.configs.get("hostses")) != list:
                self.configs["hostses"] = []

        self.saveConfigs()


    def saveConfigs(self):
        try:
            json.dump(self.configs, open(self.configs_path, "w"))
        except Exception:
            wx.MessageBox("保存配置信息失败！\n\n%s" % traceback.format_exc())


    def eachHosts(self, func):

        for hosts in self.hostses:
            func(hosts)


    @property
    def all_hostses(self):

        return self.origin_hostses + self.hostses


    def makeNewHostsFileName(self):
        u"""生成一个新的 hosts 文件名"""

        fns = glob.glob(os.path.join(self.hosts_path, "*.hosts"))
        fns = [os.path.split(fn)[1] for fn in fns]
        for i in xrange(1024):
            fn = "%d.hosts" % i
            if fn not in fns:
                break

        else:
            return None

        return fn


    def saveHosts(self, hosts):

        try:
            hosts.save()
            return True

        except Exception:
            err = traceback.format_exc()

            if "Permission denied:" in err:
                msg = u"没有修改 '%s' 的权限！" % hosts.path

            else:
                msg = u"保存 hosts 失败！\n\n%s" % err

            wx.MessageBox(msg)

            return False


    def showDetail(self, hosts=None):

        dlg = ui.Dlg_addHosts(self)

        if hosts:
            # 初始化值
            dlg.m_radioBtn_local.SetValue(not hosts.is_online)
            dlg.m_radioBtn_online.SetValue(hosts.is_online)
            dlg.m_radioBtn_local.Enable(False)
            dlg.m_radioBtn_online.Enable(False)
            dlg.m_textCtrl_title.SetValue(hosts.title)
            if hosts.url:
                dlg.m_textCtrl_url.SetValue(hosts.url)
                dlg.m_textCtrl_url.Enable(True)

        if dlg.ShowModal() != wx.ID_OK:
            return

        is_online = dlg.m_radioBtn_online.GetValue()
        title = dlg.m_textCtrl_title.GetValue().strip()
        url = dlg.m_textCtrl_url.GetValue().strip()

        if not title:
            wx.MessageBox(u"方案名不能为空！")
            return

        for h in self.hostses:
            if h != hosts and h.title == title:
                wx.MessageBox(u"已经有名为 '%s' 的方案了！" % title)
                return

        if not hosts:
            # 新建 hosts
            fn = self.makeNewHostsFileName()
            if not fn:
                wx.MessageBox(u"hosts 文件数超出限制，无法再创建新 hosts 了！")
                return

            path = os.path.join(self.hosts_path, fn)

            hosts = Hosts(path, title=title, url=url if is_online else None)
            hosts.content = u"# %s" % title

            if hosts.is_online:
                self.getHostsContent(hosts)

            self.addHosts(hosts, show_after_add=True)

        else:
            # 修改 hosts
            hosts.is_online = is_online
            hosts.title = title
            hosts.url = url if is_online else None
            self.renderHosts(hosts)

        self.saveHosts(hosts)


    def getHostsContent(self, hosts):

        hosts.is_loading = True
        self.task_qu.put(lambda : [
            hosts.getContent(force=True),
            wx.CallAfter(self.tryToShowHosts, hosts),
            wx.CallAfter(self.saveHosts, hosts),
        ])
        self.tryToShowHosts(hosts)


    def renderHosts(self, hosts):
        u"""更新hosts的名称"""

        self.m_tree.SetItemText(hosts.tree_item_id, hosts.title)


    def getHostsFromTreeByEvent(self, event):

        item = event.GetItem()
        if item in (self.m_tree_online, self.m_tree_local, self.m_tree_root):
            co.log("ignore")

        elif self.current_using_hosts and item == self.current_using_hosts.tree_item_id:
            co.log("is current hosts!")
            return self.current_using_hosts

        else:
            hostses = self.origin_hostses + self.hostses
            for hosts in hostses:
                if item == hosts.tree_item_id:
                    return hosts

        return None


    def getLatestStableVersion(self, alert=False):

        url = "https://github.com/oldj/SwitchHosts/blob/master/README.md"

        ver = None
        try:
            c = urllib.urlopen(url).read()
            v = re.search(r"\bLatest Stable:\s?(?P<version>[\d\.]+)\b", c)
            if v:
                ver = v.group("version")
                self.latest_stable_version = ver
                co.log("last_stable_version: %s" % ver)

        except Exception:
            pass

        if not alert:
            return

        if not ver:
            wx.MessageBox(u"未能取得最新版本号！")

        else:
            cmp = co.compareVersion(self.version, self.latest_stable_version)
            try:
                if cmp >= 0:
                    wx.MessageBox(u"当前已是最新版本！")
                else:
                    wx.MessageBox(u"更新的稳定版 %s 已经发布！" % self.latest_stable_version)
            except Exception:
                co.debugErr()
                pass



    def OnHostsChange(self, event):

        if self.is_switching_text:
            return

        self.current_showing_hosts.content = self.m_textCtrl_content.GetValue()
        self.saveHosts(self.current_showing_hosts)

        self.textStyle()


    def OnChkUpdate(self, event):

        co.log("chk update...")

        self.task_qu.put(lambda : [
            self.getLatestStableVersion(alert=True),
        ])


    def OnExit(self, event):

        self.stopBackThreads()
        self.taskbar_icon.Destroy()
        self.Destroy()
        sys.exit()


    def OnAbout(self, event):

        dlg = ui.AboutBox(version=self.version, latest_stable_version=self.latest_stable_version)
        dlg.ShowModal()
        dlg.Destroy()


    def OnTreeSelectionChange(self, event):

        hosts = self.getHostsFromTreeByEvent(event)
        self.current_tree_hosts = hosts

        if not hosts or (hosts not in self.hostses and hosts not in self.origin_hostses):
            return event.Veto()

        if hosts and hosts != self.current_showing_hosts:
            self.showHosts(hosts)


    def OnTreeRClick(self, event):

        hosts = self.getHostsFromTreeByEvent(event)
        if hosts:
            self.OnTreeSelectionChange(event)

            is_rename_able = hosts in self.hostses
            is_edit_able = hosts in self.hostses
            is_del_able = hosts in self.hostses
            is_refresh_able = hosts not in self.origin_hostses
            self.hosts_item_menu.Enable(self.ID_RENAME, is_rename_able)
            self.hosts_item_menu.Enable(wx.ID_EDIT, is_edit_able)
            self.hosts_item_menu.Enable(wx.ID_DELETE, is_del_able)
            self.hosts_item_menu.Enable(wx.ID_REFRESH, is_refresh_able)

            self.m_tree.PopupMenu(self.hosts_item_menu, event.GetPoint())


    def OnTreeActive(self, event):

        hosts = self.getHostsFromTreeByEvent(event)
        if hosts:
            self.useHosts(hosts)


    def OnApply(self, event):

        if self.current_showing_hosts:
            self.useHosts(self.current_showing_hosts)


    def OnDel(self, event):

        if self.delHosts(self.current_tree_hosts):
            self.current_showing_hosts = None


    def OnNew(self, event):

        self.showDetail()


    def OnEdit(self, event):

        self.showDetail(hosts=self.current_showing_hosts)


    def OnRename(self, event):

        hosts = self.current_showing_hosts
        if not hosts:
            return

        if hosts in self.origin_hostses:
            wx.MessageBox(u"初始 hosts 不能改名！")
            return

        self.m_tree.EditLabel(hosts.tree_item_id)


    def OnRenameEnd(self, event):

        hosts = self.current_showing_hosts
        if not hosts:
            return

        title = event.GetLabel().strip()
        if title and hosts.title != title:
            hosts.title = title
            hosts.save()

        else:
            event.Veto()


    def OnRefresh(self, event):

        hosts = self.current_showing_hosts
        self.getHostsContent(hosts)

