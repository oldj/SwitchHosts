# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import time
import random
import threading
import traceback

class BackThreads(threading.Thread):

    def __init__(self, task_qu, *kw, **kw2):

        super(BackThreads, self).__init__(*kw, **kw2)

        self.task_qu = task_qu
        self.time_to_quit = threading.Event()
        self.time_to_quit.clear()


    def run(self):

        time.sleep(0.5 + random.random())

        while True:
            if self.time_to_quit.isSet():
                break

            if not self.task_qu.empty():
                try:
                    tasks = self.task_qu.get(block=False)
                    if callable(tasks):
                        tasks = [tasks]

                    if type(tasks) in (list, tuple):
                        for task in tasks:
                            if callable(task):
                                task()
                except Exception:
                    print(traceback.format_exc())

            time.sleep(0.1)


    def stop(self):
        self.time_to_quit.set()




