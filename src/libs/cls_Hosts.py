# -*- coding: utf-8 -*-

import os
import json

import common_operations as co


class Hosts(object):

    CONFIG_FLAG = "#@SwitchHost!"

    def __init__(self, index=0, path=None, icon_idx=0):

        self.index = index
        self.path = path
        self.dc_path = co.decode(path)
        self.folder, self.fn = os.path.split(path)
        self.fn = co.decode(self.fn)
#        if os.name == "nt":
#            self.fn = self.fn.decode("GB18030")

        self.title = None
        self.icon_idx = icon_idx
        self.content = ""
        self.is_selected = False

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


    def save(self):

        if not self.path:
            return

        cfg = {
            "title": self.title,
            "icon_idx": self.icon_idx,
        }
        cfg_ln = u"%s %s" % (self.CONFIG_FLAG, json.dumps(cfg).replace("\n", "").replace("\r", ""))

        c = self.content
        if not repr(c).startswith("u"):
            c = c.decode("utf-8")

        c = u"%s\n%s" % (cfg_ln, c)
        open(self.path, "wb").write(c.encode("utf-8"))


    def getTitle(self):

        return self.title or self.fn


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


    def getContent(self):

        c = self.content
        if not repr(c).startswith("u"):
            c = c.decode("utf-8")

        return c
