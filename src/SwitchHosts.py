# -*- coding: utf-8 -*-

u"""
本程序用于快速切换 hosts 文件

@author: oldj
@blog: http://oldj.net
@email: oldj.wu@gmail.com
"""

import os
import sys
import glob
import traceback
import wx

VERSION = "0.1.0"

if os.name == "nt":
    from libs.win_notify import showNotify
else:
    from libs.nix_notify import showNotify


def GetMondrianData():
    return "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10\x00\x00\x00\
\x10\x08\x06\x00\x00\x00\x1f\xf3\xffa\x00\x00\x00\x04gAMA\x00\x00\xaf\xc87\
\x05\x8a\xe9\x00\x00\x00\x19tEXtSoftware\x00Adobe ImageReadyq\xc9e<\x00\x00\
\x02=IDAT8\xcb\xa5\x93AK\xd4a\x10\xc6\x7f\xbb\xad\x1ad\x07MIwK\xad\xccMK\xcd\
\x83i\x14\x15D\x10\x94\x1ax0\xc2C\xa7\xbe@t\xc8Kt\xab/\xd0)*\xea\xe45\x12B\x02\
\xd3J-5w\xcd r\xb5\xd2M7SV$\xd4\xff\xff\x9dy\xdf\x0eF(E`>0\x97\xe1a`\xe67O\xc09\
\xc7f\x14\xdc\x88\xf9\xe2\xa3\xa6\xa7\xcd\xf7\xcee\xfe\xd7\x80\x96\x87\x8d\xf5\
\xbeoN\x1a\xcf\xbc[\xdb\x0f\\\xe9\xb8\xf4{\x07\xab\x16\xab\x16\x15\xdbg\xd5\xb6\
\x11\x0c^\x10#g\xc5Ht[f6\x91\xdc\x08s\x0bs$&\xc7c\xcf\xae\xbd\xa8\x01\x08\x01\
\xb4V]\xc6\xe1p\xcea\x9dcl\xf6\xe3\xd1\xf7\xc9\xd1.\xb1B\xb4\xf8\x00[3\xb3\x10\
\xb5\xa8S\xf2r\xf2X^^9|\xecF\xed\xcbW7\x07\x8e\x07\x9dsX\x1c\xd6\xd9_\xa5\xec\
\xc9\xdbKmI-\xe9\x854\x19\xa1\x0c\x8c\x08\xc6\x1a\x8c\x1a\x8c\n\xc6\x08\xc67\x19\
\x00!+\x96\x07o\xee\xa2\xa2\x04\xed\x16\xf6\xe7\x97q0r\x88\x9c\xed;\x08\xb9\x0c\
\xc6\x93\x13\xa4\xe6g\x98N\xcd\x10\xde\x19AEHL\x8c\x8f\x0c\xdc\x8a\xd7\x01\x04\
\xd6bl\xb9\xdf\x90-F\xaf\x97\x87+\xda\x8eD\xeb\x88%\x86\xe9\x89\xf5\xa8:\xdb\xd4\
\xd5\xd6\xdbQw\xb5F5d?\r\xde\x8e\x97\xfe\x95\x82\x0b\x82\r8\xe2c1\x96\xbc%\xa2E\
\xe5\xf8?\x0c^\xda\x03\xc0_\xf2\xf1\xe6\xbcut\x02\xad\xed\xcdN\x8c Fp\xe2(\xc8-d1\
\xbdHY8\xca\xbe\xa2R&\xa6\xc6\x19\x1e\x8d\x93H$8\x18\xad@\xc42484\x92h\xff\\\r\x102\
\xbe\xe1D\xf9)\xd4)j\x05\xb1\xca\\\xd6<\xf1\x0fq\x8aw\x95\x10.\x88PX\x10\xc1\x9e\xb6\
\xa8U,\x16o\xc5\xab\xda}>\xfcz\xea\xc9t]\xd0\xf8\xeb/,*,.-\x92\xfa\xfe\x8d\xe7\xbd\xdd\
\xcc\xa7\xe7\x11'\x88\x15\xc4)b\x15\x11E\x8c\x1a\x80@\xc3\x9d3N\x8c`|A\xfcUDb\xa4O<m\xf3\
\xd3\xfe\xea#\xf9\x1a\xcd\xcf\xcf\xa7\xb2\xba\x92\xe4\x97$C\xfdoc3\x9d\xb35\x7fP\xf8\x97\
\x8a\x1a#\xf5*\xda\xa5b'S\x9d\xb3\xd1\rga\xf2\xf1\xd7~5\xda\xadF+\xd7Q\xd8l\x9c\x7f\x02\
\x9f\xa4l\xb4#4\xd4~\x00\x00\x00\x00IEND\xaeB`\x82"

def GetMondrianBitmap():
    return wx.BitmapFromImage(GetMondrianImage())

def GetMondrianImage():
    import cStringIO
    stream = cStringIO.StringIO(GetMondrianData())
    return wx.ImageFromStream(stream)

def GetMondrianIcon():
    icon = wx.EmptyIcon()
    icon.CopyFromBitmap(GetMondrianBitmap())
    return icon


class TaskBarIcon(wx.TaskBarIcon):

    ID_About = wx.NewId()
    ID_Exit = wx.NewId()

    def __init__(self, frame):

        wx.TaskBarIcon.__init__(self)
#        super(wx.TaskBarIcon, self).__init__()
        self.frame = frame
        self.SetIcon(GetMondrianIcon(), "Switch Hosts!")
#        self.SetIcon(wx.Icon(name="arrow_switch.png", type=wx.BITMAP_TYPE_PNG), "Switch Hosts!")
        self.Bind(wx.EVT_TASKBAR_LEFT_DCLICK, self.OnTaskBarLeftDClick)
        self.Bind(wx.EVT_MENU, self.OnAbout, id=self.ID_About)
        self.Bind(wx.EVT_MENU, self.OnExit, id=self.ID_Exit)

        self.current_hosts = None


    def OnTaskBarLeftDClick(self, event):

#        if self.frame.IsIconized():
#           self.frame.Iconize(False)
#        if not self.frame.IsShown():
#           self.frame.Show(True)
#        self.frame.Raise()

        self.OnAbout(event)


    def OnExit(self, event):

        self.frame.Destroy()
        self.Destroy()
        sys.exit()


    def OnAbout(self, event):
#        wx.MessageBox(u"快速切换 hosts 文件！\n\nVERSION: %s" % VERSION, u"About")
        msg = u"Switch Hosts!\n\n" + \
            u"本程序用于在多个 hosts 配置之间快速切换。\n\n" +\
            u"by oldj, oldj.wu@gmail.com\n" +\
            u"https://github.com/oldj/SwitchHosts\n" +\
            u"VERSION: %s" % VERSION
        
        dlg = wx.MessageDialog(self.frame, msg, "About", wx.OK | wx.ICON_INFORMATION)
        dlg.ShowModal()
        dlg.Destroy()

    # override
    def CreatePopupMenu(self):

        self.hosts = {}

        hosts_list = listLocalHosts()
        menu = wx.Menu()
        menu.Append(wx.ID_ANY, u"Switch Hosts!")
        menu.AppendSeparator()

        if not self.current_hosts:
            menu.AppendRadioItem(wx.ID_ANY, u"系统默认")
        for fn in hosts_list:
            self.addHosts(menu, fn)

        menu.AppendSeparator()
        menu.Append(self.ID_About, "About")
        menu.Append(self.ID_Exit, "Exit")
        return menu


    def addHosts(self, menu, fn):
        u"""在菜单项中添加一个 hosts"""

        folder, fn2 = os.path.split(fn)
        hosts_id = wx.NewId()
        menu.AppendRadioItem(hosts_id, fn2)
        menu.Check(hosts_id, self.current_hosts == fn)
        self.hosts[hosts_id] = fn

        self.Bind(wx.EVT_MENU, self.switchHost, id=hosts_id)


    def switchHost(self, event):

        hosts_id = event.GetId()
        fn = self.hosts[hosts_id]
#        print(fn, os.path.isfile(fn))
        if not os.path.isfile(fn):
            wx.MessageBox(u"hosts 文件 '%s' 不存在！" % fn, "Error!")

        sys_hosts_fn = getSysHostsPath()
        try:
            open(sys_hosts_fn, "wb").write(open(fn, "rb").read())
            self.current_hosts = fn
            title = os.path.split(fn)[1]
            self.SetIcon(GetMondrianIcon(), "Hosts: %s" % title)
            showNotify(u"Hosts切换成功！", u"hosts 已切换为 %s" % title)

        except Exception:
            print(traceback.format_exc())
#            wx.MessageBox(traceback.format_exc(), "Error!")
            showNotify(u"Hosts切换失败！", u"hosts 未能成功切换！")


class Frame(wx.Frame):

    def __init__(
            self, parent=None, id=wx.ID_ANY, title="TaskBarIcon", pos=wx.DefaultPosition,
            size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE
            ):
        wx.Frame.__init__(self, parent, id, title, pos, size, style)

#        self.SetIcon(wx.Icon("arrow_switch.png", wx.BITMAP_TYPE_PNG))
        self.SetIcon(GetMondrianIcon())
        panel = wx.Panel(self, wx.ID_ANY)
        button = wx.Button(panel, wx.ID_ANY, "Hide Frame", pos=(60, 60))

        sizer = wx.BoxSizer()
        sizer.Add(button, 0)
        panel.SetSizer(sizer)
        self.taskBarIcon = TaskBarIcon(self)

        # bind event
        self.Bind(wx.EVT_BUTTON, self.OnHide, button)
        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.Bind(wx.EVT_ICONIZE, self.OnIconfiy)


    def OnHide(self, event):
        self.Hide()


    def OnIconfiy(self, event):
        wx.MessageBox("Frame has been iconized!", "Prompt")
        event.Skip()


    def OnClose(self, event):
        self.taskBarIcon.Destroy()
        self.Destroy()


def getSysHostsPath():
    u"""取得系统 host 文件的路径"""

    if os.name == "nt":
        path = "C:\\Windows\\System32\\drivers\\etc\\hosts"
    else:
        path = "/etc/hosts"

    return path if os.path.isfile(path) else None


def listLocalHosts():
    u"""列出指定目录下的 host 文件列表"""

    global g_local_hosts_dir

    fns = [fn for fn in glob.glob(os.path.join(g_local_hosts_dir, "*")) if \
           os.path.isfile(fn) and not fn.startswith(".") \
           and not fn.startswith("_")
    ]

    return fns


def init():

    global g_local_hosts_dir

    base_dir = os.getcwd()
    g_local_hosts_dir = os.path.join(base_dir, "hosts")
    if not os.path.isdir(g_local_hosts_dir):
        os.makedirs(g_local_hosts_dir)


def main():
    init()
    app = wx.PySimpleApp()
    frame = Frame(size=(640, 480))
    frame.Centre()
#    frame.Show()
    app.MainLoop()


if __name__ == "__main__":
    main()


