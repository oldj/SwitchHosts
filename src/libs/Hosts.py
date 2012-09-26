# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import os
import simplejson as json
import urllib
import datetime
import common_operations as co


class Hosts(object):

    flag = "#@SwitchHost!"

    def __init__(self, path, is_online=False, is_origin=False, title=None, url=None):

        self.path = path
        self.is_online = is_online
        self.is_origin = is_origin
        self.url = url
        self.last_fetch_dt = None
        self.__title = title
        self.__content = None
        self.tree_item_id = None


    @property
    def title(self):

        return self.__title or u"未命名"


    @title.setter
    def title(self, value):
        self.__title = value


    def getContentFromUrl(self):

        if co.httpExists(self.url):
            try:
                cnt = urllib.urlopen(self.url)
            except Exception:
                co.debugErr()
                return

            # todo cnt 解码...

            self.content = cnt
            self.last_fetch_dt = datetime.datetime.now()


    @property
    def content(self):

        c = ""
        if self.is_online:
            self.getContentFromUrl()

        elif os.path.isfile(self.path):
            c = open(self.path, "rb").read().strip()

        if c:
            c = c.decode("utf-8")
            a = c.split("\n")
            if a[0].startswith(self.flag):
                # 首行是配置信息
                self.parseConfigs(a[0][len(self.flag):])
                c = "\n".join(a[1:])

        self.__content = c

        return self.__content or ""


    @content.setter
    def content(self, value):
        self.__content = value


    def parseConfigs(self, json_str=None):

        try:
            cfg = json.loads(json_str)
        except Exception:
            co.debugErr()
            return

        if type(cfg) != dict:
            return

        if cfg.get("title"):
            self.title = cfg["title"]

        if cfg.get("url"):
            self.url = cfg["url"]
            self.is_online = True


    @property
    def filename(self):

        sep = "/" if self.is_online else os.sep
        fn = self.path.split(sep)[-1]

        return fn


    def save(self):

        cnt_for_save = [
            "%s %s" % (self.flag, json.dumps({
                "title": self.title,
                "url": self.url,
            })),
            self.content,
        ]

        try:
            open(self.path, "w").write("\n".join(cnt_for_save))

        except Exception:

            co.debugErr()
