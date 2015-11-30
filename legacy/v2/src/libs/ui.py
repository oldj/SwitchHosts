# -*- coding: utf-8 -*-

import os
import wx, wx.html
import wx.lib.buttons as buttons
import common_operations as co
import lang


class Frame(wx.Frame):

    ID_HOSTS_TEXT = wx.NewId()

    def __init__(self,
                 parent=None, id=wx.ID_ANY, title="SwitchHosts!", pos=wx.DefaultPosition,
                 size=wx.DefaultSize,
                 style=wx.DEFAULT_FRAME_STYLE,
                 cls_TaskBarIcon=None
    ):
        wx.Frame.__init__(self, parent, id, title, pos, size, style)

        self.SetIcon(co.GetMondrianIcon())
        self.SetSizeHintsSz(wx.Size(400, 300), wx.DefaultSize)

        self.m_menubar1 = wx.MenuBar(0)
        self.m_menu1 = wx.Menu()
        self.m_menuItem_new = wx.MenuItem(self.m_menu1, wx.ID_NEW, u"新建(&N)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu1.AppendItem(self.m_menuItem_new)
        self.m_menu1.AppendSeparator()

        self.m_menuItem_export = wx.MenuItem(self.m_menu1, wx.NewId(), u"导出(&E)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu1.AppendItem(self.m_menuItem_export)
        self.m_menuItem_import = wx.MenuItem(self.m_menu1, wx.NewId(), u"导入(&I)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu1.AppendItem(self.m_menuItem_import)

        self.m_menu1.AppendSeparator()
        self.m_menuItem_exit = wx.MenuItem(self.m_menu1, wx.ID_EXIT, u"退出(&X)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu1.AppendItem(self.m_menuItem_exit)

        self.m_menubar1.Append(self.m_menu1, u"文件(&F)")

        self.m_menu2 = wx.Menu()
        self.m_menuItem_about = wx.MenuItem(self.m_menu2, wx.ID_ABOUT, u"关于(&A)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu2.AppendItem(self.m_menuItem_about)
        self.m_menuItem_homepage = wx.MenuItem(self.m_menu2, wx.ID_ANY, u"主页(&H)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu2.AppendItem(self.m_menuItem_homepage)
        self.m_menuItem_feedback = wx.MenuItem(self.m_menu2, wx.ID_ANY, u"反馈建议(&F)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu2.AppendItem(self.m_menuItem_feedback)
        self.m_menuItem_chkUpdate = wx.MenuItem(self.m_menu2, wx.ID_ANY, u"检查更新(&U)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu2.AppendItem(self.m_menuItem_chkUpdate)
        self.m_menuItem_donate = wx.MenuItem(self.m_menu2, wx.ID_ANY, u"捐赠(&D)", wx.EmptyString, wx.ITEM_NORMAL)
        self.m_menu2.AppendItem(self.m_menuItem_donate)

        self.m_menubar1.Append(self.m_menu2, u"帮助(&H)")

        self.SetMenuBar(self.m_menubar1)

        bSizer1 = wx.BoxSizer(wx.VERTICAL)

        self.m_panel1 = wx.Panel(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer4 = wx.BoxSizer(wx.HORIZONTAL)

        bSizer5 = wx.BoxSizer(wx.VERTICAL)

        self.m_tree = wx.TreeCtrl(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.Size(200, -1),
            style=wx.TR_DEFAULT_STYLE|wx.NO_BORDER|wx.TR_NO_LINES\
                |wx.TR_FULL_ROW_HIGHLIGHT#|wx.TR_HIDE_ROOT
        )

        self.m_tree.SetBackgroundColour(wx.Colour(218, 223, 230))
        self.m_tree_root = self.m_tree.AddRoot(u"hosts")
        self.m_tree_common = self.m_tree.AppendItem(self.m_tree_root, lang.trans("common_hosts"))
        self.m_tree_origin = self.m_tree.AppendItem(self.m_tree_root, lang.trans("origin_hosts"))
        self.m_tree_local = self.m_tree.AppendItem(self.m_tree_root, lang.trans("local_hosts"))
        self.m_tree_online = self.m_tree.AppendItem(self.m_tree_root, lang.trans("online_hosts"))
        self.m_tree.SetItemTextColour(self.m_tree_root, "#999999")
        self.m_tree.SetItemTextColour(self.m_tree_common, "#3333ff")
        self.m_tree.SetItemTextColour(self.m_tree_local, "#999999")
        self.m_tree.SetItemTextColour(self.m_tree_online, "#999999")
        self.m_tree.ExpandAll()
        bSizer5.Add(self.m_tree, 1, wx.ALL | wx.EXPAND, 0)

        self.image_list = wx.ImageList(16, 16)
        self.ico_folder_idx = self.image_list.Add(
            wx.ArtProvider.GetBitmap(wx.ART_FOLDER, wx.ART_OTHER, (16, 16))
        )
        self.ico_folder_open_idx = self.image_list.Add(
            wx.ArtProvider.GetBitmap(wx.ART_FILE_OPEN, wx.ART_OTHER, (16, 16))
        )
        self.ico_file_idx = self.image_list.Add(
            wx.ArtProvider.GetBitmap(wx.ART_NORMAL_FILE, wx.ART_OTHER, (16, 16))
        )
        self.ico_colors_idx = []
        for i, icon in enumerate(co.ICONS):
            self.ico_colors_idx.append(self.image_list.Add(co.GetMondrianBitmap(i)))

        self.m_tree.AssignImageList(self.image_list)

        for item_idx in (self.m_tree_root, self.m_tree_local, self.m_tree_online):
            self.m_tree.SetItemImage(item_idx, self.ico_folder_idx, wx.TreeItemIcon_Normal)
            self.m_tree.SetItemImage(item_idx, self.ico_folder_open_idx, wx.TreeItemIcon_Expanded)

        self.m_staticline_left_bottom = wx.StaticLine(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize,
            wx.LI_HORIZONTAL)
        bSizer5.Add(self.m_staticline_left_bottom, 0, wx.EXPAND | wx.ALL, 0)

        bSizer61 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_btn_add = wx.BitmapButton(self.m_panel1, wx.ID_ADD,
            co.GetMondrianBitmap(fn="add"),
            wx.DefaultPosition,
            wx.DefaultSize, wx.BU_AUTODRAW|wx.NO_BORDER)
        self.m_btn_add.SetToolTipString(u"添加")
        bSizer61.Add(self.m_btn_add, 0, wx.EXPAND|wx.TOP|wx.BOTTOM|wx.LEFT, 5)

        self.m_btn_refresh = wx.BitmapButton(self.m_panel1, wx.ID_REFRESH,
            co.GetMondrianBitmap(fn="arrow_refresh"),
            wx.DefaultPosition,
            wx.DefaultSize, wx.BU_AUTODRAW|wx.NO_BORDER)
        self.m_btn_add.SetToolTipString(u"刷新")
        bSizer61.Add(self.m_btn_refresh, 0, wx.EXPAND|wx.TOP|wx.BOTTOM|wx.LEFT, 5)

        self.m_btn_edit_info = wx.BitmapButton(self.m_panel1, wx.ID_EDIT,
            co.GetMondrianBitmap(fn="pencil"),
            wx.DefaultPosition,
            wx.DefaultSize, wx.BU_AUTODRAW|wx.NO_BORDER)
        self.m_btn_add.SetToolTipString(u"编辑")
        bSizer61.Add(self.m_btn_edit_info, 0, wx.EXPAND|wx.TOP|wx.BOTTOM|wx.LEFT, 5)

        self.m_btn_del = wx.BitmapButton(self.m_panel1, wx.ID_DELETE,
            co.GetMondrianBitmap(fn="delete"),
            wx.DefaultPosition,
            wx.DefaultSize, wx.BU_AUTODRAW|wx.NO_BORDER)
        self.m_btn_del.SetToolTipString(u"删除")
        bSizer61.Add(self.m_btn_del, 0, wx.EXPAND|wx.TOP|wx.BOTTOM|wx.LEFT, 5)

        bSizer5.Add(bSizer61, 0, wx.EXPAND, 5)

        bSizer4.Add(bSizer5, 1, wx.EXPAND, 5)

        self.m_staticline_main = wx.StaticLine(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize,
            wx.LI_VERTICAL)
        bSizer4.Add(self.m_staticline_main, 0, wx.EXPAND | wx.ALL, 0)

        bSizer6 = wx.BoxSizer(wx.VERTICAL)

        self.m_textCtrl_content = self.makeTextCtrl(bSizer6)

        bSizer7 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_panel3 = wx.Panel(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer71 = wx.BoxSizer(wx.HORIZONTAL)

#        self.m_btn_save = buttons.GenBitmapTextButton(self.m_panel3, wx.ID_SAVE, co.GetMondrianBitmap(fn="disk"), u"保存")
#        bSizer71.Add(self.m_btn_save, 0, wx.ALL, 0)

        self.m_panel3.SetSizer(bSizer71)
        self.m_panel3.Layout()
        bSizer71.Fit(self.m_panel3)
        bSizer7.Add(self.m_panel3, 1, wx.EXPAND | wx.ALL, 5)

#        self.m_btn_apply = buttons.GenBitmapTextButton(self.m_panel1, wx.ID_APPLY,
#            co.GetMondrianBitmap(fn="accept"), u"应用",
#            size=wx.Size(-1, 24),
#            style=wx.BU_AUTODRAW|wx.STATIC_BORDER)
        #        self.m_btn_apply = wx.Button(self.m_panel1, wx.ID_APPLY, u"应用", wx.DefaultPosition, wx.DefaultSize, 0)
        self.m_btn_apply = wx.BitmapButton(self.m_panel1, wx.ID_APPLY,
            co.GetMondrianBitmap(fn="accept"),
            wx.DefaultPosition,
            wx.Size(60, -1), wx.BU_AUTODRAW|wx.SIMPLE_BORDER)
        self.m_btn_apply.SetToolTipString(u"应用当前 hosts 方案")
        bSizer7.Add(self.m_btn_apply, 0, wx.ALL, 5)

        if cls_TaskBarIcon and os.name == "nt":
            # ubuntu 10.04 下点击这个图标时会报错，图标的菜单无法正常工作
            # ubuntu 11.04 下这个图标总是无法显示
            # 由于跨平台问题，暂时决定只在 windows 下显示快捷的任务栏图标
            # 参见：http://stackoverflow.com/questions/7144756/wx-taskbaricon-on-ubuntu-11-04
            self.m_btn_exit = buttons.GenBitmapTextButton(self.m_panel1, wx.ID_CLOSE, co.GetMondrianBitmap(fn="door"), u"隐藏")
            #            self.m_btn_exit = wx.Button(self.m_panel1, wx.ID_CLOSE, u"隐藏", wx.DefaultPosition, wx.DefaultSize, 0)
            bSizer7.Add(self.m_btn_exit, 0, wx.ALL, 5)

        self.m_staticline_right_bottom = wx.StaticLine(self.m_panel1, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize,
            wx.LI_HORIZONTAL)
        bSizer6.Add(self.m_staticline_right_bottom, 0, wx.EXPAND | wx.ALL, 0)

        bSizer6.Add(bSizer7, 0, wx.EXPAND, 5)

        bSizer4.Add(bSizer6, 5, wx.EXPAND, 5)

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


    def makeTextCtrl(self, container):

        from HostsCtrl import HostsCtrl

        txt_ctrl = HostsCtrl(
            self.m_panel1, self.ID_HOSTS_TEXT, #wx.EmptyString,
            pos=wx.DefaultPosition,
            size=wx.DefaultSize,
            style=wx.TE_MULTILINE|wx.TE_RICH2|wx.TE_PROCESS_TAB|wx.HSCROLL|wx.NO_BORDER)
        txt_ctrl.AutoCompSetMaxWidth(0)

        container.Add(txt_ctrl, 1, wx.ALL | wx.EXPAND, 0)

        return txt_ctrl


    def OnClose(self, event):

        self.Hide()
        return False




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

        update_version = u"欢迎使用！"
        co.log([version, latest_stable_version])
        if latest_stable_version and latest_stable_version != "0":
            cv = co.compareVersion(version, latest_stable_version)
            if cv < 0:
                update_version = u"更新的稳定版 v%s 已经发布！" % latest_stable_version
            else:
                update_version = u"您正在使用最新稳定版本。"
            

        hwin = AboutHtml(self)
        hwin.SetPage(u"""
            <font size="9" color="#44474D"><b>SwitchHosts!</b></font><br />
            <font size="3" color="#44474D">%(version)s</font><br /><br />
            <font size="3" color="#909090"><i>%(update_version)s</i></font><br />
            <p>
                本程序用于在多个 hosts 之间快速切换。
            </p>
            <p>
                主页：<a href="http://oldj.github.io/SwitchHosts/">http://oldj.github.io/SwitchHosts/</a><br />
                <!--源码：<a href="https://github.com/oldj/SwitchHosts">https://github.com/oldj/SwitchHosts</a><br />-->
                作者：<a href="http://oldj.net">oldj</a><br />
                <br />
                以下网友对本软件也有贡献：<br />
                <a href="http://weibo.com/charlestang">@charlestang</a>,
                <a href="http://weibo.com/allenm56">@allenm</a>,
                <a href="http://www.weibo.com/emersonli">@emersonli</a>,
                <a href="https://github.com/qiyuan4f">@qiyuan4f</a> <br />
                <br />
                <font color="#909090">本程序完全免费，如果您觉得它还不错，欢迎<a href="https://me.alipay.com/oldj">捐赠</a>支持作者，谢谢！</font>
            </p>
        """ % {
            "version": version,
            "update_version": update_version,
        })

        hwin.FindWindowById(wx.ID_OK)
        irep = hwin.GetInternalRepresentation()
        hwin.SetSize((irep.GetWidth() + 25, irep.GetHeight() + 30))
        self.SetClientSize(hwin.GetSize())
        self.CenterOnParent(wx.BOTH)
        self.SetFocus()


class Dlg_addHosts(wx.Dialog):

    def __init__( self, parent ):
        wx.Dialog.__init__(self, parent, id=wx.ID_ANY, title=wx.EmptyString, pos=wx.DefaultPosition,
            size=wx.Size(400, 200), style=wx.DEFAULT_DIALOG_STYLE)

        self.SetSizeHintsSz(wx.DefaultSize, wx.DefaultSize)

        bSizer9 = wx.BoxSizer(wx.VERTICAL)

        self.m_panel9 = wx.Panel(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer10 = wx.BoxSizer(wx.VERTICAL)

        bSizer231 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_radioBtn_local = wx.RadioButton(self.m_panel9, wx.ID_ANY, lang.trans("local_hosts"), wx.DefaultPosition, wx.DefaultSize, 0)
        self.m_radioBtn_local.SetValue(True)
        bSizer231.Add(self.m_radioBtn_local, 0, wx.ALL, 5)

        self.m_radioBtn_online = wx.RadioButton(self.m_panel9, wx.ID_ANY, lang.trans("online_hosts"), wx.DefaultPosition, wx.DefaultSize,
            0)
        bSizer231.Add(self.m_radioBtn_online, 0, wx.ALL, 5)

        bSizer10.Add(bSizer231, 1, wx.EXPAND, 5)

        bSizer111 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_staticText21 = wx.StaticText(self.m_panel9, wx.ID_ANY, u"方案名：", wx.DefaultPosition, wx.Size(60, -1), 0)
        self.m_staticText21.Wrap(-1)
        bSizer111.Add(self.m_staticText21, 0, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        self.m_textCtrl_title = wx.TextCtrl(self.m_panel9, wx.ID_ANY, wx.EmptyString, wx.DefaultPosition, wx.DefaultSize
            , 0)
        self.m_textCtrl_title.SetMaxLength(32)
        self.m_textCtrl_title.SetToolTipString(u"在这儿输入方案名称。")

        bSizer111.Add(self.m_textCtrl_title, 1, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        bSizer10.Add(bSizer111, 1, wx.EXPAND, 5)

        bSizer1612 = wx.BoxSizer(wx.HORIZONTAL)

        self.m_staticText512 = wx.StaticText(self.m_panel9, wx.ID_ANY, u"URL：", wx.DefaultPosition, wx.Size(60, -1), 0)
        self.m_staticText512.Wrap(-1)
        bSizer1612.Add(self.m_staticText512, 0, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        self.m_textCtrl_url = wx.TextCtrl(self.m_panel9, wx.ID_ANY, u"http://", wx.DefaultPosition, wx.DefaultSize, 0)
        self.m_textCtrl_url.SetMaxLength(1024)
        self.m_textCtrl_url.Enable(False)
        self.m_textCtrl_url.SetToolTipString(u"在这儿输入方案的url地址，如：\nhttp://192.168.1.100/hosts/sample.hosts 。")

        bSizer1612.Add(self.m_textCtrl_url, 1, wx.ALL | wx.ALIGN_CENTER_VERTICAL, 5)

        bSizer10.Add(bSizer1612, 1, wx.EXPAND, 5)

        self.m_panel9.SetSizer(bSizer10)
        self.m_panel9.Layout()
        bSizer10.Fit(self.m_panel9)
        bSizer9.Add(self.m_panel9, 2, wx.EXPAND | wx.ALL, 5)

        self.m_staticline211 = wx.StaticLine(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.LI_HORIZONTAL)
        bSizer9.Add(self.m_staticline211, 0, wx.EXPAND | wx.ALL, 5)

        m_sdbSizer1 = wx.StdDialogButtonSizer()
        self.m_sdbSizer1OK = wx.Button(self, wx.ID_OK)
        m_sdbSizer1.AddButton(self.m_sdbSizer1OK)
        self.m_sdbSizer1Cancel = wx.Button(self, wx.ID_CANCEL)
        m_sdbSizer1.AddButton(self.m_sdbSizer1Cancel)
        m_sdbSizer1.Realize()
        bSizer9.Add(m_sdbSizer1, 1, wx.EXPAND, 5)

        self.SetSizer(bSizer9)
        self.Layout()

        self.Centre(wx.BOTH)

        self.__binds()


    def __del__( self ):
        pass


    def __binds(self):

        self.Bind(wx.EVT_RADIOBUTTON, self.switchToLocal, self.m_radioBtn_local)
        self.Bind(wx.EVT_RADIOBUTTON, self.switchToOnline, self.m_radioBtn_online)


    def switchToLocal(self, event):

#        print("local!")
        self.m_textCtrl_url.Enabled = False


    def switchToOnline(self, event):

#        print("online!")
        self.m_textCtrl_url.Enabled = True


class Dlg_Import(wx.Dialog):

    def __init__( self, parent ):

        wx.Dialog.__init__(self, parent, id=wx.ID_ANY, title=wx.EmptyString, pos=wx.DefaultPosition,
            size=wx.Size(400, 200), style=wx.DEFAULT_DIALOG_STYLE)

        self.SetSizeHintsSz(wx.DefaultSize, wx.DefaultSize)

        bSizer6 = wx.BoxSizer(wx.VERTICAL)

        self.m_notebook = wx.Notebook(self, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, 0)
        self.m_panel_local = wx.Panel(self.m_notebook, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize, wx.TAB_TRAVERSAL)
        bSizer8 = wx.BoxSizer(wx.VERTICAL)

        self.m_staticText4 = wx.StaticText(self.m_panel_local, wx.ID_ANY, u"请选择档案文件：", wx.DefaultPosition,
            wx.DefaultSize, 0)
        self.m_staticText4.Wrap(-1)
        bSizer8.Add(self.m_staticText4, 0, wx.ALL, 5)

        self.m_filePicker = wx.FilePickerCtrl(self.m_panel_local, wx.ID_ANY, wx.EmptyString, u"Select a file", u"*.*",
            wx.DefaultPosition, wx.Size(180, -1), wx.FLP_DEFAULT_STYLE)
        bSizer8.Add(self.m_filePicker, 0, wx.ALL | wx.ALIGN_CENTER_HORIZONTAL | wx.EXPAND, 5)

        self.m_panel_local.SetSizer(bSizer8)
        self.m_panel_local.Layout()
        bSizer8.Fit(self.m_panel_local)
        self.m_notebook.AddPage(self.m_panel_local, u"本地档案", False)
        self.m_panel_online = wx.Panel(self.m_notebook, wx.ID_ANY, wx.DefaultPosition, wx.DefaultSize,
            wx.TAB_TRAVERSAL)
        bSizer9 = wx.BoxSizer(wx.VERTICAL)

        self.m_staticText41 = wx.StaticText(self.m_panel_online, wx.ID_ANY, u"请输入档案URL：", wx.DefaultPosition,
            wx.DefaultSize, 0)
        self.m_staticText41.Wrap(-1)
        bSizer9.Add(self.m_staticText41, 0, wx.ALL, 5)

        self.m_textCtrl_url = wx.TextCtrl(self.m_panel_online, wx.ID_ANY, u"http://", wx.DefaultPosition, wx.DefaultSize
            , 0)
        bSizer9.Add(self.m_textCtrl_url, 0, wx.ALL | wx.EXPAND, 5)

        self.m_panel_online.SetSizer(bSizer9)
        self.m_panel_online.Layout()
        bSizer9.Fit(self.m_panel_online)
        self.m_notebook.AddPage(self.m_panel_online, u"在线档案", False)

        bSizer6.Add(self.m_notebook, 4, wx.EXPAND | wx.ALL, 5)

        self.m_panel2 = wx.Panel(self, wx.ID_ANY, wx.DefaultPosition, wx.Size(-1, 60), wx.TAB_TRAVERSAL)
        bSizer7 = wx.BoxSizer(wx.VERTICAL)

        m_sdbSizer3 = wx.StdDialogButtonSizer()
        self.m_sdbSizer3OK = wx.Button(self.m_panel2, wx.ID_OK)
        m_sdbSizer3.AddButton(self.m_sdbSizer3OK)
        self.m_sdbSizer3Cancel = wx.Button(self.m_panel2, wx.ID_CANCEL)
        m_sdbSizer3.AddButton(self.m_sdbSizer3Cancel)
        m_sdbSizer3.Realize()
        bSizer7.Add(m_sdbSizer3, 1, wx.EXPAND, 5)

        self.m_panel2.SetSizer(bSizer7)
        self.m_panel2.Layout()
        bSizer6.Add(self.m_panel2, 1, wx.EXPAND | wx.ALL, 5)

        self.SetSizer(bSizer6)
        self.Layout()

        self.Centre(wx.BOTH)

    def __del__( self ):
        pass



