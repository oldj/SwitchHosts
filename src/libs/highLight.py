# -*- coding: utf-8 -*-

import wx
import re
import sys


if sys.platform != "darwin":
    font_mono = wx.Font(10, wx.ROMAN, wx.NORMAL, wx.NORMAL, faceName="Courier New")

else:
    # 系统是 Mac OS X
    font_mono = wx.Font(12, wx.ROMAN, wx.NORMAL, wx.NORMAL, faceName="Monaco")


def __highLightOneLine(txtctrl, ln, start_pos, styles):

    ln_content, t, ln_comment = ln.partition("#")
    end_pos = start_pos + len(ln)
    txtctrl.SetStyle(start_pos, end_pos, styles["color_normal"])

    # 行正文部分
    re_ip = re.match(r"^(\s*[\da-f\.:]+[\da-f]+)\s+\w", ln_content)
    if re_ip:
        s_ip = re_ip.group(1)
        pos2 = start_pos + len(s_ip)
        pos = pos2 - len(s_ip.lstrip())
        txtctrl.SetStyle(pos, pos2, styles["color_ip"])
    elif len(ln_content.strip()) > 0:
        pos2 = start_pos + len(ln_content)
        txtctrl.SetStyle(start_pos, pos2, styles["color_error"])

    # 行注释部分
    if t:
        pos = start_pos + len(ln_content)
        txtctrl.SetStyle(pos, end_pos, styles["color_comment"])


def highLight(txtctrl, styles=None, old_content=None, default_font=None):

    default_style = {
        "color_normal": wx.TextAttr("#000000", "#ffffff", font_mono),
        "color_bg": "#ffffff",
        "color_comment": wx.TextAttr("#339933", "#ffffff", font_mono),
        "color_ip": wx.TextAttr("#0000cc", "#ffffff", font_mono),
        "color_error": wx.TextAttr("#ff0000", "#ffffff", font_mono),
        "font_mono": font_mono,
    }
    if styles:
        default_style.update(styles)
    styles = default_style

    if default_font:
        txtctrl.SetFont(default_font)

    content = txtctrl.Value.replace("\r", "")
    lns = content.split("\n")
    if old_content:
        old_content = old_content.replace("\r", "")
        lns_old = old_content.split("\n")
    else:
        lns_old = None
    pos = 0

    for idx, ln in enumerate(lns):

        ln_old = None
        if lns_old and idx < len(lns_old):
            ln_old = lns_old[idx]

        if not ln_old or ln != ln_old:
            __highLightOneLine(txtctrl, ln, pos, styles)

        pos += len(ln) + 1



  