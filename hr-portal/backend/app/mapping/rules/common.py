"""Shared pure helpers for Mapping rule plugins."""

from __future__ import annotations

from datetime import datetime
import re
from typing import Any

from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.regex_safety import validate_safe_pattern


_ALLOWED_TARGET_TYPES = {"string", "number", "integer", "boolean", "date"}
_ALLOWED_FORMAT_TYPES = {
    "date", "datetime", "lower", "upper", "trim", "pad", "truncate", "regex",
    "unit_convert", "yyyy_mm_to_yyyymm",
}


def convert_type(value: Any, target_type: str) -> Any:
    if value is None:
        return None
    if target_type == "string":
        return str(value)
    if target_type == "number":
        return float(value)
    if target_type == "integer":
        return int(float(value))
    if target_type == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("true", "1", "yes")
    if target_type == "date":
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(str(value), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        raise ValueError(f"无法解析日期: {value}")
    raise ValueError(f"不支持的类型: {target_type}")


def format_value(value: Any, format_type: str, options: dict[str, Any]) -> Any:
    if value is None:
        return None
    if format_type == "trim":
        return str(value).strip()
    if format_type == "lower":
        return str(value).lower()
    if format_type == "upper":
        return str(value).upper()
    if format_type == "pad":
        value = str(value)
        length = options.get("length", 10)
        pad_char = options.get("pad_char", "0")
        return value.rjust(length, pad_char) if options.get("side", "left") == "left" else value.ljust(length, pad_char)
    if format_type == "truncate":
        return str(value)[:options.get("max_length", 50)]
    if format_type in {"date", "datetime"}:
        defaults = {
            "date": ("%Y-%m-%d", "%Y-%m-%d"),
            "datetime": ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"),
        }
        from_fmt, to_fmt = defaults[format_type]
        return datetime.strptime(str(value), options.get("from_format", from_fmt)).strftime(options.get("to_format", to_fmt))
    if format_type == "yyyy_mm_to_yyyymm":
        parts = str(value).split("-")
        return f"{parts[0]}{int(parts[1]):02d}" if len(parts) == 2 else str(value).replace("-", "")
    if format_type == "unit_convert":
        return round(float(value) * float(options.get("multiplier", 1)), options.get("decimal_places", 2))
    if format_type == "regex":
        return re.sub(validate_safe_pattern(options.get("pattern", "")), options.get("replacement", ""), str(value))
    raise ValueError(f"不支持的格式类型: {format_type}")


def build_reference_key(match_rule: Any, source_value: Any) -> tuple[str, ...]:
    parts = [str(source_value)]
    for _, value in (match_rule.conditions or {}).items():
        parts.insert(0, str(value))
    return tuple(parts)
