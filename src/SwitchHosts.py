# -*- coding: utf-8 -*-

u"""
本程序用于快速切换 hosts 文件

@author: oldj
@blog: http://oldj.net
@email: oldj.wu@gmail.com
@version: 0.1.2.100
"""

import os
import sys
import glob
import wx
import libs.common_operations as co
import libs.ui as ui
from libs.cls_Hosts import Hosts

VERSION = "0.1.2"
DEFAULT_HOSTS_FN = u"DEFAULT.hosts"


class TaskBarIcon(wx.TaskBarIcon):
    ID_About = wx.NewId()
    ID_Exit = wx.NewId()
    ID_MainFrame = wx.NewId()

    def __init__(self, frame):
        wx.TaskBarIcon.__init__(self)
        #        super(wx.TaskBarIcon, self).__init__()
        self.frame = frame
        self.SetIcon(co.GetMondrianIcon(), "Switch Hosts!")
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

        for fn in hosts_list:
            oh = self.frame.getOHostsFromFn(fn)
            if oh:
                self.addHosts(menu, oh.getTitle())

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
        title = self.hosts[hosts_id]

        oh = self.frame.getOHostsFromTitle(title)
        if oh:
            co.switchHost(self, oh.path)
            self.frame.updateListCtrl()


class Frame(ui.Frame):

    ID_RENAME = wx.NewId()

    def __init__(
        self, parent=None, id=wx.ID_ANY, title="Switch Host!", pos=wx.DefaultPosition,
        size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE,
        sys_hosts_title=None,
    ):
        ui.Frame.__init__(self, parent, id, title, pos, size, style, TaskBarIcon=TaskBarIcon)

        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.init2(sys_hosts_title)


    def init2(self, sys_hosts_title):

        self.Bind(wx.EVT_MENU, self.newHosts, id=wx.ID_NEW)
        self.Bind(wx.EVT_MENU, self.OnExit, id=wx.ID_EXIT)
        self.Bind(wx.EVT_MENU, self.taskbar_icon.OnAbout, id=wx.ID_ABOUT)
        self.Bind(wx.EVT_BUTTON, self.OnHide, id=wx.ID_CLOSE)
        self.Bind(wx.EVT_BUTTON, self.applyHost, id=wx.ID_APPLY)
        self.Bind(wx.EVT_TEXT, self.hostsContentChange, id=self.ID_HOSTS_TEXT)

        hosts_cols = (
            (u"hosts", 130),
            (u"", 20),
            )
        for col, (txt, width) in enumerate(hosts_cols):
            self.m_list.InsertColumn(col, txt)
            self.m_list.SetColumnWidth(col, width)
        self.current_selected_hosts_index = -1
        self.current_selected_hosts_fn = None
        self.current_use_hosts_index = -1
        self.current_max_hosts_index = -1

        self.updateHostsList(sys_hosts_title)

        self.hosts_item_menu = wx.Menu()
        self.hosts_item_menu.Append(wx.ID_APPLY, u"切换到当前hosts")
#        self.hosts_item_menu.Append(wx.ID_EDIT, u"编辑")
        self.hosts_item_menu.Append(self.ID_RENAME, u"重命名")
        self.hosts_item_menu.AppendMenu(-1, u"图标", self.mkSubIconMenu())

        self.hosts_item_menu.AppendSeparator()
        self.hosts_item_menu.Append(wx.ID_DELETE, u"删除")

        self.m_btn_apply.Disable()

        self.Bind(wx.EVT_MENU, self.menuApplyHost, id=wx.ID_APPLY)
        self.Bind(wx.EVT_MENU, self.deleteHosts, id=wx.ID_DELETE)
        self.Bind(wx.EVT_MENU, self.renameHosts, id=self.ID_RENAME)

        self.Bind(wx.EVT_LIST_ITEM_RIGHT_CLICK, self.OnHostsItemRClick, self.m_list)
        self.Bind(wx.EVT_LIST_ITEM_SELECTED, self.OnHostsItemBeSelected, self.m_list)


    def mkSubIconMenu(self):
        u"""生成图标子菜单"""

        menu = wx.Menu()

        def _f(i):
            return lambda e: self.setHostIcon(e, i)

        icons_length = len(co.ICONS)
        for i in range(icons_length):
            item_id = wx.NewId()
            mitem = wx.MenuItem(menu, item_id, u"图标#%d" % (i + 1))
            mitem.SetBitmap(co.GetMondrianBitmap(i))
            menu.AppendItem(mitem)

            self.Bind(wx.EVT_MENU, _f(i), id=item_id)

        return menu


    def setHostIcon(self, event, i=0):

        index = self.current_selected_hosts_index
        ohosts = self.hosts_objects[index]
        ohosts.setIcon(i)
        self.m_list.SetItemImage(index, ohosts.icon_idx, ohosts.icon_idx)

        if i == self.current_use_hosts_index:
            self.SetIcon(co.GetMondrianIcon(i))
            self.taskbar_icon.SetIcon(co.GetMondrianIcon(i))


    def updateHostsList(self, selected_title=None):
        u"""更新 hosts 列表"""

        hosts_list = listLocalHosts()
#        hosts_list.insert(0, co.getSysHostsPath())
        hosts_list = [list(os.path.split(fn)) + [fn] for fn in hosts_list]
        self.hosts_lists = hosts_list
        self.hosts_objects = []

        self.m_list.DeleteAllItems()
        ch = self.taskbar_icon.current_hosts
        c_idx = -1
        c_fn = None

        il = wx.ImageList(16, 16, True)
        icons_count = len(co.ICONS)
        for i in xrange(icons_count):
            il.Add(co.GetMondrianBitmap(i))
        self.m_list.AssignImageList(il, wx.IMAGE_LIST_SMALL)

        for idx, (folder, fn, fn2) in enumerate(hosts_list):

            icon_idx = idx if idx < icons_count else icons_count - 1
            ohosts = Hosts(idx, fn2, icon_idx)
            self.hosts_objects.append(ohosts)

            if ohosts.getTitle() == selected_title:
                ch = self.taskbar_icon.current_hosts = fn2

            i, t, t2 = fn.partition(".")
            if i.isdigit():
                i = int(i)
                if i > self.current_max_hosts_index:
                    self.current_max_hosts_index = i

            c = ""
            index = self.m_list.InsertStringItem(sys.maxint, ohosts.getTitle())

            if (ch and ch == fn2) or \
                (not ch and co.decode(fn) == DEFAULT_HOSTS_FN):
                c = u"√"
            if c:
                c_idx = index
                c_fn = fn2
            self.m_list.SetStringItem(index, 1, c)
            self.m_list.SetItemImage(index, ohosts.icon_idx, ohosts.icon_idx)


        if self.current_selected_hosts_index > 0:
            c_idx = self.current_selected_hosts_index
            c_fn = self.current_selected_hosts_fn
        self.m_list.Select(c_idx)
        if c_fn and os.path.isfile(c_fn):
            self.m_textCtrl_content.Value = co.decode(open(c_fn, "rb").read())


    def hostsContentChange(self, event):

        self.m_btn_apply.Enable()


    def menuApplyHost(self, event):

        self.applyHost(event)


    def mkNewHostsPath(self):

        global g_local_hosts_dir

        self.current_max_hosts_index += 1
        return os.path.join(g_local_hosts_dir, "%d.hosts" % self.current_max_hosts_index)


    def newHosts(self, event=None, default=""):
        u"""新建一个 hosts"""

        global g_local_hosts_dir

        repeat = False
        title = default

        dlg = wx.TextEntryDialog(None, u"新建 hosts", u"输入 hosts 名：", title,
                style=wx.OK | wx.CANCEL
            )
        if dlg.ShowModal() == wx.ID_OK:
            title = dlg.GetValue().strip()

            if title:

                oh = self.getOHostsFromTitle(title)
                if oh:

                    repeat = True
                    self.alert(u"命名失败！", u"名为 '%s' 的 hosts 已经存在了！" % title)

                else:
                    # 保存新文件

                    path = self.mkNewHostsPath()
                    c = u"# %s" % title
                    oh = Hosts(path=path)
                    oh.setTitle(title)
                    oh.setContent(c)
                    self.updateHostsList()

        dlg.Destroy()

        if repeat:
            self.newHosts(event, default=title)


    def renameHosts(self, event):
        u"""重命名一个 hosts"""

        ohosts = self.hosts_objects[self.current_selected_hosts_index]
        old_title = ohosts.getTitle()

        repeat = False

        dlg = wx.TextEntryDialog(None, u"重命名 hosts", u"输入新的 hosts 名：", old_title,
                style=wx.OK | wx.CANCEL
            )
        if dlg.ShowModal() == wx.ID_OK:
            # 改名
            new_title = dlg.GetValue().strip()

            if new_title and new_title != old_title:

                oh2 = self.getOHostsFromTitle(new_title)

                if oh2:

                    repeat = True
                    self.alert(u"重命名失败！", u"'%s' 已存在，请先将它删除！" % new_title)

                else:

                    ohosts.setTitle(new_title)

                    if self.taskbar_icon.current_hosts == ohosts.path:
                        self.applyHost()
                    self.updateHostsList()

        dlg.Destroy()

        if repeat:
            self.renameHosts(event)


    def deleteHosts(self, event):
        u"""删除 hosts"""

        if self.current_selected_hosts_fn:
            path, fn = os.path.split(self.current_selected_hosts_fn)
            fn = co.decode(fn)
#            if os.name == "nt":
#                fn = fn.decode("GB18030")#.encode("UTF-8")

        if not self.current_selected_hosts_fn or \
            self.current_selected_hosts_fn == self.taskbar_icon.current_hosts or \
            (self.taskbar_icon.current_hosts is None and fn == DEFAULT_HOSTS_FN):
            self.alert(u"不可删除", u"当前 hosts 正在使用中，不可删除！")
            return

        dlg = wx.MessageDialog(None, u"确定要删除 hosts '%s'？" % fn, u"删除 hosts",
                wx.YES_NO | wx.ICON_QUESTION
            )
        ret_code = dlg.ShowModal()
        if ret_code == wx.ID_YES:
            # 删除当前 hosts
            try:
                os.remove(self.current_selected_hosts_fn)
            except Exception:
                pass

            self.updateHostsList()

        dlg.Destroy()


    def applyHost(self, event=None, ohosts=None):
        u"""应用某个 hosts"""

        # 保存当前 hosts 的内容
        c = self.m_textCtrl_content.Value.rstrip()
#        open(self.current_selected_hosts_fn, "wb").write(co.encode(c))
        ohosts = ohosts or self.getOHostsFromFn()
        if ohosts:
            ohosts.setContent(c)
            ohosts.save()

        # 切换 hosts
        co.switchHost(self.taskbar_icon, self.current_selected_hosts_fn)
        self.updateListCtrl()

        self.m_btn_apply.Disable()


    def getOHostsFromTitle(self, title):

        for oh in self.hosts_objects:
            if oh.getTitle() == title:
                return oh

        return None


    def getOHostsFromFn(self, fn=None):
        u"""从 hosts 的文件名取得它的 id"""

        if not fn:
            fn = self.current_selected_hosts_fn

        fn = co.decode(fn)

        for oh in self.hosts_objects:
            if oh.fn == fn or oh.dc_path == fn:
                return oh

        return None


    def updateListCtrl(self):

        for idx in range(len(self.hosts_lists)):
            c = ""
            if self.hosts_lists[idx][2] == self.taskbar_icon.current_hosts:
                c = u"√"
            self.m_list.SetStringItem(idx, 1, c)



    def OnHostsItemBeSelected(self, event):

        idx = event.GetIndex()
        fn = self.hosts_lists[idx][2]
#        ohosts = self.hosts_objects[idx]
        c = open(fn, "rb").read() if os.path.isfile(fn) else ""
        self.m_textCtrl_content.Value = co.decode(c)

        self.current_selected_hosts_index = idx
        self.current_selected_hosts_fn = fn
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

    fns = [fn for fn in glob.glob(os.path.join(g_local_hosts_dir, "*.hosts")) if\
           os.path.isfile(fn) and not fn.startswith(".")\
           and not fn.startswith("_")
    ]

    return fns


def getSysHostsTitle():

    global g_local_hosts_dir

    sys_hosts = co.getSysHostsPath()
    path = os.path.join(g_local_hosts_dir, DEFAULT_HOSTS_FN)

    ohosts_sys = Hosts(path=sys_hosts)
    sys_hosts_title = ohosts_sys.getTitle()
    is_title_valid = False

    fns = listLocalHosts()
    for fn in fns:
        fn2 = os.path.split(fn)[1]
        i, t, t2 = fn2.partition(".")
        if not i.isdigit():
            continue

        ohosts = Hosts(path=fn)
        if ohosts.getTitle() == sys_hosts_title:
            is_title_valid = True
            break

    if not is_title_valid:
        open(path, "wb").write(open(sys_hosts, "rb").read())
    else:
        if os.path.isfile(path):
            os.remove(path)

    return sys_hosts_title if is_title_valid else None


def init():
    global g_local_hosts_dir

    base_dir = os.getcwd()
    g_local_hosts_dir = os.path.join(base_dir, "hosts")
    if not os.path.isdir(g_local_hosts_dir):
        os.makedirs(g_local_hosts_dir)

    sys_hosts = co.getSysHostsPath()
    path = os.path.join(g_local_hosts_dir, DEFAULT_HOSTS_FN)

    return getSysHostsTitle()


def main():
    sys_hosts_title = init()
    app = wx.PySimpleApp()
    frame = Frame(size=(640, 480), sys_hosts_title=sys_hosts_title)
    frame.Centre()
    frame.Show()
    app.MainLoop()


if __name__ == "__main__":
    main()


