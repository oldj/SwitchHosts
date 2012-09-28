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
import httplib
import urlparse


if os.name == "posix":
    if sys.platform != "darwin":
        # Linux
        try:
            import pynotify
        except ImportError:
            pynotify = None

    else:
        # Mac
        import gntp.notifier

        growl = gntp.notifier.GrowlNotifier(
            applicationName="SwitchHosts!",
            notifications=["New Updates", "New Messages"],
            defaultNotifications=["New Messages"],
            hostname = "127.0.0.1", # Defaults to localhost
            # password = "" # Defaults to a blank password
        )
        growl.register()

from icons import ICONS, ICONS2, ICONS_ICO


def log(msg):

    print(msg)


def debugErr():

    err = traceback.format_exc()
    log("ERROR!")
    log("-" * 50)
    log(err)


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


def macNotify(msg, title):

#    print("mac nofity!")

    growl.notify(
        noteType="New Messages",
        title=title,
        description=msg,
        sticky=False,
        priority=1,
    )


def notify(frame, msg="", title=u"消息"):

    if os.name == "posix":

        if sys.platform != "darwin":
            # linux 系统
            pynotify.Notification(title, msg).show()

        else:
            # Mac 系统
            macNotify(msg, title)

        return


    try:
        import ToasterBox as TB
    except ImportError:
        TB = None

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

    encoding = cd.get("encoding", "") if cd.get("confidence", 0) > 0.65 else ""

    if encoding and encoding.upper() in ("GB2312", "GBK"):
        encoding = "GB18030"

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


def httpExists(url):
    host, path = urlparse.urlsplit(url)[1:3]
    found = 0
    try:
        connection = httplib.HTTPConnection(host)  ## Make HTTPConnection Object
        connection.request("HEAD", path)
        responseOb = connection.getresponse()      ## Grab HTTPResponse Object

        if responseOb.status == 200:
            found = 1
        elif responseOb.status == 302:
            found = httpExists(urlparse.urljoin(url, responseOb.getheader('location', '')))
        else:
            print "Status %d %s : %s" % (responseOb.status, responseOb.reason, url)
    except Exception, e:
        print e.__class__, e, url
    return found


