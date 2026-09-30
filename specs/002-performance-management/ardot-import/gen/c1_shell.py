# -*- coding: utf-8 -*-
import io

def T(name, content, size, w, color, weight="400", h=None, x=None, y=None, style=None):
    s = style or ("Semi Bold" if weight in ("600","700") else ("Medium" if weight=="500" else "Regular"))
    d = '{"type":"text","name":"%s","content":"%s","fontSize":%d,"fontWeight":"%s","fill":"%s","fontName":{"family":"Noto Sans SC","style":"%s"},"width":%d' % (name, content, size, weight, color, s, w)
    if h: d += ',"height":%d' % h
    if x is not None: d += ',"x":%d' % x
    if y is not None: d += ',"y":%d' % y
    return d + '}'

def F(name, w, h, x, y, fill=None, radius=None, strokes=None, sw=1):
    d = '{"type":"frame","name":"%s","width":%d,"height":%d,"x":%d,"y":%d' % (name, w, h, x, y)
    if fill: d += ',"fill":"%s"' % fill
    if radius: d += ',"cornerRadius":%d' % radius
    if strokes: d += ',"strokes":[{"type":"SOLID","color":{"r":%.4f,"g":%.4f,"b":%.4f},"opacity":1,"visible":true,"blendMode":"NORMAL"}],"strokeWeight":%d' % (strokes[0], strokes[1], strokes[2], sw)
    return d + '}'

def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2],16)/255, int(h[2:4],16)/255, int(h[4:6],16)/255)

L=[]
def U(nid, body): L.append('U("%s", %s)' % (nid, body))

# ---- 角色配置 2:1717 ----
U("2:1717", '{"name":"PM 管理端 · 角色配置"}')
U("2:1721", T("页面标题", "角色配置", 20, 100, "#1F2329", "600", h=28))
U("2:1722", '{"name":"页面主体"}')
P1="2:1722"
# 页签
tab1 = 'FT1'
L.append('%s=I("%s", %s)' % (tab1, P1, F("页签-管理角色 active", 104, 48, 0, 0, radius=0)))
L.append('FT1s=I(%s, %s)' % (tab1, F("页签文字-管理角色", 0, 0, 0, 0, radius=0)))
U("FT1s", '{"type":"text","name":"页签文字-管理角色","content":"管理角色","fontSize":16,"fontWeight":"600","fill":"#1456f0","fontName":{"family":"Noto Sans SC","style":"Semi Bold"},"width":70,"height":24,"x":17,"y":12}')
L.append('FT1b=I(%s, %s)' % (tab1, F("页签指示条", 72, 3, 16, 45, fill="#3370ff", radius=2)))
tab2 = 'FT2'
L.append('%s=I("%s", %s)' % (tab2, P1, F("页签-评估角色", 104, 48, 104, 0, radius=0)))
U("FT2t", '{}')
L.append('FT2t=I(%s, {"type":"text","name":"页签文字-评估角色","content":"评估角色","fontSize":16,"fontWeight":"400","fill":"#646A73","fontName":{"family":"Noto Sans SC","style":"Regular"},"width":70,"height":24,"x":17,"y":12})' % tab2)
L.append('FTl=I("%s", %s)' % (P1, F("页签底线", 1320, 1, 0, 48, fill="#DEE0E3")))
# 内容卡
L.append('RC=I("%s", %s)' % (P1, F("内容卡·角色配置", 1320, 810, 0, 64, fill="#FFFFFF", radius=8)))
L.append('U("RC", {"padding":10})')

io.open('c1.txt','w',encoding='utf-8').write('\n'.join(L))
print('\n'.join(L))
