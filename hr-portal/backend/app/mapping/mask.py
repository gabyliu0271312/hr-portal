"""脱敏工具

敏感字段的 trace.before/after 必须脱敏。
"""

from __future__ import annotations

from typing import Any


def mask_value(value: Any) -> Any:
    """对敏感值进行脱敏"""
    if value is None:
        return None
    if isinstance(value, str):
        if len(value) <= 2:
            return "*" * len(value)
        return value[0] + "*" * (len(value) - 2) + value[-1]
    if isinstance(value, (int, float)):
        return "***"
    if isinstance(value, (list, tuple)):
        return [mask_value(v) for v in value]
    if isinstance(value, dict):
        return {k: mask_value(v) for k, v in value.items()}
    return "***"
