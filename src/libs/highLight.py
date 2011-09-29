# -*- coding: utf-8 -*-

import wx
import re

def __highLightOneLine(txtctrl, ln, start_pos, styles):

    ln_content, t, ln_comment = ln.partition("#")
    end_pos = start_pos + len(ln)
    txtctrl.SetStyle(start_pos, end_pos, wx.TextAttr(styles["color_normal"]))

    # 行正文部分
    re_ip = re.match(r"^(\s*(?:\d+\.)+\d+)\s", ln_content)
    if re_ip:
        s_ip = re_ip.group(0)
        pos2 = start_pos + len(s_ip)
        pos = pos2 - len(s_ip.lstrip())
        txtctrl.SetStyle(pos, pos2, wx.TextAttr(styles["color_ip"]))
    elif len(ln_content.strip()) > 0:
        pos2 = start_pos + len(ln_content)
        txtctrl.SetStyle(start_pos, pos2, wx.TextAttr(styles["color_error"]))

    # 行注释部分
    if t:
        pos = start_pos + len(ln_content)
        txtctrl.SetStyle(pos, end_pos, wx.TextAttr(styles["color_comment"]))


def highLight(txtctrl, styles=None):

    default_style = {
        "color_normal": "#000000",
        "color_bg": "#ffffff",
        "color_comment": "#339933",
        "color_ip": "#0000cc",
        "color_error": "#ff0000",
    }
    if styles:
        default_style.update(styles)
    styles = default_style

    content = txtctrl.Value.replace("\r", "")
    lns = content.split("\n")
    pos = 0

    for ln in lns:
        __highLightOneLine(txtctrl, ln, pos, styles)
        pos += len(ln) + 1



  