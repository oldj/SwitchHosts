# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#


lang = {
    "common_hosts": u"公用 hosts",
    "origin_hosts": u"当前系统 hosts",
    "online_hosts": u"在线方案",
    "local_hosts": u"本地方案",
}

def trans(key):

    return lang.get(key) or "N/A"
