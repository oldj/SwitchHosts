# -*- coding: utf-8 -*-

u"""
基本操作
"""

import os
import sys
import traceback
import datetime
import wx
import chardet
import urllib
import re
import threading
import httplib
import urlparse


from icons import ICONS, ICONS2, ICONS_ICO


def log(msg):

    print(u"%s > %s" % (datetime.datetime.now().strftime("%H:%M:%S"), msg))


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



def encode(s):

#    print("--")
#    print(chardet.detect(s))
    return unicode(s).encode("UTF-8") if s else ""


def decode(s):

    s = s.strip()
    if not s:
        return ""

    cd = {}
    sample = s[:4096]
    if sample:
        try:
            cd = chardet.detect(sample)
        except Exception:
#            print(traceback.format_exc())
            pass
#    log([sample, repr(cd)])

    encoding = cd.get("encoding", "") if cd.get("confidence", 0) > 0.9 else ""

    if encoding and encoding.upper() in ("GB2312", "GBK"):
        encoding = "GB18030"

    if not encoding:
        encoding = "UTF-8"
#    print s, cd, encoding, s.decode(encoding)

    try:
        s = s.decode(encoding)
    except Exception:
        pass

    return s


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


def compareVersion(v1, v2):
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


def getLocalEncoding():
    u"""取得本地编码"""

    import locale
    import codecs
#    print locale.getpreferredencoding()

    return "%s" % codecs.lookup(locale.getpreferredencoding()).name


def getSystemType():
    u"""取得系统类型
        win
        linux
        mac
    """

    os_name = os.name

    if os_name == "posix":

        if sys.platform != "darwin":
            # linux 系统
            return "linux"

        else:
            # Mac 系统
            return "mac"

    elif os_name == "nt":
        return "win"

    return "unknow"


