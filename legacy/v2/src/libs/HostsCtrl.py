# -*- coding: utf-8 -*-
#
# author: oldj
# blog: http://oldj.net
# email: oldj.wu@gmail.com
#

import wx
from wx import stc
#import keyword

if wx.Platform == '__WXMSW__':
    faces = {
        'times': 'Times New Roman',
        'mono': 'Courier New',
        'helv': 'Courier New',
        'other': 'Courier New',
        'size': 10,
        'size2': 10,
        }
elif wx.Platform == '__WXMAC__':
    faces = {
        'times': 'Times New Roman',
        'mono': 'Monaco',
        'helv': 'Monaco',
        'other': 'Monaco',
        'size': 12,
        'size2': 12,
        }
else:
    faces = {
        'times': 'Times',
        'mono': 'Courier New',
        'helv': 'Helvetica',
        'other': 'Courier New',
        'size': 12,
        'size2': 12,
        }


class HostsCtrl(stc.StyledTextCtrl):

    def __init__(self, parent, id=wx.ID_ANY, pos=wx.DefaultPosition,
                 size=wx.DefaultSize, style=0):

        stc.StyledTextCtrl.__init__(self, parent, id, pos, size, style)

        self.SetReadOnly(False)
        self.SetLexer(stc.STC_LEX_CONF)
#        self.SetKeyWords(0, " ".join(keyword.kwlist))

#        self.SetProperty("fold", "1")
#        self.SetProperty("tab.timmy.whinge.level", "1")

        self.SetViewWhiteSpace(False)
        self.SetEdgeColumn(80)
        self.SetMarginWidth(0, 0)
        self.SetMarginWidth(1, 5)
        self.SetMarginWidth(2, 5)
        self.SetScrollWidth(800)

        # Global default styles for all languages
        self.StyleSetSpec(stc.STC_STYLE_DEFAULT, "face:%(helv)s,size:%(size)d" % faces)
        self.StyleClearAll()  # Reset all to be like the default

        # Global default styles for all languages
        self.StyleSetSpec(stc.STC_STYLE_DEFAULT, "face:%(helv)s,size:%(size)d" % faces)
        self.StyleSetSpec(stc.STC_STYLE_CONTROLCHAR, "face:%(other)s" % faces)
        self.StyleSetSpec(stc.STC_STYLE_BRACELIGHT, "fore:#FFFFFF,back:#0000FF,bold")
        self.StyleSetSpec(stc.STC_STYLE_BRACEBAD, "fore:#000000,back:#FF0000,bold")

        # Default
        self.StyleSetSpec(stc.STC_P_DEFAULT, "fore:#000000,face:%(helv)s,size:%(size)d" % faces)
        # Comments
        self.StyleSetSpec(stc.STC_P_COMMENTLINE, "fore:#007F00,face:%(other)s,size:%(size)d" % faces)
        # Number
        self.StyleSetSpec(stc.STC_P_NUMBER, "fore:#007F7F,size:%(size)d" % faces)
        # String
        self.StyleSetSpec(stc.STC_P_STRING, "fore:#00007F,face:%(helv)s,size:%(size)d" % faces)
        # Single quoted string
        self.StyleSetSpec(stc.STC_P_CHARACTER, "fore:#7F007F,face:%(helv)s,size:%(size)d" % faces)
        # Keyword
#        self.StyleSetSpec(stc.STC_P_WORD, "fore:#00007F,bold,size:%(size)d" % faces)
        # Triple quotes
#        self.StyleSetSpec(stc.STC_P_TRIPLE, "fore:#7F0000,size:%(size)d" % faces)
        # Triple double quotes
#        self.StyleSetSpec(stc.STC_P_TRIPLEDOUBLE, "fore:#7F0000,size:%(size)d" % faces)
        # Class name definition
        self.StyleSetSpec(stc.STC_P_CLASSNAME, "fore:#0000FF,bold,underline,size:%(size)d" % faces)
        # Function or method name definition
#        self.StyleSetSpec(stc.STC_P_DEFNAME, "fore:#007F7F,bold,size:%(size)d" % faces)
        # Operators
#        self.StyleSetSpec(stc.STC_P_OPERATOR, "bold,size:%(size)d" % faces)
        # Identifiers
#        self.StyleSetSpec(stc.STC_P_IDENTIFIER, "fore:#000000,face:%(helv)s,size:%(size)d" % faces)
        # Comment-blocks
        self.StyleSetSpec(stc.STC_P_COMMENTBLOCK, "fore:#7F7F7F,size:%(size)d" % faces)
        # End of line where string is not closed
        self.StyleSetSpec(stc.STC_P_STRINGEOL, "fore:#000000,face:%(mono)s,back:#E0C0E0,eol,size:%(size)d" % faces)

        self.SetCaretForeground("BLUE")


    def SetValue(self, value):
    #        if wx.USE_UNICODE:
    #            value = value.decode('utf-8')

    #        self.SetReadOnly(False)
        self.SetText(value)

        #        self.SetReadOnly(True)

