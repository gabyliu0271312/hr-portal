"""Phase 5-C: 模板变量引擎。

支持请求模板中的变量替换、响应提取（data_path/total_path/cursor_path）、字段映射。
"""
from __future__ import annotations

import copy
import re
from typing import Any

# 变量占位符模式: {{var_name}} 或 {{nested.path}}
VAR_PATTERN = re.compile(r"\{\{([a-zA-Z_][\w.]*)\}\}")


def resolve_variables(template: dict | list | str, context: dict[str, Any]) -> Any:
    """递归替换模板中的 {{var}} 占位符。

    template: 包含 {{var}} 的模板（dict/list/str）
    context: 变量值映射 {"step_id": {...}, "system.now": "2026-07-12", ...}
    """
    if isinstance(template, str):
        return _resolve_string(template, context)
    if isinstance(template, dict):
        return {k: resolve_variables(v, context) for k, v in template.items()}
    if isinstance(template, list):
        return [resolve_variables(item, context) for item in template]
    return template


def _resolve_string(s: str, context: dict[str, Any]) -> Any:
    """解析字符串中的变量。

    如果整个字符串就是一个 {{var}}，返回原始值（保持类型）。
    否则返回替换后的字符串。
    """
    # 检查是否整串就是变量
    full_match = VAR_PATTERN.fullmatch(s)
    if full_match:
        return _get_nested(context, full_match.group(1))

    # 部分替换
    def _replacer(m):
        key = m.group(1)
        val = _get_nested(context, key)
        if val is None:
            return m.group(0)
        return str(val)

    return VAR_PATTERN.sub(_replacer, s)


def _get_nested(data: dict, path: str) -> Any:
    """从嵌套字典中取值，支持点号分隔路径。"""
    keys = path.split(".")
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list):
            try:
                idx = int(key)
                current = current[idx] if 0 <= idx < len(current) else None
            except (ValueError, IndexError):
                return None
        else:
            return None
        if current is None:
            return None
    return current


def extract_response_data(response_body: Any, data_path: str | None) -> Any:
    """从响应体中按 data_path 提取数据列表。

    data_path: "$.data.items" 或 "data.items" 或 None（返回原始响应）
    """
    if data_path is None:
        return response_body
    # 去掉开头的 $.
    path = data_path.lstrip("$").lstrip(".")
    if not path:
        return response_body
    return _get_nested({"root": response_body}, f"root.{path}")


def extract_total(response_body: Any, total_path: str | None) -> int | None:
    """从响应体中按 total_path 提取总数。"""
    if total_path is None:
        return None
    val = extract_response_data(response_body, total_path)
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def extract_next_cursor(response_body: Any, cursor_path: str | None) -> str | None:
    """从响应体中按 cursor_path 提取下一页游标。"""
    if cursor_path is None:
        return None
    val = extract_response_data(response_body, cursor_path)
    return str(val) if val is not None else None


def map_fields(source: dict, mappings: list[dict]) -> dict:
    """按字段映射规则转换数据。

    mappings: [{source: "name", target: "employee_name", transform: "upper"}]
    transform 可选: upper, lower, trim, int, float, bool
    """
    result = {}
    for m in mappings or []:
        src = m.get("source")
        tgt = m.get("target", src)
        tf = m.get("transform")
        val = source.get(src) if src else None
        if val is not None and tf:
            val = _apply_transform(val, tf)
        result[tgt] = val
    return result


def _apply_transform(value: Any, transform: str) -> Any:
    if transform == "upper" and isinstance(value, str):
        return value.upper()
    if transform == "lower" and isinstance(value, str):
        return value.lower()
    if transform == "trim" and isinstance(value, str):
        return value.strip()
    if transform == "int":
        try:
            return int(value)
        except (ValueError, TypeError):
            return value
    if transform == "float":
        try:
            return float(value)
        except (ValueError, TypeError):
            return value
    if transform == "bool":
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes")
        return bool(value)
    return value


def build_system_context() -> dict:
    """构建系统级变量上下文。"""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    return {
        "system": {
            "now": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M:%S"),
            "timestamp_ms": int(now.timestamp() * 1000),
        }
    }
