# -*- coding: utf-8 -*-

import os
import wx, wx.html
import wx.lib.buttons as buttons
import common_operations as co


class Frame(wx.Frame):
    ID_HOSTS_TEXT = wx.NewId()

    def __init__(self,
                 parent=None, id=wx.ID_ANY, title="SwitchHost!", pos=wx.DefaultPosition,
                 size=wx.DefaultSize, style=wx.DEFAULT_FRAME_STYLE,
                 cls_TaskBarIcon=None
    ):
        wx.Frame.__init__(self, parent, id, title, pos, size, style)

        self.SetIcon(co.GetMondrianIcon())
        self.taskbar_icon = cls_TaskBarIcon(self)
        #        self.Bind(wx.EVT_CLOSE, self.OnClose)
        self.SetSizeHintsSz(wx.DefaultSize, wx.DefaultSize)

        self.m_menubar1 = wx.MenuBar(0)
        self.m_menu1 = wx.Menu()
        self.m_menuItem_new = wx.MenuItem(self.m_menu1, wx.ID_NEW, u"新建(&N)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu1.AppendItem(self.m_menuItem_new)
        self.m_menu1.AppendSeparator()
        self.m_menuItem_exit = wx.MenuItem(self.m_menu1, wx.ID_EXIT, u"退出(&X)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu1.AppendItem(self.m_menuItem_exit)

        self.m_menubar1.Append(self.m_menu1, u"文件(&F)")

        self.m_menu2 = wx.Menu()
        self.m_menuItem_about = wx.MenuItem(self.m_menu2, wx.ID_ABOUT, u"关于(&A)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu2.AppendItem(self.m_menuItem_about)

        self.m_menubar1.Append(self.m_menu2, u"帮助(&H)")

        self.SetMenuBar(self.m_menubar1)

        bSizer1 = wx.BoxSizer(wx.VERTICAL)

        self.m_panel1 = wx.Panel(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer4 = wx.BoxSizer(wx.HORIZONTAL)

        bSizer5 = wx.BoxSizer(wx.VERTICAL)

        self.m_list = wx.ListCtrl(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.Size(160, 320),
                                  wx.LC_REPORT)
        bSizer5.Add(self.m_list, 0, wx.ALL | wx.EXPAND, 5)

        bSizer61 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_btn_add = buttons.GenBitmapTextButton(self.m_panel1, wx.ID_ADD, co.GetMondrianBitmap(fn="add"), u"添加")
        bSizer61.Add(self.m_btn_add, 0, wx.ALL, 5)

        self.m_btn_del = buttons.GenBitmapTextButton(self.m_panel1, wx.ID_DELETE, co.GetMondrianBitmap(fn="delete"), u"删除")
        bSizer61.Add(self.m_btn_del, 0, wx.ALL, 5)

        bSizer5.Add(bSizer61, 1, wx.EXPAND, 5)

        bSizer4.Add(bSizer5, 0, wx.EXPAND, 5)

        bSizer6 = wx.BoxSizer(wx.VERTICAL)

        self.m_textCtrl_content = wx.TextCtrl(self.m_panel1, self.ID_HOSTS_TEXT, wx.EmptyString, wx.DefaultPosition,
                                              wx.DefaultSize,
                                              wx.TE_MULTILINE|wx.TE_RICH2|wx.TE_PROCESS_TAB|wx.HSCROLL)
        self.m_textCtrl_content.SetMaxLength(0)
        bSizer6.Add(self.m_textCtrl_content, 1, wx.ALL | wx.EXPAND, 5)

        bSizer7 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_panel3 = wx.Panel(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer71 = wx.BoxSizer(wx.HORIZONTAL)

#        self.m_btn_save = buttons.GenBitmapTextButton(self.m_panel3, wx.ID_SAVE, co.GetMondrianBitmap(fn="disk"), u"保存")
#        bSizer71.Add(self.m_btn_save, 0, wx.ALL, 0)

        self.m_panel3.SetSizer(bSizer71)
        self.m_panel3.Layout()
        bSizer71.Fit(self.m_panel3)
        bSizer7.Add(self.m_panel3, 1, wx.EXPAND | wx.ALL, 5)

        self.m_btn_apply = buttons.GenBitmapTextButton(self.m_panel1, wx.ID_APPLY, co.GetMondrianBitmap(fn="accept"), u"应用")
        #        self.m_btn_apply = wx.Button(self.m_panel1, wx.ID_APPLY, u"应用", wx.DefaultPosition, wx.DefaultSize, 0)
        bSizer7.Add(self.m_btn_apply, 0, wx.ALL, 5)

        if cls_TaskBarIcon and os.name == "nt":
            # ubuntu 10.04 下点击这个图标时会报错，图标的菜单无法正常工作
            # ubuntu 11.04 下这个图标总是无法显示
            # 由于跨平台问题，暂时决定只在 windows 下显示快捷的任务栏图标
            # 参见：http://stackoverflow.com/questions/7144756/wx-taskbaricon-on-ubuntu-11-04
            self.m_btn_exit = buttons.GenBitmapTextButton(self.m_panel1, wx.ID_CLOSE, co.GetMondrianBitmap(fn="door"), u"隐藏")
            #            self.m_btn_exit = wx.Button(self.m_panel1, wx.ID_CLOSE, u"隐藏", wx.DefaultPosition, wx.DefaultSize, 0)
            bSizer7.Add(self.m_btn_exit, 0, wx.ALL, 5)

        bSizer6.Add(bSizer7, 0, wx.EXPAND, 5)

        bSizer4.Add(bSizer6, 1, wx.EXPAND, 5)

        self.m_panel1.SetSizer(bSizer4)
        self.m_panel1.Layout()
        bSizer4.Fit(self.m_panel1)
        bSizer1.Add(self.m_panel1, 1, wx.EXPAND | wx.ALL, 0)

        self.SetSizer(bSizer1)
        self.Layout()

        self.Centre(wx.BOTH)

        self.font_bold = wx.SystemSettings.GetFont(wx.SYS_DEFAULT_GUI_FONT)
        self.font_bold.SetWeight(wx.BOLD)
        self.font_normal = wx.SystemSettings.GetFont(wx.SYS_DEFAULT_GUI_FONT)
        self.font_normal.SetWeight(wx.NORMAL)

        self.font_mono = wx.Font(10, wx.ROMAN, wx.NORMAL, wx.NORMAL, faceName="Courier New")


    def alert(self, title, msg):
        dlg = wx.MessageDialog(None, msg, title, wx.OK | wx.ICON_WARNING)
        dlg.ShowModal()
        dlg.Destroy()



class AboutHtml(wx.html.HtmlWindow):

    def __init__(self, parent, id=-1, size=(480, 360)):

        wx.html.HtmlWindow.__init__(self, parent, id, size=size)
        if "gtk2" in wx.PlatformInfo:
            self.SetStandardFonts()


    def OnLinkClicked(self, link):

        wx.LaunchDefaultBrowser(link.GetHref())


class AboutBox(wx.Dialog):
    u"""关于对话框

    参考自：http://wiki.wxpython.org/wxPython%20by%20Example
    """

    def __init__(self, version=None, latest_stable_version=None):

        wx.Dialog.__init__(self, None, -1, u"关于",
                style=wx.DEFAULT_DIALOG_STYLE|wx.THICK_FRAME|wx.TAB_TRAVERSAL
            )

        update_version = u"正在检查新版本..."
        if latest_stable_version:
            cv = self.compareVersion(version, latest_stable_version)
            if cv < 0:
                update_version = u"更新的稳定版 v%s 已经发布！" % latest_stable_version
            else:
                update_version = u"当前版本已是最新版。"
            

        hwin = AboutHtml(self)
        hwin.SetPage(u"""
            <font size="9" color="#44474D"><b>SwitchHost!</b></font><br />
            <font size="3" color="#44474D">%(version)s</font><br /><br />
            <font size="3" color="#909090"><i>%(update_version)s</i></font><br />
            <p>
                本程序用于在多个 hosts 之间快速切换。
            </p>
            <p>
                源码：<a href="https://github.com/oldj/SwitchHosts">https://github.com/oldj/SwitchHosts</a><br />
                作者：<a href="http://oldj.net">oldj</a>
            </p>
        """ % {
            "version": version,
            "update_version": update_version,
        })

        btn = hwin.FindWindowById(wx.ID_OK)
        irep = hwin.GetInternalRepresentation()
        hwin.SetSize((irep.GetWidth() + 25, irep.GetHeight() + 30))
        self.SetClientSize(hwin.GetSize())
        self.CenterOnParent(wx.BOTH)
        self.SetFocus()


    def compareVersion(self, v1, v2):
        u"""比较两个版本的大小
        版本的格式形如：0.1.5.3456

        如果 v1 > v2，则返回 1
        如果 v1 = v2，则返回 0
        如果 v1 < v2，则返回 -1
        """

        a1 = v1.split(".")
        a2 = v2.split(".")

        try:
            a1 = [int(i) for i in a1]
            a2 = [int(i) for i in a2]
        except Exception:
            return 0

        len1 = len(a1)
        len2 = len(a2)
        l = min(len1, len2)
        for i in range(l):
            if a1[i] > a2[i]:
                return 1
            elif a1[i] < a2[i]:
                return -1

        if len1 > len2:
            return 1
        elif len1 < len2:
            return -1
        else:
            return 0


class MyDialog1(wx.Dialog):
    def __init__( self, parent ):
        wx.Dialog.__init__(self, parent, id=wx.ID_ANY, title=wx.EmptyString, pos=wx.DefaultPosition,
            size=wx.Size(400, 300), style=wx.DEFAULT_DIALOG_STYLE)

        self.SetSizeHintsSz(wx.DefaultSize, wx.DefaultSize)

        bSizer9 = wx.BoxSizer(wx.VERTICAL)

        self.m_panel9 = wx.Panel(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer10 = wx.BoxSizer(wx.VERTICAL)

        self.m_radioBtn2 = wx.RadioButton(self.m_panel9, wx.ID_ANY, u"本地方案", wx.DefaultPosition, wx.DefaultSize, 0)
        self.m_radioBtn2.SetValue(True)
        bSizer10.Add(self.m_radioBtn2, 0, wx.ALL, 5)

        bSizer111 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_staticText21 = wx.StaticText(self.m_panel9, wx.ID_ANY, u"方案名：", wx.DefaultPosition, wx.Size(60, -1), 0)
        self.m_staticText21.Wrap(-1)
        bSizer111.Add(self.m_staticText21, 0, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        self.m_textCtrl31 = wx.TextCtrl(self.m_panel9, wx.ID_ANY, wx.EmptyString, wx.DefaultPosition, wx.DefaultSize, 0)
        bSizer111.Add(self.m_textCtrl31, 1, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        bSizer10.Add(bSizer111, 1, wx.EXPAND, 5)

        self.m_panel9.SetSizer(bSizer10)
        self.m_panel9.Layout()
        bSizer10.Fit(self.m_panel9)
        bSizer9.Add(self.m_panel9, 2, wx.EXPAND | wx.ALL, 5)

        self.m_staticline21 = wx.StaticLine(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.LI_HORIZONTAL)
        bSizer9.Add(self.m_staticline21, 0, wx.EXPAND | wx.ALL, 5)

        self.m_panel10 = wx.Panel(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer12 = wx.BoxSizer(wx.VERTICAL)

        self.m_radioBtn8 = wx.RadioButton(self.m_panel10, wx.ID_ANY, u"在线方案", wx.DefaultPosition, wx.DefaultSize, 0)
        bSizer12.Add(self.m_radioBtn8, 0, wx.ALL, 5)

        bSizer1611 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_staticText511 = wx.StaticText(self.m_panel10, wx.ID_ANY, u"方案名：", wx.DefaultPosition, wx.Size(60, -1), 0)
        self.m_staticText511.Wrap(-1)
        bSizer1611.Add(self.m_staticText511, 0, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        self.m_textCtrl611 = wx.TextCtrl(self.m_panel10, wx.ID_ANY, wx.EmptyString, wx.DefaultPosition, wx.DefaultSize,
            0)
        bSizer1611.Add(self.m_textCtrl611, 1, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        bSizer12.Add(bSizer1611, 1, wx.EXPAND, 5)

        bSizer16 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_staticText5 = wx.StaticText(self.m_panel10, wx.ID_ANY, u"URL：", wx.DefaultPosition, wx.Size(60, -1), 0)
        self.m_staticText5.Wrap(-1)
        bSizer16.Add(self.m_staticText5, 0, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        self.m_textCtrl6 = wx.TextCtrl(self.m_panel10, wx.ID_ANY, wx.EmptyString, wx.DefaultPosition, wx.DefaultSize, 0)
        bSizer16.Add(self.m_textCtrl6, 1, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        bSizer12.Add(bSizer16, 1, wx.EXPAND, 5)

        self.m_panel10.SetSizer(bSizer12)
        self.m_panel10.Layout()
        bSizer12.Fit(self.m_panel10)
        bSizer9.Add(self.m_panel10, 2, wx.EXPAND | wx.ALL, 5)

        m_sdbSizer1 = wx.StdDialogButtonSizer()
        self.m_sdbSizer1OK = wx.Button(self, wx.ID_OK)
        m_sdbSizer1.AddButton(self.m_sdbSizer1OK)
        self.m_sdbSizer1Cancel = wx.Button(self, wx.ID_CANCEL)
        m_sdbSizer1.AddButton(self.m_sdbSizer1Cancel)
        m_sdbSizer1.Realize();
        bSizer9.Add(m_sdbSizer1, 1, wx.EXPAND, 5)

        self.SetSizer(bSizer9)
        self.Layout()

        self.Centre(wx.BOTH)

    def __del__( self ):
        pass


