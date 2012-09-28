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
import traceback
from Hosts import Hosts
from TaskbarIcon import TaskBarIcon
import common_operations as co

class MainFrame(ui.Frame):

    ID_RENAME = wx.NewId()

    def __init__(self,
            parent=None, id=wx.ID_ANY, title=None, pos=wx.DefaultPosition,
            size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE,
            version=None, working_path=None,
    ):

        """

        """
        self.version = version
        self.default_title = "SwitchHosts! %s" % version

        ui.Frame.__init__(self, parent, id,
            title or self.default_title, pos, size, style)

        self.taskbar_icon = TaskBarIcon(self)
        self.latest_stable_version = "0"
        self.is_switching_text = False

        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.Bind(wx.EVT_MENU, self.OnExit, id=wx.ID_EXIT)
        self.Bind(wx.EVT_MENU, self.OnAbout, id=wx.ID_ABOUT)
        self.Bind(wx.EVT_MENU, self.OnChkUpdate, self.m_menuItem_chkUpdate)
        self.Bind(wx.EVT_MENU, self.OnNew, self.m_menuItem_new)
        self.Bind(wx.EVT_BUTTON, self.OnNew, self.m_btn_add)
        self.Bind(wx.EVT_TREE_ITEM_RIGHT_CLICK, self.OnTreeClick, self.m_tree)
        self.Bind(wx.EVT_TREE_ITEM_ACTIVATED, self.OnTreeSelect, self.m_tree)
        self.Bind(wx.EVT_TEXT, self.OnHostsChange, self.m_textCtrl_content)

        self.configs = {}
        if working_path:
            self.working_path = working_path
            self.configs_path = os.path.join(self.working_path, "configs.json")
            self.hosts_path = os.path.join(self.working_path, "hosts")
        self.current_hosts = None

        self.origin_hostses = []
        self.hostses = []

        self.init2()


    def init2(self):

        self.loadConfigs()
        self.getSystemHosts()
        self.scanSavedHosts()

        if not os.path.isdir(self.hosts_path):
            os.makedirs(self.hosts_path)


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


    def getSysHostsPath(self):
        u"""取得系统 host 文件的路径"""

        if os.name == "nt":
            path = "C:\\Windows\\System32\\drivers\\etc\\hosts"
        else:
            path = "/etc/hosts"

        return path if os.path.isfile(path) else None



    def getSystemHosts(self):

        path = self.getSysHostsPath()
        if path:
            hosts = Hosts(path=path, title="DEFAULT_hosts", is_origin=True)
            self.origin_hostses = [hosts]
            self.addHosts(hosts)
            self.selectHosts(hosts)


    def showHosts(self, hosts):

        self.is_switching_text = True
        self.m_textCtrl_content.SetValue(hosts.content)
        self.is_switching_text = False


    def selectHosts(self, hosts):

        self.m_tree.SelectItem(hosts.tree_item_id)

        if self.current_hosts:
            self.m_tree.SetItemBackgroundColour(self.current_hosts.tree_item_id, None)
            self.m_tree.SetItemBold(self.current_hosts.tree_item_id, bold=False)
        self.m_tree.SetItemBold(hosts.tree_item_id)
        self.m_tree.SetItemBackgroundColour(hosts.tree_item_id, "#ccccff")

        self.showHosts(hosts)

        self.current_hosts = hosts


    def addHosts(self, hosts):

        if hosts.is_origin:
            tree = self.m_tree_origin
            list_hosts = self.origin_hostses
        elif hosts.is_online:
            tree = self.m_tree_online
            list_hosts = self.hostses
        else:
            tree = self.m_tree_local
            list_hosts = self.hostses

        self.addHosts2(tree, hosts, list_hosts)


    def addHosts2(self, tree, hosts, list_hosts):

        if hosts.is_origin:
            hosts.tree_item_id = self.m_tree_origin

        else:
            list_hosts.append(hosts)
            hosts.tree_item_id = self.m_tree.AppendItem(tree, hosts.title)

        self.m_tree.Expand(tree)


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

            keys = ("hosts",)
            for k in keys:
                if k in configs:
                    self.configs[k] = configs[k]

            # 校验配置有效性
            if type(self.configs.get("hosts")) != list:
                self.configs["hosts"] = []

        self.saveConfigs()


    def saveConfigs(self):
        try:
            json.dump(self.configs, open(self.configs_path, "w"))
        except Exception:
            wx.MessageBox("保存配置信息失败！\n\n%s" % traceback.format_exc())


    def eachHosts(self, func):

        for hosts in self.hostses:
            func(hosts)


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



    def getHostsFromTreeByEvent(self, event):

        item = event.GetItem()
        if item in (self.m_tree_online, self.m_tree_local, self.m_tree_root):
            co.log("ignore")

        elif self.current_hosts and item == self.current_hosts.tree_item_id:
            co.log("is current hosts!")
            return self.current_hosts

        else:
            co.log("item")
            hostses = self.origin_hostses + self.hostses
            for hosts in hostses:
                if item == hosts.tree_item_id:
                    return hosts

        return None


    def OnHostsChange(self, event):

        if self.is_switching_text:
            return

        self.current_hosts.content = self.m_textCtrl_content.GetValue()
        self.saveHosts(self.current_hosts)


    def OnChkUpdate(self, event):

        co.log("chk update...")


    def OnExit(self, event):

        self.taskbar_icon.Destroy()
        self.Destroy()
        sys.exit()


    def OnAbout(self, event):

        dlg = ui.AboutBox(version=self.version, latest_stable_version=self.latest_stable_version)
        dlg.ShowModal()
        dlg.Destroy()


    def OnTreeClick(self, event):

        hosts = self.getHostsFromTreeByEvent(event)
        if hosts:
            self.showHosts(hosts)
            self.current_hosts = hosts


    def OnTreeSelect(self, event):

        hosts = self.getHostsFromTreeByEvent(event)
        if hosts:
            self.selectHosts(hosts)


    def OnNew(self, event):

        dlg = ui.Dlg_addHosts(self)

        if dlg.ShowModal() != wx.ID_OK:
            return

        is_online = dlg.m_radioBtn_online.GetValue()
        title = dlg.m_textCtrl_title.GetValue()
        url = dlg.m_textCtrl_url.GetValue()

        co.log([is_online, title, url])

        fn = self.makeNewHostsFileName()
        if not fn:
            wx.MessageBox(u"hosts 文件数超出限制，无法再创建新 hosts 了！")
            return

        src = os.path.join(self.hosts_path, fn)
        hosts = Hosts(src, is_online=is_online, title=title, url=url if is_online else None)
        hosts.content = u"# %s" % title
        self.saveHosts(hosts)

        self.addHosts(hosts)

