# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import sys
import wx
import common_operations as co

class TaskBarIcon(wx.TaskBarIcon):
    ID_About = wx.NewId()
    ID_Exit = wx.NewId()
    ID_MainFrame = wx.NewId()

    def __init__(self, frame):
        wx.TaskBarIcon.__init__(self)
        #        super(wx.TaskBarIcon, self).__init__()
        self.frame = frame
        self.SetIcon(co.GetMondrianIcon(), "SwitchHosts! %s")
        self.Bind(wx.EVT_TASKBAR_LEFT_DCLICK, self.OnTaskBarLeftDClick)
        self.Bind(wx.EVT_MENU, self.frame.OnAbout, id=self.ID_About)
        self.Bind(wx.EVT_MENU, self.OnExit, id=self.ID_Exit)
        self.Bind(wx.EVT_MENU, self.OnMainFrame, id=self.ID_MainFrame)

        self.current_hosts = None

        self.font_bold = wx.SystemSettings.GetFont(wx.SYS_DEFAULT_GUI_FONT)
        self.font_bold.SetWeight(wx.BOLD)


    def OnTaskBarLeftDClick(self, event):
        if self.frame.IsIconized():
            self.frame.Iconize(False)
        if not self.frame.IsShown():
            self.frame.Show(True)
        self.frame.Raise()


    def OnExit(self, event):
        self.frame.Destroy()
        self.Destroy()
        sys.exit()


    def OnMainFrame(self, event):
        u"""显示主面板"""
        if not self.frame.IsShown():
            self.frame.Show(True)
        self.frame.Raise()

    # override
    def CreatePopupMenu(self):
        self.hosts = {}

        hosts_list = listLocalHosts()
        menu = wx.Menu()
        menu.Append(self.ID_MainFrame, u"SwitchHosts!")
        menu.AppendSeparator()

        for fn in hosts_list:
            oh = self.frame.getOHostsFromFn(fn)
            if oh:
                self.addHosts(menu, oh)

        menu.AppendSeparator()
        menu.Append(self.ID_About, "About")
        menu.Append(self.ID_Exit, "Exit")
        return menu


    def addHosts(self, menu, ohost):
        u"""在菜单项中添加一个 hosts"""

        title = ohost.getTitle()

        item_id = wx.NewId()
        mitem = wx.MenuItem(menu, item_id, title, kind=wx.ITEM_RADIO)
        mitem.SetBitmap(co.GetMondrianBitmap(ohost.icon_idx))
        menu.AppendItem(mitem)

        menu.Check(item_id, self.current_hosts == ohost.path)
        if self.current_hosts == ohost.path:
            mitem.SetFont(self.font_bold)
        self.hosts[item_id] = title

        self.Bind(wx.EVT_MENU, self.switchHost, id=item_id)


    def switchHost(self, event):
        hosts_id = event.GetId()
        title = self.hosts[hosts_id]

        oh = self.frame.getOHostsFromTitle(title)
        if oh:
            co.switchHost(self, oh.path)
            self.frame.updateListCtrl()

