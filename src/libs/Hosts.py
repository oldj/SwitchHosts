# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import simplejson as json
import datetime
import common_operations as co


class Hosts(object):


    def __init__(self, src, is_online=False, title=None):

        self.src = src
        self.is_online = is_online
        self.last_fetch_dt = None
        self.__title = title
        self.__content = None


    @property
    def title(self):

        return self.__title or u"未命名"

    @title.setter
    def title(self, value):
        self.__title = value


    @property
    def content(self):

        c = None
        if self.is_online:
            pass

        else:
            c = open(self.src, "rb").read()

        if c:
            c = c.strip().decode("utf-8")
            a = c.split("\n")
            flag = "#@SwitchHost!"
            if a[0].startswith(flag):
                # 首行是配置信息
                self.parseConfigs(a[0][len(flag):])
                c = "\n".join(a[0:])

        self.__content = c

        return self.__content or ""


    @content.setter
    def content(self, value):
        self.__content = value


    def parseConfigs(self, json_str):

        try:
            cfg = json.loads(json_str)
        except Exception:
            co.debugErr()
            return

        if "title" in cfg:
            self.title = cfg["title"]
