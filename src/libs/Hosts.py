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

    def __init__(self, path, is_origin=False, title=None, url=None):

        self.path = path
        self.is_origin = is_origin
        self.url = url
        self.is_online = True if url else False
        self.last_fetch_dt = None
        self.__title = title
        self.__content = None
        self.tree_item_id = None

        self.getContent()


    @property
    def title(self):

        return self.__title or u"未命名"


    @title.setter
    def title(self, value):
        self.__title = value


    def getContentFromUrl(self):

        co.log("fetch '%s'.." % self.url)
        cnt = ""
        if co.httpExists(self.url):

            try:
                cnt = urllib.urlopen(self.url).read()
            except Exception:
                co.debugErr()
                return ""

            self.last_fetch_dt = datetime.datetime.now()

        return cnt


    def getContentOnce(self):

        if self.is_online and not self.last_fetch_dt:
            self.getContent(force=True)


    def getContent(self, force=False):

        c = ""
        if self.is_online:

            if force:
                c = self.getContentFromUrl()

        elif os.path.isfile(self.path):
            c = open(self.path, "rb").read().strip()

        if c:
            c = c.decode("utf-8")
            a = c.split("\n")
            if a[0].startswith(self.flag):
                # 首行是配置信息
                self.parseConfigs(a[0][len(self.flag):])
                c = "\n".join(a[1:])

        self.content = c


    @property
    def content(self):

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
            if not self.title or not self.is_online:
                self.title = cfg["title"]

        if cfg.get("url"):
            if not self.is_online:
                self.url = cfg["url"]
                self.is_online = True
                self.getContent()


    @property
    def filename(self):

        sep = "/" if self.is_online else os.sep
        fn = self.path.split(sep)[-1]

        return fn


    def save(self, path=None):

        cnt_for_save = [
            "%s %s" % (self.flag, json.dumps({
                "title": self.title,
                "url": self.url,
            })),
            self.content,
        ]

        cnt_for_save = "\n".join(cnt_for_save).encode("utf-8")
        open(path or self.path, "w").write(cnt_for_save)


    def remove(self):

        if os.path.isfile(self.path):
            os.remove(self.path)

