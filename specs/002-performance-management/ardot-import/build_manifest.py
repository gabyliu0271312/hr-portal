# -*- coding: utf-8 -*-
"""Reverse-organize hr-portal performance design tokens + components into
structured JSON manifests ready to be written into an Ardot canvas via MCP."""
import json, re, os
from pathlib import Path

FRONTEND = Path(r"D:\AI项目\HR提效工具搭建\hr-portal\frontend")
SRC_TOKENS = FRONTEND / "src" / "styles" / "tokens.css"
COMP_DIR = FRONTEND / "src" / "components" / "performance"
OUT_DIR = Path(r"D:\AI项目\HR提效工具搭建\specs\002-performance-management\ardot-import")
OUT_DIR.mkdir(parents=True, exist_ok=True)

css = SRC_TOKENS.read_text(encoding="utf-8")

# ---- parse tokens.css preserving section comments ----
section_re = re.compile(r"/\*\s*(.+?)\s*\*/")
lines = css.splitlines()
tokens = []  # (section, name, value)
current = "其他"
for ln in lines:
    s = section_re.search(ln)
    if s:
        current = s.group(1).strip()
        continue
    m = re.match(r"\s*(--[a-zA-Z0-9-]+)\s*:\s*(.+?);", ln)
    if m:
        tokens.append((current, m.group(1), m.group(2).strip()))

def layer_of(name: str) -> str:
    if name.startswith("--performance-"):
        return "component"
    if re.match(r"--(color-surface|color-line|color-action|color-text-(danger|warning)-strong)", name):
        return "semantic"
    return "base"

groups = {}
for sec, name, val in tokens:
    g = groups.setdefault(sec, [])
    g.append({"name": name, "value": val, "layer": layer_of(name)})

color_like = re.compile(r"^#|rgba?\(|var\(")
token_summary = {
    "source": "hr-portal/frontend/src/styles/tokens.css",
    "total": len(tokens),
    "sections": [
        {"section": k, "count": len(v),
         "tokens": v}
        for k, v in groups.items()
    ],
    # flattened quick-view palettes for canvas color swatches
    "colors": [
        {"name": n, "value": v} for _, n, v in tokens
        if color_like.match(v) and not n.startswith("--performance-")
    ],
}
(OUT_DIR / "design-tokens.json").write_text(
    json.dumps(token_summary, ensure_ascii=False, indent=2), encoding="utf-8")

# ---- component inventory ----
vue_files = sorted(p.name for p in COMP_DIR.glob("*.vue"))

CATEGORY_RULES = [
    ("图标", lambda n: "Icon" in n or n in {"PerformanceBrand.vue"}),
    ("评估题", lambda n: n.startswith("ReviewQuestion") or n.startswith("TagFillQuestion")),
    ("评估规则与评分", lambda n: any(k in n for k in [
        "ReviewRule", "ReviewType", "Score", "Level", "Rating", "Interval",
        "RuleSelect", "Calibration", "Bounds", "Mapping"])),
    ("流程与执行人", lambda n: any(k in n for k in [
        "Workflow", "Executor", "StepFlow", "FlowSettings"])),
    ("工作台与任务", lambda n: any(k in n for k in [
        "Workbench", "Task", "SelfSummary", "Timeline", "PersonHeader",
        "SubjectVisibility", "Reminder"])),
    ("项目与周期", lambda n: n.startswith("Project")),
    ("统计报表", lambda n: any(k in n for k in [
        "Report", "Comparison", "Matrix", "Statistics", "Distribution",
        "Navigation", "Completion"])),
    ("权限与授权", lambda n: any(k in n for k in [
        "Permission", "Hrbp", "Authorization", "Scope", "Lock"])),
    ("内容与模板", lambda n: any(k in n for k in [
        "Template", "Content", "Renderer", "RichText", "Section", "Layer",
        "Repeatable", "Reference", "Block"])),
    ("表格与列表", lambda n: any(k in n for k in [
        "Table", "ListPage", "ListToolbar", "SortableList", "SortHeader",
        "Pagination", "Summary", "ColumnVisibility"])),
    ("弹层与容器", lambda n: any(k in n for k in [
        "Dialog", "Modal", "Drawer", "FullScreen", "Prompt", "Overlay",
        "Popover", "Notice", "Shell", "Surface", "Card", "ActionBar",
        "FixedActionBar", "OperateBar", "Header", "Footer", "Title", "Brand"])),
    ("基础表单控件", lambda n: any(k in n for k in [
        "Button", "Checkbox", "Switch", "TextField", "Textarea", "NumberInput",
        "RadioGroup", "Select", "MultiSelect", "SearchInput", "DateTimeField",
        "SegmentedControl", "RequiredLabel", "FormField", "FormItem",
        "DragHandle", "Field", "Input"])),
    ("颜色与选择器", lambda n: any(k in n for k in ["ColorPicker", "TagItemEditor", "Organization", "Member"])),
    ("预览", lambda n: "Preview" in n or "Navigator" in n),
]

def categorize(name: str) -> str:
    for cat, rule in CATEGORY_RULES:
        if rule(name):
            return cat
    return "其他业务组件"

comp_by_cat = {}
for f in vue_files:
    comp_by_cat.setdefault(categorize(f), []).append(f)

components_manifest = {
    "source": "hr-portal/frontend/src/components/performance/",
    "total": len(vue_files),
    "categories": [
        {"category": k, "count": len(v), "components": v}
        for k, v in sorted(comp_by_cat.items(), key=lambda kv: -len(kv[1]))
    ],
}
(OUT_DIR / "components.json").write_text(
    json.dumps(components_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"tokens: {len(tokens)} vars in {len(groups)} sections")
print(f"components: {len(vue_files)} .vue files in {len(comp_by_cat)} categories")
for k, v in sorted(comp_by_cat.items(), key=lambda kv: -len(kv[1])):
    print(f"  {k}: {len(v)}")
