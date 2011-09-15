# -*- coding: utf-8 -*-

u"""
本程序用于快速切换 hosts 文件

@author: oldj
@blog: http://oldj.net
@email: oldj.wu@gmail.com
@version: 0.1.1.100
"""

import os
import sys
import glob
import traceback
import wx
import libs.common_operations as co
import libs.ui as ui

VERSION = "0.1.1"
DEFAULT_HOSTS_FN = u"DEFAULT"


class TaskBarIcon(wx.TaskBarIcon):
    ID_About = wx.NewId()
    ID_Exit = wx.NewId()
    ID_MainFrame = wx.NewId()

    def __init__(self, frame):
        wx.TaskBarIcon.__init__(self)
        #        super(wx.TaskBarIcon, self).__init__()
        self.frame = frame
        self.SetIcon(co.GetMondrianIcon(), "Switch Hosts!")
        #        self.SetIcon(wx.Icon(name="arrow_switch.png", type=wx.BITMAP_TYPE_PNG), "Switch Hosts!")
        self.Bind(wx.EVT_TASKBAR_LEFT_DCLICK, self.OnTaskBarLeftDClick)
        self.Bind(wx.EVT_MENU, self.OnAbout, id=self.ID_About)
        self.Bind(wx.EVT_MENU, self.OnExit, id=self.ID_Exit)
        self.Bind(wx.EVT_MENU, self.OnMainFrame, id=self.ID_MainFrame)

        self.current_hosts = None


    def notify(self, msg=None, title=None):
        import libs.ToasterBox as TB

        sw, sh = wx.GetDisplaySize()
        width, height = 210, 50
        px = sw - 230
        py = sh - 100

        tb = TB.ToasterBox(self.frame)
        tb.SetPopupText(msg)
        tb.SetPopupSize((width, height))
        tb.SetPopupPosition((px, py))
        tb.Play()


    def OnTaskBarLeftDClick(self, event):
        if self.frame.IsIconized():
            self.frame.Iconize(False)
        if not self.frame.IsShown():
            self.frame.Show(True)
        self.frame.Raise()

    #        self.OnAbout(event)


    def OnExit(self, event):
        self.frame.Destroy()
        self.Destroy()
        sys.exit()


    def OnAbout(self, event):
    #        wx.MessageBox(u"快速切换 hosts 文件！\n\nVERSION: %s" % VERSION, u"About")
        msg = u"Switch Hosts!\n\n" +\
              u"本程序用于在多个 hosts 配置之间快速切换。\n\n" +\
              u"by oldj, oldj.wu@gmail.com\n" +\
              u"https://github.com/oldj/SwitchHosts\n" +\
              u"VERSION: %s" % VERSION

        dlg = wx.MessageDialog(self.frame, msg, "About", wx.OK | wx.ICON_INFORMATION)
        dlg.ShowModal()
        dlg.Destroy()


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
        menu.Append(self.ID_MainFrame, u"Switch Hosts!")
        menu.AppendSeparator()

#        if not self.current_hosts:
#            menu.AppendRadioItem(wx.ID_ANY, DEFAULT_HOSTS_FN)
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

        co.switchHost(self, fn)
        self.frame.updateListCtrl()


class Frame(ui.Frame):

    ID_RENAME = wx.NewId()

    def __init__(
        self, parent=None, id=wx.ID_ANY, title="Switch Host!", pos=wx.DefaultPosition,
        size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE
    ):
        ui.Frame.__init__(self, parent, id, title, pos, size, style, TaskBarIcon=TaskBarIcon)

        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.init2()


    def init2(self):
        self.Bind(wx.EVT_MENU, self.OnExit, id=wx.ID_EXIT)
        self.Bind(wx.EVT_MENU, self.taskbar_icon.OnAbout, id=wx.ID_ABOUT)
        self.Bind(wx.EVT_BUTTON, self.OnHide, id=wx.ID_CLOSE)
        self.Bind(wx.EVT_BUTTON, self.applyHost, id=wx.ID_APPLY)
        self.Bind(wx.EVT_TEXT, self.hostsContentChange, id=self.ID_HOSTS_TEXT)

        hosts_cols = (
            (u"", wx.LIST_AUTOSIZE),
            (u"hosts", 120),
            )
        for col, (txt, width) in enumerate(hosts_cols):
            self.m_list.InsertColumn(col, txt)
            self.m_list.SetColumnWidth(col, width)
        self.updateHostsList()

        self.hosts_item_menu = wx.Menu()
        self.hosts_item_menu.Append(wx.ID_APPLY, u"切换到当前hosts")
#        self.hosts_item_menu.Append(wx.ID_EDIT, u"编辑")
        self.hosts_item_menu.Append(self.ID_RENAME, u"重命名")
        self.hosts_item_menu.AppendSeparator()
        self.hosts_item_menu.Append(wx.ID_DELETE, u"删除")

        self.m_btn_apply.Disable()

        self.Bind(wx.EVT_MENU, self.menuApplyHost, id=wx.ID_APPLY)
        self.Bind(wx.EVT_MENU, self.deleteHosts, id=wx.ID_DELETE)

        self.Bind(wx.EVT_LIST_ITEM_RIGHT_CLICK, self.OnHostsItemRClick, self.m_list)
        self.Bind(wx.EVT_LIST_ITEM_SELECTED, self.OnHostsItemBeSelected, self.m_list)



    def updateHostsList(self):
        u"""更新 hosts 列表"""

        self.current_hosts_index = -1
        self.current_hosts_fn = None
        hosts_list = listLocalHosts()
#        hosts_list.insert(0, co.getSysHostsPath())
        hosts_list = [list(os.path.split(fn)) + [fn] for fn in hosts_list]
        self.hosts_lists = hosts_list

        self.m_list.DeleteAllItems()

        for idx, (folder, fn, fn2) in enumerate(hosts_list):
            c = ""
            if fn == DEFAULT_HOSTS_FN:
                c = u"√"
                self.m_textCtrl_content.Value = open(fn2, "rb").read()
            index = self.m_list.InsertStringItem(sys.maxint, c)
            self.m_list.SetStringItem(index, 1, fn)
#            self.m_list.SetStringItem(index, 2, folder)


    def hostsContentChange(self, event):

        self.m_btn_apply.Enable()


    def menuApplyHost(self, event):

        print self.current_hosts_fn
        self.applyHost(event)


    def deleteHosts(self, event):
        u"""删除 hosts"""

        path, fn = os.path.split(self.current_hosts_fn)
        if os.name == "nt":
            fn = fn.decode("GB18030")#.encode("UTF-8")

        dlg = wx.MessageDialog(None, u"确定要删除 hosts '%s'？" % fn, u"删除 hosts",
                wx.YES_NO | wx.ICON_QUESTION
            )
        ret_code = dlg.ShowModal()
        if ret_code == wx.ID_YES:
            # 删除当前 hosts
            try:
                os.remove(self.current_hosts_fn)
            except Exception:
                pass

            self.updateHostsList()

        dlg.Destroy()


    def applyHost(self, event=None):
        u"""应用某个 hosts"""

        # 保存当前 hosts 的内容
        c = self.m_textCtrl_content.Value.rstrip()
        open(self.current_hosts_fn, "wb").write(c)

        # 切换 hosts
        co.switchHost(self.taskbar_icon, self.current_hosts_fn)
        self.updateListCtrl()

        self.m_btn_apply.Disable()


    def updateListCtrl(self):

        for idx in range(len(self.hosts_lists)):
            c = ""
            if self.hosts_lists[idx][2] == self.taskbar_icon.current_hosts:
                c = u"√"
            self.m_list.SetStringItem(idx, 0, c)



    def OnHostsItemBeSelected(self, event):

        idx = event.GetIndex()
        fn = self.hosts_lists[idx][2]
        c = open(fn, "rb").read() if os.path.isfile(fn) else ""
        self.m_textCtrl_content.Value = c

        self.current_hosts_index = idx
        self.current_hosts_fn = fn
        self.m_btn_apply.Enable()


    def OnHostsItemRClick(self, event):
        u""""""

        self.m_list.PopupMenu(self.hosts_item_menu, event.GetPosition())


    def editHost(self, event):
        u"""编辑一个 hosts 文件"""

        print(1)


    def OnHide(self, event):
        self.Hide()


    def OnIconfiy(self, event):
        wx.MessageBox("Frame has been iconized!", "Prompt")
        event.Skip()

    def OnExit(self, event):
    #        self.taskbar_icon.Destroy()
    #        self.Destroy()
    #        event.Skip()
        self.taskbar_icon.OnExit(event)

    def OnClose(self, event):
        self.Hide()
        return False


def listLocalHosts():
    u"""列出指定目录下的 host 文件列表"""

    global g_local_hosts_dir

    fns = [fn for fn in glob.glob(os.path.join(g_local_hosts_dir, "*")) if\
           os.path.isfile(fn) and not fn.startswith(".")\
           and not fn.startswith("_")
    ]

    return fns


def init():
    global g_local_hosts_dir

    base_dir = os.getcwd()
    g_local_hosts_dir = os.path.join(base_dir, "hosts")
    if not os.path.isdir(g_local_hosts_dir):
        os.makedirs(g_local_hosts_dir)

    sys_hosts = co.getSysHostsPath()
    open(os.path.join(g_local_hosts_dir, DEFAULT_HOSTS_FN), "wb").write(open(sys_hosts, "rb").read())


def main():
    init()
    app = wx.PySimpleApp()
    frame = Frame(size=(640, 480))
    frame.Centre()
    frame.Show()
    app.MainLoop()


if __name__ == "__main__":
    main()


