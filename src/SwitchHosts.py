# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import wx
from libs.MainFrame import MainFrame

class SwitchHosts(object):

    VERSION = "0.2.0.1763"

    def __init__(self):

        self.app = wx.App()
        self.frame = MainFrame(size=(640, 480), version=self.VERSION)


    def run(self):

        self.frame.Centre()
        self.frame.Show()
        self.app.MainLoop()


def main():

    sh = SwitchHosts()
    sh.run()


if __name__ == "__main__":
    main()

