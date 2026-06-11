from __future__ import annotations

import re

from app.ai_formula.field_refs import extract_field_refs
from app.ai_formula.function_catalog import base_formula_function_codes


FUNC_RE = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\(")
BUILTIN_FUNCTIONS = {"FIELD"} | base_formula_function_codes()


def normalize_formula(formula: str) -> str:
    text = (formula or "").strip()
    if not text:
        return ""
    # 中文引号先统一成英文，用于识别字符串边界
    text = (
        text.replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
        .replace("＂", '"')
    )
    # 其余中文标点归一化，但跳过字符串字面量内部，
    # 避免破坏 FIELD("应发工资（含补偿金）") 这类含全角括号的中文字段名
    punct = {"（": "(", "）": ")", "，": ",", "；": ";", "＝": "=", "＞": ">", "＜": "<"}
    out: list[str] = []
    quote = ""
    for ch in text:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = ""
            continue
        if ch in ('"', "'"):
            quote = ch
            out.append(ch)
        else:
            out.append(punct.get(ch, ch))
    text = "".join(out)
    return text if text.startswith("=") else f"={text}"


def extract_functions(formula: str) -> list[str]:
    seen: list[str] = []
    for raw in FUNC_RE.findall(formula or ""):
        code = raw.upper()
        if code and code not in seen:
            seen.append(code)
    return seen


def extract_formula_meta(formula: str) -> tuple[list[str], list[str]]:
    refs = extract_field_refs(formula)
    funcs = [code for code in extract_functions(formula) if code != "FIELD"]
    return refs, funcs
