# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import os
import sys
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
            version=None, configs_path=None,
    ):

        self.version = version
        self.default_title = "SwitchHosts! %s" % version

        ui.Frame.__init__(self, parent, id,
            title or self.default_title, pos, size, style)

        self.taskbar_icon = TaskBarIcon(self)
        self.latest_stable_version = "0"

        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.Bind(wx.EVT_MENU, self.OnExit, id=wx.ID_EXIT)
        self.Bind(wx.EVT_MENU, self.OnAbout, id=wx.ID_ABOUT)
        self.Bind(wx.EVT_MENU, self.OnChkUpdate, self.m_menuItem_chkUpdate)

        self.configs = {}
        self.configs_path = configs_path
        self.current_hosts = None

        self.origin_hosts = []
        self.local_hosts = []
        self.online_hosts = []

        self.init2()


    def init2(self):
        self.loadConfigs()
        self.getSystemHosts()


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
            hosts = Hosts(src=path, title="DEFAULT_hosts", is_origin=True)
            self.addHosts(hosts)
            self.selectHosts(hosts)


    def showHosts(self, hosts):

        self.m_textCtrl_content.SetValue(hosts.content)


    def selectHosts(self, hosts):

        self.m_tree.SelectItem(hosts.tree_item_id)

        if self.current_hosts:
            self.m_tree.SetItemBold(self.current_hosts.tree_item_id, bold=False)
        self.m_tree.SetItemBold(hosts.tree_item_id)
        self.showHosts(hosts)

        self.current_hosts = hosts


    def addHosts(self, hosts):

        if hosts.is_origin:
            tree = self.m_tree_origin
            list_hosts = self.origin_hosts
        elif hosts.is_online:
            tree = self.m_tree_online
            list_hosts = self.online_hosts
        else:
            tree = self.m_tree_local
            list_hosts = self.local_hosts

        self.addHosts2(tree, hosts, list_hosts)


    def addHosts2(self, tree, hosts, list_hosts):

        if hosts.is_origin:
            pass
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

            self.configs.update(configs)

        self.saveConfigs()


    def saveConfigs(self):
        try:
            json.dump(self.configs, open(self.configs_path, "w"))
        except Exception:
            wx.MessageBox("保存配置信息失败！\n\n%s" % traceback.format_exc())


    def OnChkUpdate(self, event):

        co.debugLog("chk update...")


    def OnExit(self, event):

        self.taskbar_icon.Destroy()
        self.Destroy()
        sys.exit()


    def OnAbout(self, event):

        dlg = ui.AboutBox(version=self.version, latest_stable_version=self.latest_stable_version)
        dlg.ShowModal()
        dlg.Destroy()

