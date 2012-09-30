# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import os
import time
import wx
from libs.MainFrame import MainFrame

class SwitchHosts(object):

    VERSION = "0.2.0.1763"

    def __init__(self):

        self.pwd = os.path.abspath(os.path.split(__file__)[0])
        self.restart = False
        self.taskbar_icon = None


    def run(self):

        while True:

            app = wx.App()
            frame = MainFrame(
                mainjob=self,
                size=(640, 480),
                version=self.VERSION,
                working_path=self.pwd,
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

    sh = SwitchHosts()
    sh.run()


if __name__ == "__main__":
    main()

