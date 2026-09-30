# -*- coding: utf-8 -*-
import io, sys

ROWS = [
    ("绩效超级管理员", "仅管理独立绩效管理员账号", "已启用", "--", "2026-09-01 10:12:00"),
    ("绩效管理员", "管理绩效配置、授权和后续周期流程", "已启用", "--", "2026-09-01 10:12:00"),
    ("被评估人", "查看自己的绩效评估详情", "已启用", "--", "2026-09-14 09:30:00"),
    ("实线上级", "查看直属下级的绩效评估详情", "已启用", "--", "2026-09-14 09:30:00"),
    ("虚线上级", "查看虚线汇报下级的绩效评估详情", "已启用", "--", "2026-09-14 09:30:00"),
    ("PDT 管理者", "查看 PDT 成员的绩效评估详情", "已启用", "--", "2026-09-14 09:30:00"),
    ("指标评价人", "查看被评估人指标相关详情", "已停用", "--", "2026-08-20 15:42:00"),
    ("360°评估人", "查看被评估人 360 评估所需信息", "已启用", "--", "2026-09-14 09:30:00"),
    ("校准人", "查看被校准人绩效详情用于校准", "已启用", "--", "2026-09-14 09:30:00"),
    ("HRBP", "查看所负责部门的绩效详情", "已启用", "--", "2026-09-14 09:30:00"),
]
HDR = 76.0
RH = 48.0
def esc(s): return s.replace('\\','\\\\').replace('"','\\"')
def tx(name, content, w, x, y, fill="#1F2329", weight="400", size=14):
    st = "Semi Bold" if weight == "600" else "Regular"
    return '{"type":"text","name":"%s","content":"%s","fontSize":%d,"fontWeight":"%s","fill":"%s","fontName":{"family":"Noto Sans SC","style":"%s"},"width":%d,"height":22,"x":%d,"y":%d}' % (
        name, esc(content), size, weight, fill, st, w, x, y)
def ln(y):
    return '{"type":"frame","name":"行线","width":1300,"height":1,"x":10,"y":%d,"fill":"#EFF0F1"}' % y
L=[]
for i, (name, desc, status, upd, when) in enumerate(ROWS, start=1):
    top = HDR + (i-1)*RH
    cy  = int(top + 13)
    L.append('R%dn=I("2:2263", %s)' % (i, tx("行%d-角色" % i, name, 180, 22, cy, fill="#1456F0")))
    L.append('R%dd=I("2:2263", %s)' % (i, tx("行%d-描述" % i, desc, 280, 202, cy)))
    dot = "#34C759" if status == "已启用" else "#BBBBBF"
    L.append('R%ds=I("2:2263", {"type":"frame","name":"行%d-状态点","width":6,"height":6,"x":482,"y":%d,"fill":"%s","cornerRadius":3})' % (i, i, int(top+21), dot))
    L.append('R%dt=I("2:2263", %s)' % (i, tx("行%d-状态" % i, status, 60, 488, cy)))
    L.append('R%du=I("2:2263", %s)' % (i, tx("行%d-更新人" % i, upd, 140, 602, cy)))
    L.append('R%dw=I("2:2263", %s)' % (i, tx("行%d-最近更新时间" % i, when, 160, 742, cy)))
    # 操作：编辑 / 停用|启用 / ···
    L.append('R%da=I("2:2263", %s)' % (i, tx("行%d-编辑" % i, "编辑", 28, 1112, cy, fill="#1456F0")))
    L.append('R%db=I("2:2263", %s)' % (i, tx("行%d-停用" % i, "停用", 28, 1148, cy, fill="#BBBBBF")))
    L.append('R%dm=I("2:2263", %s)' % (i, tx("行%d-更多" % i, "···", 24, 1184, cy, fill="#646A73", size=16)))
    if i < len(ROWS):
        L.append('R%dl=I("2:2263", %s)' % (i, ln(int(top+RH))))
io.open('c1_rows.txt','w',encoding='utf-8').write('\n'.join(L))
print(len(L), "ops")
