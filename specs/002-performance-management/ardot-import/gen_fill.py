# -*- coding: utf-8 -*-
"""Generate batch_edit FILL operation files (stage 2) using real grid ids.

v2 fixes:
- bindings used as parent MUST be unquoted (e.g. sw1c=I(sw1, {...}));
  in-block bindings are marked with a leading "@" in the parent argument.
- swatch fill: NEVER use raw var()/rgba() strings (invalid Ardot fills).
  Use hex6 when available (raw/resolved); translucent colors use the
  fills-array form with opacity built from the manifest `value` field.
- limit=48 ops per chunk (proven working); colors-base skips the first
  BASE_DONE swatches already inserted into the canvas.
Card is simplified to 2 ops: frame + one text (the source file name, which
carries both the component name and the source file).
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PAY = os.path.join(BASE, "payloads")
OPS = os.path.join(PAY, "ops")

with open(os.path.join(PAY, "token_entries.json"), encoding="utf-8") as f:
    entries = json.load(f)
with open(os.path.join(PAY, "components_grouped.json"), encoding="utf-8") as f:
    categories = json.load(f)
with open(os.path.join(PAY, "grid_ids.json"), encoding="utf-8") as f:
    GID = json.load(f)

FONT = {"family": "Noto Sans SC", "style": "Regular"}
FONT_SB = {"family": "Noto Sans SC", "style": "SemiBold"}
FONT_MONO = {"family": "Noto Sans Mono", "style": "Regular"}
INK = "#1F2329"
SUB = "#646A73"
MUT = "#8F959E"
GRID_LINE = {"r": 0.8157, "g": 0.8275, "b": 0.8392}
CARD_LINE = {"r": 0.9333, "g": 0.9451, "b": 0.9647}
BLUE = {"r": 0.0784, "g": 0.3373, "b": 0.9412}


def js(props):
    return json.dumps(props, ensure_ascii=False, separators=(",", ":"))


def op_insert(binding, parent, props):
    if parent.startswith("@"):
        return "%s=I(%s, %s)" % (binding, parent[1:], js(props))
    return '%s=I("%s", %s)' % (binding, parent, js(props))


def text_props(name, content, size, style, fill, extra=None):
    props = {"type": "text", "name": name, "content": content, "fontSize": size,
             "fontWeight": "600" if style == FONT_SB else "400",
             "fill": fill, "fontName": style}
    if extra:
        props.update(extra)
    return props


def strokes_op():
    return [{"type": "SOLID", "color": GRID_LINE, "opacity": 1, "visible": True, "blendMode": "NORMAL"}]


def card_strokes():
    return [{"type": "SOLID", "color": CARD_LINE, "opacity": 1, "visible": True, "blendMode": "NORMAL"}]


HEX6_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def fill_props(e):
    """Swatch fill: hex6 when possible; otherwise fills-array with opacity
    from the manifest `value` (translucent rgba tokens). Never var()."""
    for cand in (e.get("raw"), e.get("resolved")):
        if isinstance(cand, str) and HEX6_RE.match(cand):
            return {"fill": cand}
    v = e["value"]
    r, g, b, a = v["r"], v["g"], v["b"], v.get("a", 1)
    if a >= 0.999:
        return {"fill": "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))}
    return {"fills": [{"type": "SOLID",
                       "color": {"r": round(r, 4), "g": round(g, 4), "b": round(b, 4)},
                       "opacity": round(a, 4), "visible": True, "blendMode": "NORMAL"}]}


def write_ops(name, ops):
    with open(os.path.join(OPS, name), "w", encoding="utf-8") as f:
        f.write("\n".join(ops))


def chunk_ops(ops, prefix, limit=48):
    files = []
    for i in range(0, len(ops), limit):
        name = "%s%02d.js" % (prefix, i // limit)
        write_ops(name, ops[i:i + limit])
        files.append(name)
    return files


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

index = []
BASE_DONE = 16  # colors-base s0-s15 already inserted into the canvas

# --- color swatches: 3 ops each (frame + color block + label) --------------
for key in ("colors-base", "colors-semantic", "colors-perf"):
    ops = []
    for i, e in enumerate(colors[key]):
        if key == "colors-base" and i < BASE_DONE:
            continue
        b = "s%d" % i
        ops.append(op_insert(b, GID["grid:" + key], {
            "type": "frame", "name": "swatch:" + e["name"], "layout": "vertical", "gap": 4,
            "width": 148, "height": "hug_contents"}))
        ops.append(op_insert(b + "c", "@" + b, dict(
            {"type": "frame", "name": "色块 " + e["name"], "width": 148, "height": 48,
             "cornerRadius": 6, "strokes": strokes_op(), "strokeWeight": 1},
            **fill_props(e))))
        ops.append(op_insert(b + "t", "@" + b, text_props(
            "标签 " + e["name"], "%s\n%s" % (e["name"], e["raw"]), 10, FONT, SUB,
            extra={"width": "fill_container"})))
    index += chunk_ops(ops, "fill_p1_%s_" % key)

# --- type specimens: 3 ops each --------------------------------------------
sizes = [("font-size-xs", 12), ("font-size-sm", 13), ("font-size-md", 14),
         ("font-size-lg", 16), ("font-size-xl", 20), ("font-size-2xl", 24)]
ops = []
n = 0
for name, size in sizes:
    b = "t%d" % n
    ops.append(op_insert(b, GID["grid:type"], {
        "type": "frame", "name": "spec:" + name, "layout": "vertical", "gap": 4,
        "padding": 8, "cornerRadius": 6, "fill": "#F8FAFC", "width": 460,
        "height": "hug_contents"}))
    ops.append(op_insert(b + "s", "@" + b, {
        "type": "text", "name": "样张 " + name, "content": "绩效管理 Performance Aa 123",
        "fontSize": size, "fontWeight": "400", "fill": INK, "fontName": FONT}))
    ops.append(op_insert(b + "x", "@" + b, text_props("标签", "%s · %dpx" % (name, size), 10, FONT, SUB)))
    n += 1
for label, weight, style in [("正文字重 400（Regular）", "400", FONT), ("标题字重 600（SemiBold）", "600", FONT_SB)]:
    b = "t%d" % n
    ops.append(op_insert(b, GID["grid:type"], {
        "type": "frame", "name": "spec:weight-" + weight, "layout": "vertical", "gap": 4,
        "padding": 8, "cornerRadius": 6, "fill": "#F8FAFC", "width": 460,
        "height": "hug_contents"}))
    ops.append(op_insert(b + "s", "@" + b, {
        "type": "text", "name": "样张 字重" + weight, "content": "绩效管理 Performance Aa 123",
        "fontSize": 14, "fontWeight": weight, "fill": INK, "fontName": style}))
    ops.append(op_insert(b + "x", "@" + b, text_props("标签", label, 10, FONT, SUB)))
    n += 1
index += chunk_ops(ops, "fill_p1_type_")

# --- spacing rulers: 3 ops each ---------------------------------------------
spacing = sorted([(e["name"], e["value"]) for e in entries
                  if e["kind"] == "FLOAT" and e["name"].startswith("spacing-")], key=lambda x: x[1])
ops = []
for i, (name, v) in enumerate(spacing):
    b = "p%d" % i
    ops.append(op_insert(b, GID["grid:spacing"], {
        "type": "frame", "name": "ruler:" + name, "layout": "vertical", "gap": 4,
        "width": 120, "height": "hug_contents"}))
    ops.append(op_insert(b + "s", "@" + b, {
        "type": "frame", "name": "标尺 " + name, "width": 40, "height": max(v, 4),
        "cornerRadius": 2, "fill": "#EEF2FF",
        "strokes": [{"type": "SOLID", "color": BLUE, "opacity": 1, "visible": True, "blendMode": "NORMAL"}],
        "strokeWeight": 1}))
    ops.append(op_insert(b + "x", "@" + b, text_props("标签", "%s · %dpx" % (name, v), 10, FONT, SUB)))
index += chunk_ops(ops, "fill_p1_spacing_")

# --- radius samples: 3 ops each ----------------------------------------------
radii = [(e["name"], e["value"]) for e in entries
         if e["kind"] == "FLOAT" and e["name"].startswith("radius-")]
ops = []
for i, (name, v) in enumerate(radii):
    b = "r%d" % i
    ops.append(op_insert(b, GID["grid:radius"], {
        "type": "frame", "name": "radius:" + name, "layout": "vertical", "gap": 4,
        "width": 120, "height": "hug_contents"}))
    ops.append(op_insert(b + "s", "@" + b, {
        "type": "frame", "name": "圆角 " + name, "width": 56, "height": 56,
        "cornerRadius": v, "fill": "#F2F3F5", "strokes": strokes_op(), "strokeWeight": 1}))
    ops.append(op_insert(b + "x", "@" + b, text_props("标签", "%s · %g" % (name, v), 10, FONT, SUB)))
index += chunk_ops(ops, "fill_p1_radius_")

# --- strings (shadow / motion / font stacks): 3 ops each ---------------------
strings = [e for e in entries if e["kind"] == "STRING"]
ops = []
for i, e in enumerate(strings):
    b = "z%d" % i
    ops.append(op_insert(b, GID["grid:strings"], {
        "type": "frame", "name": "tok:" + e["name"], "layout": "vertical", "gap": 4,
        "padding": 10, "cornerRadius": 6, "fill": "#F8FAFC",
        "width": "fill_container", "height": "hug_contents"}))
    ops.append(op_insert(b + "n", "@" + b, text_props("名称", e["name"], 11, FONT_SB, INK)))
    ops.append(op_insert(b + "v", "@" + b, {
        "type": "text", "name": "值 " + e["name"], "content": e["value"], "fontSize": 10,
        "fontWeight": "400", "fill": "#5C6B82", "fontName": FONT_MONO, "width": "fill_container"}))
index += chunk_ops(ops, "fill_p1_strings_")

# --- component cards: 2 ops each (frame + file-name text) --------------------
for idx, cat in enumerate(categories):
    ops = []
    for j, comp in enumerate(cat["components"]):
        b = "k%d" % j
        ops.append(op_insert(b, GID["grid:cat-%02d" % (idx + 1)], {
            "type": "frame", "name": "card:" + comp[:-4], "layout": "vertical", "gap": 2,
            "padding": 10, "cornerRadius": 6, "fill": "#FFFFFF",
            "strokes": card_strokes(), "strokeWeight": 1, "width": 228, "height": "hug_contents"}))
        ops.append(op_insert(b + "t", "@" + b, {
            "type": "text", "name": "组件名 " + comp[:-4], "content": comp, "fontSize": 12,
            "fontWeight": "400", "fill": INK, "fontName": FONT, "width": "fill_container"}))
    index += chunk_ops(ops, "fill_p2_cat%02d_" % (idx + 1))

with open(os.path.join(OPS, "INDEX.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(index))
print("generated %d fill files" % len(index))
for x in index:
    print(" ", x)
