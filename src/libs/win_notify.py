# -*- coding: utf-8 -*-

from win32api import *
# Try and use XP features, so we get alpha-blending etc.
try:
    from winxpgui import *
except ImportError:
    from win32gui import *

import win32con
import sys, os
import struct
import time

class PyNOTIFYICONDATA(object):

    _struct_format = (
        "I" # DWORD cbSize;
        "I" # HWND hWnd;
        "I" # UINT uID;
        "I" # UINT uFlags;
        "I" # UINT uCallbackMessage;
        "I" # HICON hIcon;
        "128s" #    TCHAR szTip[128];
        "I" # DWORD dwState;
        "I" # DWORD dwStateMask;
        "256s" # TCHAR szInfo[256];
        "I" #     union {
        #    UINT  uTimeout;
        #    UINT  uVersion;
        #} DUMMYUNIONNAME;
        "64s" #    TCHAR szInfoTitle[64];
        "I" #  DWORD dwInfoFlags;
        #       GUID guidItem;
        )
    _struct = struct.Struct(_struct_format)

    hWnd = 0
    uID = 0
    uFlags = 0
    uCallbackMessage = 0
    hIcon = 0
    szTip = ""
    dwState = 0
    dwStateMask = 0
    szInfo = ""
    uTimeoutOrVersion = 0
    szInfoTitle = ""
    dwInfoFlags = 0

    def pack(self):
        return self._struct.pack(
            self._struct.size,
            self.hWnd,
            self.uID,
            self.uFlags,
            self.uCallbackMessage,
            self.hIcon,
            self.szTip,
            self.dwState,
            self.dwStateMask,
            self.szInfo,
            self.uTimeoutOrVersion,
            self.szInfoTitle,
            self.dwInfoFlags)

    def __setattr__(self, name, value):
        # avoid wrong field names
        if not hasattr(self, name):
            raise NameError, name
        self.__dict__[name] = value


class MainWindow:
    def __init__(self, title, msg):
        message_map = {
            win32con.WM_DESTROY: self.OnDestroy,
            }
        # Register the Window class.
        wc = WNDCLASS()
        hinst = wc.hInstance = GetModuleHandle(None)
        wc.lpszClassName = "PythonTaskbarDemo"
        wc.lpfnWndProc = message_map # could also specify a wndproc.
        classAtom = RegisterClass(wc)
        # Create the Window.
        style = win32con.WS_OVERLAPPED | win32con.WS_SYSMENU
        self.hwnd = CreateWindow(classAtom, "Taskbar Balloon tooltip", style,\
                                 0, 0, win32con.CW_USEDEFAULT, win32con.CW_USEDEFAULT,\
                                 0, 0, hinst, None)
        UpdateWindow(self.hwnd)
        iconPathName = os.path.abspath(os.path.join(sys.prefix, "pyc.ico"))
        icon_flags = win32con.LR_LOADFROMFILE | win32con.LR_DEFAULTSIZE
        try: hicon = LoadImage(hinst, iconPathName, win32con.IMAGE_ICON, 0, 0, icon_flags)
        except: hicon = LoadIcon(0, win32con.IDI_APPLICATION)
        flags = NIF_ICON | NIF_MESSAGE | NIF_TIP
        nid = (self.hwnd, 0, flags, win32con.WM_USER + 20, hicon, "Balloon tooltip")
        Shell_NotifyIcon(NIM_ADD, nid)
        self.show_balloon(title, msg)
        time.sleep(3)
        DestroyWindow(self.hwnd)

    def show_balloon(self, title, msg):
        # For this message I can"t use the win32gui structure because
        # it doesn"t declare the new, required fields
        nid = PyNOTIFYICONDATA()
        nid.hWnd = self.hwnd
        nid.uFlags = NIF_INFO
        # type of balloon and text are random
        nid.dwInfoFlags = NIIF_INFO
        nid.szInfo = msg.encode("utf-8").decode("utf-8").encode("gbk")
        nid.szInfoTitle = title.encode("utf-8").decode("utf-8").encode("gbk")
        # Call the Windows function, not the wrapped one
        from ctypes import windll

        Shell_NotifyIcon = windll.shell32.Shell_NotifyIconA
        Shell_NotifyIcon(NIM_MODIFY, nid.pack())

    def OnDestroy(self, hwnd, msg, wparam, lparam):
        nid = (self.hwnd, 0)
        Shell_NotifyIcon(NIM_DELETE, nid)
        PostQuitMessage(0) # Terminate the app.


def showNotify(title, msg):
    w = MainWindow(title, msg)
    #PumpMessages()

if __name__ == "__main__":
    showNotify(u"消息标题", u"消息内容。")

