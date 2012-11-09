# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import os
import simplejson as json
import urllib
import time
import datetime
import common_operations as co


class Hosts(object):

    flag = "#@SwitchHosts!"
    old_flag = "#@SwitchHost!"

    def __init__(self, path, is_origin=False, title=None, url=None, is_common=False):

        self.path = path
        self.is_origin = is_origin
        self.is_common = is_common
        self.url = url
        self.is_online = True if url else False
        self.is_loading = False
        self.last_fetch_dt = None
        self.last_save_time = None
        self.__title = title
        self.__content = None
        self.tree_item_id = None
        self.taskbar_id = None
        self.icon_idx = 0

        self.getContent()


    @property
    def title(self):

        return self.__title or self.filename or u"未命名"


    @title.setter
    def title(self, value):
        self.__title = value


    def getContentFromUrl(self, progress_dlg):

        co.log("fetch '%s'.." % self.url)

        if co.httpExists(self.url):

            if progress_dlg:
                progress_dlg.Update(10),
            try:
                cnt = []
                up = 10
                url_o = urllib.urlopen(self.url)
                while True:
                    c = url_o.read(1024)
                    if not c:
                        break
                    cnt.append(c)
                    up += 1
                    if up < 60:
                        if progress_dlg:
                            progress_dlg.Update(up),
                cnt = "".join(cnt)
                if progress_dlg:
                    progress_dlg.Update(60),
            except Exception:
                co.debugErr()
                return ""

            self.last_fetch_dt = datetime.datetime.now()

        else:
            cnt = u"### URL无法访问！ ###".encode("utf-8")

        return cnt


    def getContentOnce(self):

        if self.is_online and not self.last_fetch_dt:
            self.getContent(force=True)


    def getContent(self, force=False, progress_dlg=None):

        self.is_loading = True
        c = ""
        if self.is_online:

            if force:
                c = self.getContentFromUrl(progress_dlg)

        elif os.path.isfile(self.path):
            c = open(self.path, "rb").read().strip()

        if c:
            c = self.tryToDecode(c)
            a = c.replace("\r", "").split("\n")
            if a[0].startswith(self.flag):
                # 首行是配置信息
                self.parseConfigs(a[0][len(self.flag):])
                c = "\n".join(a[1:])
            elif a[0].startswith(self.old_flag):
                # 兼容老的格式
                # 首行是配置信息
                self.parseConfigs(a[0][len(self.old_flag):])
                c = "\n".join(a[1:])

        self.content = c
        self.is_loading = False


    def tryToDecode(self, s):

        try:
            return co.decode(s)
        except Exception:
            return u"### 解码错误！###"


    @property
    def content(self):

        c = self.__content or ""
        if c and not c.endswith("\n"):
            # 自动给 hosts 内容最后一行添加一个换行
            c = "%s\n" % c
        return c


    @content.setter
    def content(self, value):
        self.__content = value.replace("\r", "")


    def parseConfigs(self, json_str=None):

        try:
            cfg = json.loads(json_str)
        except Exception:
            co.log(json_str)
            co.debugErr()
            return

        if type(cfg) != dict:
            return

        if self.is_origin:
            pass
        elif cfg.get("title"):
            if not self.title or not self.is_online:
                self.title = cfg["title"]

        if cfg.get("url"):
            if not self.is_online and not self.is_origin:
                self.url = cfg["url"]
                self.is_online = True
#                self.getContent()

        if cfg.get("icon_idx") is not None:
            icon_idx = cfg.get("icon_idx")
            if type(icon_idx) not in (int, long) or \
                icon_idx < 0 or icon_idx > len(co.ICONS):
                icon_idx = 0

            self.icon_idx = icon_idx


    @property
    def filename(self):

        sep = "/" if self.is_online else os.sep
        fn = self.path.split(sep)[-1]

        return fn


    @property
    def full_content(self):

        cnt_for_save = [
            "%s %s" % (self.flag, json.dumps({
                "title": self.title,
                "url": self.url,
                "icon_idx": self.icon_idx,
                })),
            ] + self.content.split("\n")

        return os.linesep.join(cnt_for_save).encode("utf-8")


    def save(self, path=None, common=None):

        if self.last_save_time:
            time_delta = time.time() - self.last_save_time
#            co.log(time_delta)
            if time_delta < 0.001:
                pass
#                return False

        path = path or self.path
        path = path.encode(co.getLocalEncoding())

        specific_content = self.full_content
        if common:
            specific_content = common.full_content + specific_content
        open(path, "w").write(specific_content)
        self.last_save_time = time.time()

        return True


    def remove(self):

        if os.path.isfile(self.path):
            os.remove(self.path)

