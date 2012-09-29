# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import wx
import common_operations as co
import lang

class TaskBarIcon(wx.TaskBarIcon):

    ID_About = wx.NewId()
    ID_Exit = wx.NewId()
    ID_MainFrame = wx.NewId()

    def __init__(self, main_frame):

        wx.TaskBarIcon.__init__(self)
        #        super(wx.TaskBarIcon, self).__init__()
        self.main_frame = main_frame
        self.SetIcon(co.GetMondrianIcon(), self.main_frame.default_title)
        self.Bind(wx.EVT_TASKBAR_LEFT_DCLICK, self.OnTaskBarLeftDClick)
        self.Bind(wx.EVT_MENU, self.main_frame.OnAbout, id=self.ID_About)
        self.Bind(wx.EVT_MENU, self.OnExit, id=self.ID_Exit)
        self.Bind(wx.EVT_MENU, self.OnMainFrame, id=self.ID_MainFrame)

        self.font_bold = wx.SystemSettings.GetFont(wx.SYS_DEFAULT_GUI_FONT)
        self.font_bold.SetWeight(wx.BOLD)


    def OnTaskBarLeftDClick(self, event):

        if self.main_frame.IsIconized():
            self.main_frame.Iconize(False)
        if not self.main_frame.IsShown():
            self.main_frame.Show(True)
        self.main_frame.Raise()


    def OnExit(self, event):

        self.main_frame.OnExit(event)


    def OnMainFrame(self, event):
        u"""显示主面板"""

        if not self.main_frame.IsShown():
            self.main_frame.Show(True)
        self.main_frame.Raise()

    # override
    def CreatePopupMenu(self):

        menu = wx.Menu()
        menu.Append(self.ID_MainFrame, u"SwitchHosts!")
        menu.AppendSeparator()

        for hosts in self.main_frame.all_hostses:
            if hosts:
                self.addHosts(menu, hosts)

        menu.AppendSeparator()
        menu.Append(self.ID_About, "About")
        menu.Append(self.ID_Exit, "Exit")

        return menu


    def addHosts(self, menu, hosts):
        u"""在菜单项中添加一个 hosts"""

        item_id = wx.NewId()
        title = hosts.title if not hosts.is_origin else lang.trans("origin_hosts")
        mitem = wx.MenuItem(menu, item_id, title, kind=wx.ITEM_RADIO)
        mitem.SetBitmap(co.GetMondrianBitmap(hosts.icon_idx))
        menu.AppendItem(mitem)

        menu.Check(item_id, self.main_frame.current_using_hosts == hosts)
        if self.main_frame.current_using_hosts ==  hosts:
            mitem.SetFont(self.font_bold)
#        self.hosts[item_id] = title
        hosts.taskbar_id = item_id

        self.Bind(wx.EVT_MENU, self.switchHost, id=item_id)


    def switchHost(self, event):

        item_id = event.GetId()
        for hosts in self.main_frame.all_hostses:
            if hosts.taskbar_id == item_id:
                self.main_frame.useHosts(hosts)

                return



