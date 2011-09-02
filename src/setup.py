# -*- coding: utf-8 -*-

import glob
from distutils.core import setup
import py2exe

from SwitchHosts import VERSION

setup(
    version=VERSION,
    name="Switch Hosts!",
    description=u"快捷切换 Hosts 文件内容的小程序。",
#    zipfile=None,
    data_files = [("hosts", glob.glob("hosts\\*"))],
    options={
        "py2exe": {
            "compressed": 1,
            "optimize": 2,
            "bundle_files": 1, # 打包为一个文件
            "dll_excludes": ["MSVCP90.dll"],
        },
    },
    windows=[{
        "script": "SwitchHosts.py",
        "icon_resources": [(1, "arrow_switch.ico")],
    }],
)
