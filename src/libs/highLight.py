# -*- coding: utf-8 -*-

import time
import wx
import re
import sys


if sys.platform != "darwin":
    font_face_mono = "Courier New"
else:
    # 系统是 Mac OS X
    font_face_mono = "Monaco"
font_mono = wx.Font(12, wx.ROMAN, wx.NORMAL, wx.NORMAL, faceName=font_face_mono)

hl_count = 0
cre_ip = re.compile(r"^(\s*[\da-f\.:]+[\da-f]+)\s+\w")

def __highLightOneLine(txtctrl, ln, start_pos, styles):

    ln_content, comment_sep, ln_comment = ln.partition("#")
    end_pos = start_pos + len(ln)
#    txtctrl.SetStyle(start_pos, end_pos, wx.TextAttr(styles["color_normal"], "#ffffff", styles["font_mono"]))
    txtctrl.setStyle(start_pos, end_pos, styles["color_normal"])

    # 行正文部分
    #re_ip = re.match(r"^(\s*[\da-f\.:]+[\da-f]+)\s+\w", ln_content)
    re_ip = cre_ip.match(ln_content)
    if re_ip:
        s_ip = re_ip.group(1)
        pos2 = start_pos + len(s_ip)
        pos = pos2 - len(s_ip.lstrip())
#        txtctrl.SetStyle(pos, pos2, wx.TextAttr(styles["color_ip"], "#ffffff", styles["font_mono"]))
        txtctrl.setStyle(pos, pos2, styles["color_ip"])
    elif len(ln_content.strip()) > 0:
        pos2 = start_pos + len(ln_content)
#        txtctrl.SetStyle(start_pos, pos2, wx.TextAttr(styles["color_error"], "#ffffff", styles["font_mono"]))
        txtctrl.setStyle(start_pos, pos2, styles["color_error"])

    # 行注释部分
    if comment_sep:

        if ln.strip().startswith("#@import "):
            # import 语法
            end_pos = start_pos + len(ln)
            txtctrl.setStyle(start_pos, end_pos, styles["color_import"])

        else:
            # 注释
            pos = start_pos + len(ln_content)
    #        txtctrl.SetStyle(pos, end_pos, wx.TextAttr(styles["color_comment"], "#ffffff", styles["font_mono"]))
            txtctrl.setStyle(pos, end_pos, styles["color_comment"])



def highLight(txtctrl, styles=None, old_content=None):

    global hl_count

    default_style = {
        "color_normal": "#000000",
        "color_bg": "#ffffff",
        "color_comment": "#339933",
        "color_ip": "#0000cc",
        "color_error": "#ff0000",
        "color_import": "#990000",
        "font_mono": font_mono,
    }
    if styles:
        default_style.update(styles)
    styles = default_style

#    content = txtctrl.Value.replace("\r", "")
    content = txtctrl().replace("\r", "")
    lns = content.split("\n")
    if len(lns) > 100:
        # 如果行数太多，跳过语法高亮
        return

    if old_content:
        old_content = old_content.replace("\r", "")
        lns_old = old_content.split("\n")
    else:
        lns_old = None
    pos = 0

    for idx, ln in enumerate(lns):
        ln = ln.encode("utf-8")
        ln_old = None
        if lns_old and idx < len(lns_old):
            ln_old = lns_old[idx]

        if not ln_old or ln != ln_old:
            __highLightOneLine(txtctrl, ln, pos, styles)

        pos += len(ln) + 1

    hl_count += 1
#    print("high lighted #%d!" % hl_count)

