# -*- coding: utf-8 -*-
"""Generate batch_edit operation files for the Ardot canvas.

Stage 1 (--stage1): container blocks (page frames, group frames, grids).
  -> ops/s1_p1.js, ops/s1_p2_a.js, ops/s1_p2_b.js
  After calling these, write payloads/grid_ids.json: {"<grid node name>": "<node id>", ...}

Stage 2 (--stage2): fill blocks (color swatches, type specimens, spacing, radius,
  string rows, component cards) using real grid ids from grid_ids.json.
  -> ops/fill_*.js  (each <= 25 operations)
"""
import json
import math
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PAY = os.path.join(BASE, "payloads")
OPS = os.path.join(PAY, "ops")
os.makedirs(OPS, exist_ok=True)

PAGE1 = "0:1"
PAGE2 = "2:222"

with open(os.path.join(PAY, "token_entries.json"), encoding="utf-8") as f:
    entries = json.load(f)
with open(os.path.join(PAY, "components_grouped.json"), encoding="utf-8") as f:
    categories = json.load(f)

FONT = {"family": "Noto Sans SC", "style": "Regular"}
FONT_SB = {"family": "Noto Sans SC", "style": "SemiBold"}
FONT_MONO = {"family": "Noto Sans Mono", "style": "Regular"}

INK = "#1F2329"
SUB = "#646A73"
MUT = "#8F959E"
GRID_LINE = {"r": 0.8157, "g": 0.8275, "b": 0.8392}  # #D0D3D6
CARD_LINE = {"r": 0.9333, "g": 0.9451, "b": 0.9647}  # #EEF1F6
BLUE = {"r": 0.0784, "g": 0.3373, "b": 0.9412}       # #1456F0


def js(props):
    return json.dumps(props, ensure_ascii=False)


def op_insert(binding, parent, props):
    return '%s=I("%s", %s)' % (binding, parent, js(props))


def strokes_op():
    return [{"type": "SOLID", "color": GRID_LINE, "opacity": 1, "visible": True, "blendMode": "NORMAL"}]


def card_strokes():
    return [{"type": "SOLID", "color": CARD_LINE, "opacity": 1, "visible": True, "blendMode": "NORMAL"}]


def text_op(binding, parent, name, content, size, style, fill, extra=None):
    props = {"type": "text", "name": name, "content": content, "fontSize": size,
             "fontWeight": "600" if style == FONT_SB else "400",
             "fill": fill, "fontName": style}
    if extra:
        props.update(extra)
    return op_insert(binding, parent, props)


def group_frame_op(binding, parent_id, name, x, y, width):
    return op_insert(binding, parent_id, {
        "type": "frame", "name": name, "layout": "vertical", "gap": 12,
        "padding": 24, "cornerRadius": 12, "fill": "#FFFFFF",
        "strokes": strokes_op(), "strokeWeight": 1,
        "x": x, "y": y, "width": width, "height": "hug_contents",
    })


def grid_op(binding, parent_binding, grid_name, gap=12):
    return op_insert(binding, parent_binding, {
        "type": "frame", "name": grid_name, "layout": "wrap", "gap": gap,
        "width": "fill_container", "height": "hug_contents",
        "counterAxisAlignContent": "AUTO",
    })


# ---------------------------------------------------------------------------
# color grouping
# ---------------------------------------------------------------------------
def color_group(section):
    if section.startswith("Semantic"):
        return "colors-semantic"
    if (section.startswith("Performance shared") or section.startswith("Shared button")
            or section.startswith("Shared field") or section.startswith("Shared container")):
        return "colors-perf"
    return "colors-base"


colors = {"colors-base": [], "colors-semantic": [], "colors-perf": []}
for e in entries:
    if e["kind"] == "COLOR":
        colors[color_group(e["section"])].append(e)

GROUP_TITLES = {
    "colors-base": "基础与状态色（Brand / Text / Background / Border / Status）",
    "colors-semantic": "语义别名色（Semantic surface & control aliases）",
    "colors-perf": "绩效组件色（Performance shared / button / field / container）",
}


def stage1():
    ops = []
    # page 1 header
    ops.append(op_insert("hd", PAGE1, {
        "type": "frame", "name": "header:tokens", "layout": "vertical", "gap": 6,
        "x": 0, "y": 0, "width": "hug_contents", "height": "hug_contents"}))
    ops.append(text_op("h1", "hd", "标题", "HR Portal 绩效管理 · 设计令牌", 20, FONT_SB, INK))
    ops.append(text_op("h2", "hd", "副标题",
                       "变量集 Performance Tokens · 219 tokens = 89 COLOR + 115 FLOAT + 15 STRING · 源自 hr-portal/frontend/src/styles/tokens.css",
                       12, FONT, SUB))

    # page 1 groups: (binding, grid_name, x, y, width, title)
    p1_groups = [
        ("gsem", "grid:colors-semantic", 0, 220, 1008, GROUP_TITLES["colors-semantic"]),
        ("gbas", "grid:colors-base", 0, 660, 1008, GROUP_TITLES["colors-base"]),
        ("gprf", "grid:colors-perf", 0, 1600, 1008, GROUP_TITLES["colors-perf"]),
        ("gtyp", "grid:type", 1120, 0, 1000, "排版样张（字号 / 字重，正文 14px·400，标题 600）"),
        ("gspa", "grid:spacing", 1120, 500, 1000, "间距（--spacing-*，px）"),
        ("grad", "grid:radius", 1120, 860, 1000, "圆角（--radius-*，px）"),
        ("gstr", "grid:strings", 1120, 1120, 760, "阴影 · 动效 · 字体栈（CSS 原值）"),
    ]
    for b, gname, x, y, w, title in p1_groups:
        ops.append(group_frame_op(b, PAGE1, "group:" + gname.split(":")[1], x, y, w))
        ops.append(text_op(b + "t", b, "组标题", title, 13, FONT_SB, INK))
        ops.append(grid_op(b + "g", b, gname))

    write_ops("s1_p1.js", ops)

    # page 2: header + 15 category sections in 3 columns
    col_x = [0, 1330, 2660]
    # (index, x, y) estimated to avoid overlap
    pos = [
        (0, 0, 0), (1, 0, 560), (2, 0, 1120), (3, 0, 1760),
        (4, 1, 0), (5, 1, 560), (6, 1, 1000), (7, 1, 1380), (8, 1, 1760),
        (9, 2, 0), (10, 2, 320), (11, 2, 640), (12, 2, 960), (13, 2, 1260), (14, 2, 1480),
    ]
    ops2 = []
    ops2.append(op_insert("hd2", PAGE2, {
        "type": "frame", "name": "header:components", "layout": "vertical", "gap": 6,
        "x": 3990, "y": 0, "width": "hug_contents", "height": "hug_contents"}))
    ops2.append(text_op("t1", "hd2", "标题", "HR Portal 绩效管理 · 组件目录", 20, FONT_SB, INK))
    ops2.append(text_op("t2", "hd2", "副标题",
                        "218 个组件 · 15 分类 · 源自 src/components/performance/ · 名称卡片 = 组件名 + 来源文件名，作为逐个落高保真组件的目录骨架",
                        12, FONT, SUB))
    write_ops("s1_p2_a.js", ops2)

    for ci in range(0, 7):
        idx, x, y = pos[ci]
        cat = categories[idx]
        b = "c%d" % idx
        ops3 = []
        ops3.append(group_frame_op(b, PAGE2, "cat:%s" % cat["category"], col_x[x], y, 1240))
        ops3.append(text_op(b + "t", b, "分区标题",
                            "%02d · %s · %d 个" % (idx + 1, cat["category"], cat["count"]), 15, FONT_SB, INK))
        ops3.append(grid_op(b + "g", b, "grid:cat-%02d" % (idx + 1), gap=10))
        write_ops("s1_p2_b%d.js" % idx, ops3)
    for ci in range(7, 15):
        idx, x, y = pos[ci]
        cat = categories[idx]
        b = "c%d" % idx
        ops3 = []
        ops3.append(group_frame_op(b, PAGE2, "cat:%s" % cat["category"], col_x[x], y, 1240))
        ops3.append(text_op(b + "t", b, "分区标题",
                            "%02d · %s · %d 个" % (idx + 1, cat["category"], cat["count"]), 15, FONT_SB, INK))
        ops3.append(grid_op(b + "g", b, "grid:cat-%02d" % (idx + 1), gap=10))
        write_ops("s1_p2_b%d.js" % idx, ops3)


def swatch_ops(e, grid_id, n):
    b = "sw%d" % n
    ops = []
    ops.append(op_insert(b, grid_id, {
        "type": "frame", "name": "swatch:" + e["name"], "layout": "vertical", "gap": 4,
        "width": 148, "height": "hug_contents"}))
    ops.append(op_insert(b + "c", b, {
        "type": "frame", "name": "色块 " + e["name"], "width": 148, "height": 48,
        "cornerRadius": 6, "fill": e["raw"], "strokes": strokes_op(), "strokeWeight": 1}))
    label = "%s\n%s" % (e["name"], e["raw"])
    ops.append(op_insert(b + "t", b, {
        "type": "text", "name": "标签 " + e["name"], "content": label, "fontSize": 10,
        "fontWeight": "400", "fill": SUB, "fontName": FONT, "width": "fill_container"}))
    return ops


def chunk_ops(ops, prefix, limit=24):
    files = []
    for i in range(0, len(ops), limit):
        name = "%s%02d.js" % (prefix, i // limit)
        write_ops(name, ops[i:i + limit])
        files.append(name)
    return files


def stage2():
    index = []
    gid = load_grid_ids()

    # colors: 8 swatches (24 ops) per block
    for key in ("colors-base", "colors-semantic", "colors-perf"):
        ops = []
        for i, e in enumerate(colors[key]):
            ops.extend(swatch_ops(e, gid["grid:" + key], i))
        index += chunk_ops(ops, "fill_p1_%s_" % key)

    # type specimens: 6 sizes + 2 weights, 3 ops each
    sizes = [("font-size-xs", 12), ("font-size-sm", 13), ("font-size-md", 14),
             ("font-size-lg", 16), ("font-size-xl", 20), ("font-size-2xl", 24)]
    ops = []
    n = 0
    for name, size in sizes:
        b = "sp%d" % n
        ops.append(op_insert(b, gid["grid:type"], {
            "type": "frame", "name": "spec:" + name, "layout": "vertical", "gap": 4,
            "padding": 8, "cornerRadius": 6, "fill": "#F8FAFC",
            "width": 460, "height": "hug_contents"}))
        ops.append(op_insert(b + "s", b, {
            "type": "text", "name": "样张 " + name,
            "content": "绩效管理 Performance Aa 123", "fontSize": size,
            "fontWeight": "400", "fill": INK, "fontName": FONT}))
        ops.append(text_op(b + "t", b, "标签", "%s · %dpx" % (name, size), 10, FONT, SUB))
        n += 1
    for label, weight, style in [("正文字重 400（Regular）", "400", FONT), ("标题字重 600（SemiBold）", "600", FONT_SB)]:
        b = "sp%d" % n
        ops.append(op_insert(b, gid["grid:type"], {
            "type": "frame", "name": "spec:weight-" + weight, "layout": "vertical", "gap": 4,
            "padding": 8, "cornerRadius": 6, "fill": "#F8FAFC",
            "width": 460, "height": "hug_contents"}))
        ops.append(op_insert(b + "s", b, {
            "type": "text", "name": "样张 字重" + weight,
            "content": "绩效管理 Performance Aa 123", "fontSize": 14,
            "fontWeight": weight, "fill": INK, "fontName": style}))
        ops.append(text_op(b + "t", b, "标签", label, 10, FONT, SUB))
        n += 1
    index += chunk_ops(ops, "fill_p1_type_")

    # spacing rulers: 3 ops each
    spacing = [(e["name"], int(e["value"])) for e in entries
               if e["kind"] == "FLOAT" and e["name"].startswith("spacing-")]
    spacing.sort(key=lambda x: x[1])
    ops = []
    for i, (name, v) in enumerate(spacing):
        b = "sr%d" % i
        ops.append(op_insert(b, gid["grid:spacing"], {
            "type": "frame", "name": "ruler:" + name, "layout": "vertical", "gap": 4,
            "width": 120, "height": "hug_contents"}))
        ops.append(op_insert(b + "s", b, {
            "type": "frame", "name": "标尺 " + name, "width": 40, "height": max(v, 4),
            "cornerRadius": 2, "fill": "#EEF2FF", "strokes": [
                {"type": "SOLID", "color": BLUE, "opacity": 1, "visible": True, "blendMode": "NORMAL"}],
            "strokeWeight": 1}))
        ops.append(text_op(b + "t", b, "标签", "%s · %dpx" % (name, v), 10, FONT, SUB))
    index += chunk_ops(ops, "fill_p1_spacing_")

    # radius samples: 3 ops each
    radii = [(e["name"], e["value"]) for e in entries
             if e["kind"] == "FLOAT" and e["name"].startswith("radius-")]
    ops = []
    for i, (name, v) in enumerate(radii):
        b = "rd%d" % i
        ops.append(op_insert(b, gid["grid:radius"], {
            "type": "frame", "name": "radius:" + name, "layout": "vertical", "gap": 4,
            "width": 120, "height": "hug_contents"}))
        ops.append(op_insert(b + "s", b, {
            "type": "frame", "name": "圆角 " + name, "width": 56, "height": 56,
            "cornerRadius": v, "fill": "#F2F3F5", "strokes": strokes_op(), "strokeWeight": 1}))
        ops.append(text_op(b + "t", b, "标签", "%s · %g" % (name, v), 10, FONT, SUB))
    index += chunk_ops(ops, "fill_p1_radius_")

    # strings (shadow / motion / font stacks): 3 ops each
    strings = [e for e in entries if e["kind"] == "STRING"]
    ops = []
    for i, e in enumerate(strings):
        b = "st%d" % i
        ops.append(op_insert(b, gid["grid:strings"], {
            "type": "frame", "name": "tok:" + e["name"], "layout": "vertical", "gap": 4,
            "padding": 10, "cornerRadius": 6, "fill": "#F8FAFC",
            "width": "fill_container", "height": "hug_contents"}))
        ops.append(text_op(b + "n", b, "名称", e["name"], 11, FONT_SB, INK))
        ops.append(op_insert(b + "v", b, {
            "type": "text", "name": "值 " + e["name"], "content": e["value"], "fontSize": 10,
            "fontWeight": "400", "fill": "#5C6B82", "fontName": FONT_MONO, "width": "fill_container"}))
    index += chunk_ops(ops, "fill_p1_strings_")

    # component cards: 3 ops each, 8 cards (24 ops) per block
    for idx, cat in enumerate(categories):
        gid_key = "grid:cat-%02d" % (idx + 1)
        ops = []
        for j, comp in enumerate(cat["components"]):
            name_no_ext = comp[:-4] if comp.endswith(".vue") else comp
            b = "cd%d" % j
            ops.append(op_insert(b, gid[gid_key], {
                "type": "frame", "name": "card:" + name_no_ext, "layout": "vertical", "gap": 2,
                "padding": 10, "cornerRadius": 6, "fill": "#FFFFFF",
                "strokes": card_strokes(), "strokeWeight": 1,
                "width": 228, "height": "hug_contents"}))
            ops.append(text_op(b + "n", b, "组件名", name_no_ext, 12, FONT_SB, INK,
                               extra={"width": "fill_container"}))
            ops.append(op_insert(b + "s", b, {
                "type": "text", "name": "来源", "content": comp, "fontSize": 10,
                "fontWeight": "400", "fill": MUT, "fontName": FONT_MONO, "width": "fill_container"}))
        index += chunk_ops(ops, "fill_p2_cat%02d_" % (idx + 1))

    with open(os.path.join(OPS, "INDEX.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(index))


def write_ops(name, ops):
    with open(os.path.join(OPS, name), "w", encoding="utf-8") as f:
        f.write("\n".join(ops))
    print("%s -> %d ops" % (name, len(ops)))


def load_grid_ids():
    with open(os.path.join(PAY, "grid_ids.json"), encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    if "--stage1" in sys.argv:
        stage1()
    if "--stage2" in sys.argv:
        stage2()
