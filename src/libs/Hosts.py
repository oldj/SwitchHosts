# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#


class Hosts(object):


    def __init__(self, src, is_online=False):

        self.src = src
        self.is_online = is_online
        self.__name = None


    @property
    def name(self):

        return self.__name or u"未命名"

    @name.setter
    def name(self, value):
        self.__name = value

