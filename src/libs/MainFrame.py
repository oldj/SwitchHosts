# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import wx
import ui
from TaskbarIcon import TaskBarIcon

class MainFrame(ui.Frame):

    ID_RENAME = wx.NewId()

    def __init__(self,
            parent=None, id=wx.ID_ANY, title=None, pos=wx.DefaultPosition,
            size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE,
            sys_hosts_title=None, version=None,
    ):

        self.version = version
        self.default_title = "SwitchHosts! %s" % version

        ui.Frame.__init__(self, parent, id,
            title or self.default_title, pos, size, style, cls_TaskBarIcon=TaskBarIcon)

        self.latest_stable_version = "0"

        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.init2(sys_hosts_title)


    def init2(self, sys_hosts_title):
        pass


    def OnAbout(self):
        dlg = ui.AboutBox(version=self.version, latest_stable_version=self.latest_stable_version)
        dlg.ShowModal()
        dlg.Destroy()

