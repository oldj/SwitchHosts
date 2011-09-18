# -*- coding: utf-8 -*-

u"""
基本操作
"""

import os
import traceback
import wx
import chardet
from icons import ICONS

def GetMondrianData(i=0):
    idx = i if 0 <= i < len(ICONS) else 0
    return ICONS[idx]


def GetMondrianBitmap(i=0):
    return wx.BitmapFromImage(GetMondrianImage(i))


def GetMondrianImage(i=0):
    import cStringIO

    stream = cStringIO.StringIO(GetMondrianData(i))
    return wx.ImageFromStream(stream)


def GetMondrianIcon(i=0):
    icon = wx.EmptyIcon()
    icon.CopyFromBitmap(GetMondrianBitmap(i))
    return icon

def notify(frame, msg=None, title=None):
    import ToasterBox as TB

    sw, sh = wx.GetDisplaySize()
    width, height = 210, 50
    px = sw - 230
    py = sh - 100

    tb = TB.ToasterBox(frame)
    tb.SetPopupText(msg)
    tb.SetPopupSize((width, height))
    tb.SetPopupPosition((px, py))
    tb.Play()


def switchHost(obj, fn):
    u"""切换 hosts 为 fn 的内容"""

    if not os.path.isfile(fn):
        wx.MessageBox(u"hosts 文件 '%s' 不存在！" % fn, "Error!")

    sys_hosts_fn = getSysHostsPath()
    try:
        open(sys_hosts_fn, "wb").write(open(fn, "rb").read())
        obj.current_hosts = fn
        title = os.path.split(fn)[1]

        if os.name == "nt":
            try:
                title = title.decode("GB18030")
            except UnicodeEncodeError:
                print(traceback.format_exc())

        obj.SetIcon(GetMondrianIcon(), "Hosts: %s" % title)
        notify(obj.frame, u"Hosts 已切换为 %s。" % title)

        ohosts = obj.frame.getOHostsFromFn(fn)
        obj.SetIcon(GetMondrianIcon(ohosts.icon_idx))
        obj.frame.SetIcon(GetMondrianIcon(ohosts.icon_idx))
        obj.frame.current_use_hosts_index = ohosts.index


    except Exception:
        print(traceback.format_exc())
        wx.MessageBox(u"hosts 未能成功切换！", "Error!")


def getSysHostsPath():
    u"""取得系统 host 文件的路径"""

    if os.name == "nt":
        path = "C:\\Windows\\System32\\drivers\\etc\\hosts"
    else:
        path = "/etc/hosts"

    return path if os.path.isfile(path) else None


def encode(s):

    return unicode(s).encode("UTF-8")


def decode(s):

    cd = {}
    try:
        cd = chardet.detect(s)
    except Exception:
#        print(traceback.format_exc())
        pass

    encoding = cd.get("encoding") if cd.get("confidence", 0) > 0.85 else None
    if not encoding:
        encoding = "GB18030" if os.name == "nt" else "UTF-8"
#    print s, cd, encoding, s.decode(encoding)

    return s.decode(encoding)

