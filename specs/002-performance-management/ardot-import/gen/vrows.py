# -*- coding: utf-8 -*-
import io
ROWS = [
    ("被评估人", "部门，职级，序列"),
    ("实线上级", "部门，职级，序列，直属上级，入职日期"),
    ("虚线上级", "部门，职级，序列，直属上级，入职日期"),
    ("PDT 管理者", "部门"),
    ("指标评价人", "部门"),
    ("360°评估人", "部门，序列，直属上级，入职日期"),
    ("校准人", "部门，职级，序列，直属上级，入职日期"),
    ("HRBP", "部门，职级，序列，直属上级，入职日期"),
    ("项目管理员", "部门，职级，序列，直属上级，入职日期，人员类型"),
    ("其他角色", "部门，序列，直属上级，入职日期"),
]
def esc(s): return s.replace('\\','\\\\').replace('"','\\"')
def tx(name, content, w, x, y, fill="#1F2329"):
    return '{"type":"text","name":"%s","content":"%s","fontSize":14,"fontWeight":"400","fill":"%s","fontName":{"family":"Noto Sans SC","style":"Regular"},"width":%d,"height":22,"x":%d,"y":%d}' % (name, esc(content), fill, w, x, y)
def ln(y):
    return '{"type":"frame","name":"行线","width":1320,"height":1,"x":0,"y":%d,"fill":"#EFF0F1"}' % y
L=[]
for i,(role, fields) in enumerate(ROWS, start=1):
    top = 48.0 + (i-1)*48.0
    cy = int(top + 13)
    L.append('V%dr=I("2:2127", %s)' % (i, tx("行%d-角色名称" % i, role, 160, 32, cy)))
    L.append('V%dt=I("2:2127", %s)' % (i, tx("行%d-可见标签信息" % i, "--", 160, 192, cy)))
    L.append('V%df=I("2:2127", %s)' % (i, tx("行%d-可见字段" % i, fields, 800, 352, cy)))
    L.append('V%da=I("2:2127", %s)' % (i, tx("行%d-编辑" % i, "编辑", 32, 1166, cy, fill="#1456F0")))
    if i < len(ROWS):
        L.append('V%dl=I("2:2127", %s)' % (i, ln(int(top+48))))
io.open('c4_rows.txt','w',encoding='utf-8').write('\n'.join(L))
print(len(L),"ops")
