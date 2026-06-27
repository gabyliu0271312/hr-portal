"""消息模板渲染工具

支持 {{变量名}} 语法的模板渲染，缺失变量时保留占位符并记录 warning。
"""
from __future__ import annotations

import re


_VAR_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def render_template(template: str, context: dict) -> tuple[str, list[str]]:
    """渲染模板，返回 (rendered_text, missing_variables)。

    缺失变量时保留原占位符 {{var}}，并记录到 missing_variables。
    """
    missing: list[str] = []

    def replacer(m: re.Match) -> str:
        key = m.group(1)
        val = context.get(key)
        if val is None:
            missing.append(key)
            return m.group(0)  # 保留原占位符
        return str(val)

    rendered = _VAR_PATTERN.sub(replacer, template)
    return rendered, missing
