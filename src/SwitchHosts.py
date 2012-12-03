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

        if sys_type != "win":
            self.working_path = os.path.join(self.user_home, ".SwitchHosts")
        else:
            self.working_path = self.pwd


    def run(self):

        while True:

            app = wx.App()
            frame = MainFrame(
                mainjob=self,
                size=(640, 480),
                version=self.VERSION,
                working_path=self.working_path,
                taskbar_icon=self.taskbar_icon,
            )
            self.restart = False
            self.taskbar_icon = None

            frame.Centre()
            frame.Show()
            app.MainLoop()
            app.Destroy()

            time.sleep(0.1)
            if not self.restart:
                break


    def toRestart(self, taskbar_icon):

        self.restart = True
        self.taskbar_icon = taskbar_icon


def main():

    sh = SwitchHostsApp()
    sh.run()


if __name__ == "__main__":
    main()

