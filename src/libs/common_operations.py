# -*- coding: utf-8 -*-

u"""
基本操作
"""

import os
import sys
import traceback
import wx
import chardet
import urllib
import re
import threading

if os.name == "posix" and sys.platform != "darwin":
    # Linux
    try:
        import pynotify
    except ImportError:
        pynotify = None

from icons import ICONS, ICONS2, ICONS_ICO

def GetMondrianData(i=0, fn=None):
    if not fn:
        idx = i if 0 <= i < len(ICONS) else 0
        return ICONS_ICO[idx]
    else:
        return ICONS2[fn]


def GetMondrianBitmap(i=0, fn=None):
    return wx.BitmapFromImage(GetMondrianImage(i, fn))


def GetMondrianImage(i=0, fn=None):
    import cStringIO

    stream = cStringIO.StringIO(GetMondrianData(i, fn))
    return wx.ImageFromStream(stream)


def GetMondrianIcon(i=0, fn=None):
    icon = wx.EmptyIcon()
    icon.CopyFromBitmap(GetMondrianBitmap(i, fn))
    return icon

def notify(frame, msg="", title=u"消息"):

    if os.name == "posix" and sys.platform != "darwin":
        # linux 系统

        pynotify.Notification(title, msg).show()

        return

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

    frame.SetFocus()


def switchHost(obj, fn, content=None):
    u"""切换 hosts 为 fn 的内容"""

    from cls_Hosts import Hosts

    if not os.path.isfile(fn):
        wx.MessageBox(u"hosts 文件 '%s' 不存在！" % fn, "Error!")

    ohosts = Hosts(path=fn)

    sys_hosts_fn = getSysHostsPath()
    if not sys_hosts_fn:
        wx.MessageBox(u"没有找到 hosts 目录！")
        return

    try:
        c = content or open(fn, "rb").read()
        a = c.split("\n")
        a = [ln.rstrip() for ln in a]
        if sys_hosts_fn:
            open(sys_hosts_fn, "wb").write(os.linesep.join(a))
        obj.current_hosts = fn
        title = ohosts.getTitle()

        obj.SetIcon(GetMondrianIcon(), "Hosts: %s" % title)
        notify(obj.frame, u"Hosts 已切换为 %s。" % title)

        ohosts = obj.frame.getOHostsFromFn(fn)
        obj.SetIcon(GetMondrianIcon(ohosts.icon_idx), u"当前 hosts 方案：%s" % ohosts.getTitle())
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

#    print("--")
#    print(chardet.detect(s))
    return unicode(s).encode("UTF-8") if s else ""


def decode(s):

    if not s:
        return ""

    cd = {}
    try:
        cd = chardet.detect(s)
    except Exception:
#        print(traceback.format_exc())
        pass

    encoding = cd.get("encoding") if cd.get("confidence", 0) > 0.65 else None
    if not encoding:
        encoding = "GB18030" if os.name == "nt" else "UTF-8"
#    print s, cd, encoding, s.decode(encoding)

    return s.decode(encoding)


def checkLatestStableVersion(obj):

    def _f(obj):
        url = "https://github.com/oldj/SwitchHosts/blob/master/README.md"
        ver = None

        try:
            c = urllib.urlopen(url).read()
            v = re.search(r"\bLatest Stable:\s?(?P<version>[\d\.]+)\b", c)
            if v:
                ver = v.group("version")

        except Exception:
            pass

        obj.setLatestStableVersion(ver)

        return ver

    t = threading.Thread(target=_f, args=(obj,))
    t.setDaemon(True)
    t.start()
