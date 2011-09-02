# -*- coding: utf-8 -*-

import pynotify

def showNotify(title, msg):
    pynotify.Notification(title, msg).show()

if __name__ == "__main__":
    showNotify(u"标题", u"内容")
