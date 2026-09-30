# -*- coding: utf-8 -*-
"""Inventory: color groups, alias/rgba tokens with resolved values, category sizes."""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PAY = os.path.join(BASE, "payloads")

with open(os.path.join(PAY, "token_entries.json"), encoding="utf-8") as f:
    entries = json.load(f)
with open(os.path.join(PAY, "components_grouped.json"), encoding="utf-8") as f:
    categories = json.load(f)


def color_group(section):
    if section.startswith("Semantic"):
        return "colors-semantic"
    if (section.startswith("Performance shared") or section.startswith("Shared button")
            or section.startswith("Shared field") or section.startswith("Shared container")):
        return "colors-perf"
    return "colors-base"


groups = {"colors-base": [], "colors-semantic": [], "colors-perf": []}
for e in entries:
    if e["kind"] == "COLOR":
        groups[color_group(e["section"])].append(e)

for key, lst in groups.items():
    print("== %s: %d tokens" % (key, len(lst)))
    for i, e in enumerate(lst):
        mark = ""
        if e["raw"].startswith("var("):
            mark = "  <-- ALIAS"
        elif "rgba" in e["raw"]:
            mark = "  <-- RGBA"
        if mark or key == "colors-base":
            print("  s%-3d %-42s raw=%-32s resolved=%s%s" % (i, e["name"], e["raw"], e.get("resolved"), mark))

print()
print("== FLOAT kinds:", sum(1 for e in entries if e["kind"] == "FLOAT"),
      " STRING:", sum(1 for e in entries if e["kind"] == "STRING"))
sp = sorted([(e["name"], e["value"]) for e in entries
             if e["kind"] == "FLOAT" and e["name"].startswith("spacing-")], key=lambda x: x[1])
print("== spacing tokens:", len(sp), [n for n, _ in sp])
rd = [(e["name"], e["value"]) for e in entries if e["kind"] == "FLOAT" and e["name"].startswith("radius-")]
print("== radius tokens:", len(rd), [n for n, _ in rd])
fs = [e["name"] for e in entries if e["kind"] == "FLOAT" and e["name"].startswith("font-size-")]
print("== font-size tokens:", len(fs), fs)

print()
print("== component categories:")
total = 0
for idx, cat in enumerate(categories):
    n = len(cat["components"])
    total += n
    print("  cat-%02d %-30s %d comps (ops=%d)" % (idx + 1, cat.get("category", cat.get("name", "?")), n, n * 2))
print("  TOTAL comps:", total)

# sample entry structure
print()
print("== entry keys:", list(entries[0].keys()))
for e in entries:
    if e["kind"] == "COLOR" and e["raw"].startswith("var("):
        print("== sample alias entry:", json.dumps(e, ensure_ascii=False))
        break
for e in entries:
    if e["kind"] == "COLOR" and "rgba" in e["raw"]:
        print("== sample rgba entry:", json.dumps(e, ensure_ascii=False))
        break
