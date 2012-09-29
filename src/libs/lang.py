# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#


lang = {
    "origin_hosts": u"初始方案",
    "online_hosts": u"在线方案",
    "local_hosts": u"本地方案",
}

def trans(key):

    return lang.get(key) or "N/A"
