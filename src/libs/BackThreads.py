# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import time
import wx
import Queue
import threading

class BackThreads(threading.Thread):

    def __init__(self, main_frame, *kw, **kw2):

        super(BackThreads, self).__init__(*kw, **kw2)

        self.main_frame = main_frame
        self.time_to_quit = threading.Event()
        self.time_to_quit.clear()


    def run(self):

        while True:
            if self.time_to_quit.isSet():
                break

            if not self.main_frame.qu_hostses.empty():
                hosts = self.main_frame.qu_hostses.get(block=False)
                hosts.getContentOnce()
                wx.CallAfter(self.main_frame.tryToShowHosts, hosts)
            time.sleep(0.1)


    def stop(self):
        self.time_to_quit.set()




