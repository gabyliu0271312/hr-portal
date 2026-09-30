# -*- coding: utf-8 -*-
"""Parse design-tokens.json / components.json and generate Ardot apply_variables payloads.

Rules (from ARDOT-WRITE-PLAN.md):
- Values come ONLY from the manifest. No invention.
- var() alias tokens: resolve to terminal base value; keep original semantic name (strip leading --).
- Colors -> COLOR variables ({r,g,b,a} 0..1). px / unitless numbers -> FLOAT.
- Everything else (shadows, font stacks, borders, unresolved refs) -> STRING preserving value.
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "payloads")
os.makedirs(OUT, exist_ok=True)

with open(os.path.join(BASE, "design-tokens.json"), encoding="utf-8") as f:
    tokens_doc = json.load(f)

with open(os.path.join(BASE, "components.json"), encoding="utf-8") as f:
    comp_doc = json.load(f)

# ---- flatten tokens -------------------------------------------------------
flat = []
for sec in tokens_doc["sections"]:
    for t in sec["tokens"]:
        flat.append({
            "section": sec["section"],
            "name": t["name"],
            "value": t["value"],
            "layer": t.get("layer", ""),
        })

lookup = {t["name"]: t["value"] for t in flat}

VAR_RE = re.compile(r"^\s*var\((--[A-Za-z0-9-]+)\)\s*$")


def resolve(value, depth=0):
    m = VAR_RE.match(value)
    if m:
        if depth >= 12:
            return None
        target = m.group(1)
        if target in lookup:
            return resolve(lookup[target], depth + 1)
        return None  # reference target not present in manifest
    return value


def parse_color(v):
    v = v.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3,8})", v)
    if m:
        h = m.group(1)
        if len(h) == 4:  # #RGBA
            h = "".join(c * 2 for c in h)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            a = 255
        elif len(h) == 8:
            r, g, b, a = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16)
        else:
            return None
        return (round(r / 255, 4), round(g / 255, 4), round(b / 255, 4), round(a / 255, 4))
    m = re.fullmatch(r"rgba?\(([^)]+)\)", v)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        if len(parts) in (3, 4):
            def pc(p):
                if p.endswith("%"):
                    return round(float(p[:-1]) / 100, 4)
                return round(float(p) / 255, 4)
            try:
                r, g, b = pc(parts[0]), pc(parts[1]), pc(parts[2])
                a = round(float(parts[3]), 4) if len(parts) == 4 else 1.0
            except ValueError:
                return None
            return (r, g, b, a)
    return None


NUM_RE = re.compile(r"^-?(\d+(?:\.\d+)?)px$")
UNITLESS_RE = re.compile(r"^-?\d+(?:\.\d+)?$")


def parse_number(v):
    v = v.strip()
    m = NUM_RE.match(v)
    if m:
        return float(m.group(1))
    m = UNITLESS_RE.match(v)
    if m:
        return float(m.group(0))
    return None


# ---- classify -------------------------------------------------------------
entries = []
kind_stats = {}
unresolved = []
strings = []

for t in flat:
    raw = t["value"]
    resolved = resolve(raw)
    e = {
        "name": t["name"].lstrip("-"),
        "raw": raw,
        "resolved": resolved,
        "section": t["section"],
        "layer": t["layer"],
    }
    if resolved is None:
        e.update(kind="UNRESOLVED", type="STRING", value=raw)
        unresolved.append(e)
    else:
        c = parse_color(resolved)
        if c:
            e.update(kind="COLOR", type="COLOR", value={"r": c[0], "g": c[1], "b": c[2], "a": c[3]})
        else:
            n = parse_number(resolved)
            if n is not None:
                e.update(kind="FLOAT", type="FLOAT", value=n)
            else:
                e.update(kind="STRING", type="STRING", value=resolved)
                strings.append(e)
    kind_stats[e["kind"]] = kind_stats.get(e["kind"], 0) + 1
    entries.append(e)

# ---- split payloads (keep each apply_variables call moderate) -------------
def payload_for(items):
    return {
        "Performance Tokens": {
            "variables": {
                e["name"]: {"type": e["type"], "value": e["value"]} for e in items
            }
        }
    }

color_items = [e for e in entries if e["kind"] == "COLOR"]
float_items = [e for e in entries if e["kind"] == "FLOAT"]
string_items = [e for e in entries if e["kind"] == "STRING"]

chunks = []
# chunk colors into ~80 per call
CHUNK = 80
for i in range(0, len(color_items), CHUNK):
    chunks.append(("colors_%d" % (i // CHUNK), color_items[i:i + CHUNK]))
if float_items:
    chunks.append(("floats", float_items))
if string_items:
    chunks.append(("strings", string_items))

index = []
for tag, items in chunks:
    p = payload_for(items)
    fn = os.path.join(OUT, "apply_%s.json" % tag)
    with open(fn, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=1)
    index.append({"file": fn, "tag": tag, "count": len(items)})

with open(os.path.join(OUT, "token_entries.json"), "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=1)

with open(os.path.join(OUT, "components_grouped.json"), "w", encoding="utf-8") as f:
    json.dump(comp_doc["categories"], f, ensure_ascii=False, indent=1)

# ---- report ---------------------------------------------------------------
print("TOTAL tokens:", tokens_doc["total"], "flattened:", len(flat))
print("kind stats:", kind_stats)
print("\nsections:")
for sec in tokens_doc["sections"]:
    print("  -", sec["section"], sec["count"])
print("\nUNRESOLVED var() refs:", len(unresolved))
for e in unresolved[:30]:
    print("  !", e["name"], "=", e["raw"])
print("\nSTRING tokens:", len(strings))
for e in strings[:60]:
    print("  ~", e["name"], "=", e["value"])
print("\npayload files:")
for ix in index:
    print("  ", ix["file"], ix["count"])
print("\ncomponent categories:")
for c in comp_doc["categories"]:
    print("  -", c["category"], c["count"], "sum:", sum(len(c["components"]) for c in comp_doc["categories"]))
print("TOTAL components:", comp_doc["total"], "listed:", sum(len(c["components"]) for c in comp_doc["categories"]))
