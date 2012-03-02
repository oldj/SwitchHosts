# -*- coding: utf-8 -*-

import os
import re
import sys
import json
import chardet
import urllib2

import wx
import common_operations as co

DEFAULT_HOSTS_FN = u"DEFAULT.hosts"

class Hosts(object):

    CONFIG_FLAG = "#@SwitchHost!"

    def __init__(self, index=0, path=None, icon_idx=0, frame=None):

        self.index = index
        self.path = path
        self.dc_path = co.decode(path)
        self.folder, self.fn = os.path.split(path)
#        self.fn = co.decode(self.fn)
#        if os.name == "nt":
#            self.fn = self.fn.decode("GB18030")

        self.title = None
        self.icon_idx = icon_idx
        self.content = ""
        self.is_selected = False
        self.frame = frame

        self.read()



    def read(self):

        c = open(self.path, "rb").read().strip() if os.path.isfile(self.path) else ""
#        c = co.decode(c)
        self.setContent(c, save=False)


    def getConfig(self, ln):
        u"""从一行内容中取得配置信息"""

        cfg = None
        v = ln.partition(self.CONFIG_FLAG)[2].strip()
        if v:
            try:
                cfg = json.loads(v)
            except Exception:
                pass

        if cfg:
            self.title = cfg.get("title", self.title)
            self.icon_idx = cfg.get("icon_idx", self.icon_idx)


    def _doImport(self, ln, froms, frame=None):
        u"""将一行内容替换为它对应的 import 的内容"""

        act, t, source = ln.strip().partition(" ")
        source = source.strip()

        # 判断是否有循环引用
        if source in froms:
            wx.MessageBox(u"检测到循环引用！")
            return None
        froms.add(source)

        if re.match(r"https?://", source, re.I):
            # source 是一个 http 文件

            try:
                c = urllib2.urlopen(source, timeout=15).read()
            except Exception:
                wx.MessageBox(u"导入网络 hosts 文件 \"%s\" 失败！" % source)
                return None
            c = co.decode(c)

            return c

        else:
            # 尝试从本地加载

            if frame and not self.frame:
                self.frame = frame

            oh = self.frame.getOHostsFromTitle(source)
            if not oh:
                oh = self.frame.getOHostsFromFn(fn=source)

            if not oh:
                wx.MessageBox(u"找不到名为 \"%s\" 的 hosts 文件！" % source)
                return None

            return oh.getContent(replace_import=True, with_config=False, froms=froms, frame=frame)


    def replaceImport(self, content, froms=None, frame=None):
        u"""将 content 中的各 import 值替换为对应的内容"""

        if not froms:
            froms = set()
        froms.add(self.fn)
        froms.add(self.title)

        lines = content.split("\n")
        for idx, ln in enumerate(lines):
            c = ln.strip()
            if c.startswith("#@import "):
                ipt = self._doImport(c, froms=froms, frame=frame)
                if ipt is None:
                    pass
                else:
                    lines[idx] = ipt.decode("utf-8")

        return u"\n".join(lines).encode("utf-8")


    def save(self):

        if not self.path:
            return

        c = self.getContent(with_config=True)
        open(self.path, "wb").write(c.encode("utf-8"))


    def getTitle(self):

        return self.title or self.fn if self.fn != DEFAULT_HOSTS_FN else self.fn


    def setTitle(self, title):

        self.title = title
        self.save()


    def setIcon(self, icon_idx):

        self.icon_idx = icon_idx
        self.save()


    def setContent(self, c, save=True):

        self.content = c #co.encode(c)

        # 查看第一行是否为配置内容
        # 第一行以 #SwitchHost 开头表示为配置信息
        a = [i.strip() for i in c.split("\n")]
        if a[0].startswith(self.CONFIG_FLAG):
            self.getConfig(a[0])
            self.content = "\n".join(a[1:])

        if save:
            self.save()


    def getContent(self, replace_import=False, with_config=False, froms=None, frame=None):

        c = self.content
        if type(c) == unicode:
            c = c.encode("utf-8")

        if not repr(c).startswith("u"):
            try:
                cd = chardet.detect(c)
                encoding = cd.get("encoding")
                if encoding not in ("utf-8",):
                    encoding = sys.getfilesystemencoding()
                c = c.decode(encoding)

            except Exception:
                c = c.decode("utf-8")

            self.content = c

        if with_config:
            cfg = {
                "title": self.title,
                "icon_idx": self.icon_idx,
                }
            cfg_ln = u"%s %s" % (self.CONFIG_FLAG, json.dumps(cfg).replace("\n", "").replace("\r", ""))

            if not repr(c).startswith("u"):
                c = c.decode("utf-8")

            c = u"%s\n%s" % (cfg_ln, c)

        return c if not replace_import else self.replaceImport(c, froms=froms, frame=frame)
