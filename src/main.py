# -*- coding: utf-8 -*-

import os
import wx

class MyAPP(wx.APP):

    def OnInit(self):
        self.res = wx.xrc.XmlResource(os.path.join("src", "gui.xrc"))

    def initFrame(self):
        self.frame = self.res.LoadFrame(None)
