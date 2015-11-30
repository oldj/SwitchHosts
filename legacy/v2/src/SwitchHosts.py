# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import os
import time
import wx
import libs.common_operations as co
from libs.MainFrame import MainFrame
from libs.VERSION import VERSION as sVer


class SwitchHostsApp(object):
    VERSION = sVer

    def __init__(self):

        sys_type = co.getSystemType()

        self.pwd = os.path.abspath(os.path.split(__file__)[0])
        self.user_home = os.path.expanduser("~")
        self.restart = False
        self.taskbar_icon = None

        self.sys_type = sys_type
        if sys_type != "win":
            self.working_path = os.path.join(self.user_home, ".SwitchHosts")
        else:
            self.working_path = self.pwd

    def run(self):

        # instance_name = None

        while True:

            app = wx.App(False)

            instance_name = "%s-%s" % (app.GetAppName(), wx.GetUserId())
            instance_checker = wx.SingleInstanceChecker(instance_name, self.working_path)
            if instance_checker.IsAnotherRunning():
                dlg = wx.MessageDialog(
                    None,
                    u"SwitchHosts! 已经在运行了或上次没有正常退出，要重新打开吗？",
                    u"SwitchHosts!",
                    wx.YES_NO | wx.ICON_QUESTION
                )
                ret_code = dlg.ShowModal()
                if ret_code != wx.ID_YES:
                    dlg.Destroy()
                    return

                dlg.Destroy()

            frame = MainFrame(
                mainjob=self,
                instance_name=instance_name,
                size=(640, 480),
                version=self.VERSION,
                working_path=self.working_path,
                taskbar_icon=self.taskbar_icon,
            )
            self.restart = False
            self.taskbar_icon = None

            self.app = app
            self.frame = frame
            self.bindEvents()

            frame.Centre()
            frame.Show()
            app.MainLoop()
            app.Destroy()

            time.sleep(0.1)
            if not self.restart:
                break

    def bindEvents(self):
        u"""绑定各种事件"""

        # self.app.Bind(wx.EVT_TASKBAR_LEFT_DCLICK, self.OnTaskBarActivate)
        # self.app.Bind(wx.EVT_MENU, self.OnTaskBarActivate, id=self.TBMENU_RESTORE)
        # self.app.Bind(wx.EVT_MENU, self.OnTaskBarClose, id=self.TBMENU_CLOSE)
        self.app.Bind(wx.EVT_ACTIVATE_APP, self.OnActivate)

    def OnTaskBarActivate(self, event):
        u""""""

        if self.frame.IsIconized():
            self.frame.Iconize(False)
        if not self.frame.IsShown():
            self.frame.Show(True)
        self.frame.Raise()

    def OnActivate(self, event):
        u"""
        Mac 下，程序最小化到 dock 栏后，点击图标默认不会恢复窗口，需要监听事件
        参见：http://wxpython-users.1045709.n5.nabble.com/OS-X-issue-raising-minimized-frame-td2371601.html
        """

        if self.sys_type == "mac" and event.GetActive():
            if self.frame.IsIconized():
                self.frame.Iconize(False)
            if not self.frame.IsShown():
                self.frame.Show(True)
            self.frame.Raise()
        event.Skip()

    def OnTaskBarClose(self, event):
        u""""""
        wx.CallAfter(self.frame.Close)

    def toRestart(self, taskbar_icon):

        self.restart = True
        self.taskbar_icon = taskbar_icon


def main():
    sh = SwitchHostsApp()
    sh.run()


if __name__ == "__main__":
    main()
