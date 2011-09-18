# -*- coding: utf-8 -*-

import os
import json


class Hosts(object):

    CONFIG_FLAG = "#SwitchHost"

    def __init__(self, path, icon_idx=0):

        self.path = path
        self.folder, self.fn = os.path.split(path)
        if os.name == "nt":
            self.fn = self.fn.decode("GB18030")

        self.title = None
        self.icon_idx = icon_idx
        self.is_selected = False

        self.read()



    def read(self):

        c = open(self.path, "rb").read().strip() if os.path.isfile(self.path) else ""
        self.content = c

        # 查看第一行是否为配置内容
        # 第一行以 #SwitchHost 开头表示为配置信息
        a = [i.strip() for i in c.split("\n")]
        if a[0].startswith(self.CONFIG_FLAG):
            self.getConfig(a[0])

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
            self.title = cfg.get("title")
            self.icon_idx = cfg.get("icon_idx")


    def save(self):

        open(self.path, "wb").write(self.content)


    def getTitle(self):

        return self.title or self.fn
