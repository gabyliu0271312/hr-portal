# -*- coding: utf-8 -*-
"""ODS→DWD 标准化规则执行引擎

R0104: rename / type_convert / value_map / unit_convert / split_merge 五类结构转换
R0105: deduplicate / null_handling / format_standardize 三类清洗

原则：只写入派生/物化结果，不覆盖 ODS 原始表数据。
"""
import re
from typing import Any, Optional


# ==================== 规则优先级 ====================

RULE_ORDER = {
    "rename": 0,
    "type_convert": 1,
    "value_map": 2,
    "unit_convert": 3,
    "split_merge": 4,
    "deduplicate": 5,        # R0105
    "null_handling": 6,      # R0105
    "format_standardize": 7, # R0105
}


def _rule_order_key(rule) -> int:
    """排序：先按 priority，再按 display_order"""
    return RULE_ORDER.get(rule.rule_type, 99) * 1000 + (rule.display_order or 0)


# ==================== 单行处理器 ====================


def _apply_rename(row: dict, rule, source: str, target: str) -> dict:
    """重命名字段"""
    if source in row and source != target:
        row[target] = row.pop(source)
    return row


def _apply_type_convert(row: dict, rule, source: str, target: str) -> dict:
    """转换字段类型

    rule_config: {"target_type": "int|float|string|bool", "on_error": "set_null|keep|mark"}
    """
    config = rule.rule_config or {}
    target_type = config.get("target_type", "string")
    on_error = config.get("on_error", "set_null")

    value = row.get(source)
    if value is None:
        return row

    try:
        converted = _coerce(value, target_type)
        row[source] = converted
        if target != source:
            row[target] = converted
    except (ValueError, TypeError):
        _handle_type_error(row, source, target, on_error)

    return row


def _coerce(value: Any, target_type: str) -> Any:
    if target_type == "int":
        return int(float(str(value)))
    if target_type == "float":
        return float(value)
    if target_type == "string":
        return str(value)
    if target_type == "bool":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes", "y")
        return bool(value)
    return value


def _handle_type_error(row: dict, source: str, target: str, on_error: str):
    if on_error == "set_null":
        row[source] = None
        if target != source:
            row[target] = None
    elif on_error == "mark":
        row[source] = None
        if target != source:
            row[target] = None
        row[f"{target}_type_error"] = True
    # "keep": 保持原值不变


def _apply_value_map(row: dict, rule, source: str, target: str) -> dict:
    """枚举/值映射

    rule_config: {"mappings": {"A":"在职","B":"离职"}, "unmapped": "keep|set_null|flag"}
    """
    config = rule.rule_config or {}
    mappings = config.get("mappings", {})
    unmapped = config.get("unmapped", "keep")

    value = row.get(source)
    if value is not None:
        key = str(value)
        if key in mappings:
            row[target] = mappings[key]
        elif unmapped == "set_null":
            row[target] = None
        elif unmapped == "flag":
            row[target] = None
            row[f"{target}_unmapped"] = True
        else:
            # "keep"
            row[target] = value
    else:
        row[target] = None

    return row


def _apply_unit_convert(row: dict, rule, source: str, target: str) -> dict:
    """单位转换

    rule_config: {"multiplier": 0.01, "decimal_places": 2}
    """
    config = rule.rule_config or {}
    multiplier = config.get("multiplier", 1.0)
    decimal_places = config.get("decimal_places")

    value = row.get(source)
    if value is not None:
        try:
            converted = float(value) * multiplier
            if decimal_places is not None:
                converted = round(converted, decimal_places)
            row[target] = converted
        except (ValueError, TypeError):
            row[target] = None
    else:
        row[target] = None

    return row


def _apply_split_merge(row: dict, rule, source: str, target: str) -> dict:
    """拆分或合并字段

    split: {"action": "split", "delimiter": ",", "target_fields": ["姓","名"]}
    merge: {"action": "merge", "sources": ["first","last"], "delimiter": ""}
    """
    config = rule.rule_config or {}
    action = config.get("action", "split")

    if action == "split":
        delimiter = config.get("delimiter", ",")
        target_fields = config.get("target_fields", [])
        value = str(row.get(source, ""))
        parts = value.split(delimiter)
        for i, tf in enumerate(target_fields):
            row[tf] = parts[i].strip() if i < len(parts) else None

    elif action == "merge":
        inputs = config.get("sources", [])
        delimiter = config.get("delimiter", "")
        values = [str(row.get(s, "")) for s in inputs]
        row[target] = delimiter.join(values)

    return row


# ==================== R0105: 清洗类规则 ====================


def _apply_deduplicate(rows: list[dict], rule, _src: str, _tgt: str) -> list[dict]:
    """按业务主键/字段组合去重（集合级操作）

    rule_config: {"by": ["emp_id", "period"], "keep": "first|last", "limit": 10000}
    """
    config = rule.rule_config or {}
    by_fields = config.get("by", [])
    keep = config.get("keep", "first")

    if not by_fields:
        return rows

    seen = set()
    result = []
    source = rows if keep == "first" else reversed(rows)

    for row in source:
        key = tuple(str(row.get(f, "")) for f in by_fields)
        if key in seen:
            continue
        seen.add(key)
        result.append(row)

    if keep == "last":
        result.reverse()

    return result


def _apply_null_handling(row: dict, rule, source: str, target: str) -> dict:
    """空值处理

    rule_config:
      {"strategy": "fill_default", "default": "未知"}
      {"strategy": "fill_upstream", "upstream_field": "parent_name"}
      {"strategy": "flag"}
      {"strategy": "drop_row"}  — 由 execute_rules 层处理
    """
    config = rule.rule_config or {}
    strategy = config.get("strategy", "fill_default")

    field = target or source
    value = row.get(field)

    if value is not None and str(value).strip() != "":
        return row

    if strategy == "fill_default":
        row[field] = config.get("default", "")
    elif strategy == "fill_upstream":
        upstream = config.get("upstream_field", "")
        if upstream and upstream in row:
            row[field] = row[upstream]
    elif strategy == "flag":
        row[f"{field}_is_null"] = True

    # "drop_row": handled in execute_rules

    return row


def _apply_format_standardize(row: dict, rule, source: str, target: str) -> dict:
    """格式标准化

    rule_config:
      日期: {"format": "date", "from_format": "yyyyMMdd", "to_format": "yyyy-MM-dd"}
      大小写: {"format": "lower"} / {"format": "upper"}
      空格: {"format": "trim"}
      截断: {"format": "truncate", "max_length": 50}
      填充: {"format": "pad", "length": 10, "pad_char": "0", "side": "left"}
      正则: {"format": "regex", "pattern": "[^0-9]", "replacement": ""}
    """
    config = rule.rule_config or {}
    fmt = config.get("format", "")

    field = target or source
    value = row.get(field)
    if value is None:
        return row

    str_value = str(value)

    if fmt == "date":
        str_value = _format_date(str_value, config)
    elif fmt == "lower":
        str_value = str_value.lower()
    elif fmt == "upper":
        str_value = str_value.upper()
    elif fmt == "trim":
        str_value = str_value.strip()
    elif fmt == "truncate":
        max_len = config.get("max_length", 100)
        str_value = str_value[:max_len]
    elif fmt == "pad":
        length = config.get("length", 10)
        pad_char = config.get("pad_char", "0")
        side = config.get("side", "left")
        if side == "left":
            str_value = str_value.rjust(length, pad_char)
        else:
            str_value = str_value.ljust(length, pad_char)
    elif fmt == "regex":
        pattern = config.get("pattern", "")
        replacement = config.get("replacement", "")
        if pattern:
            str_value = re.sub(pattern, replacement, str_value)

    row[field] = str_value
    if field != target and target:
        row[target] = str_value

    return row


def _format_date(value: str, config: dict) -> str:
    """简单日期格式转换，不依赖外部库。

    支持: yyyyMMdd, yyyy-MM-dd, yyyy/MM/dd, yyyyMM, yyyy, MMdd, dd
    """
    from_format = config.get("from_format", "yyyyMMdd")
    to_format = config.get("to_format", "yyyy-MM-dd")

    # 解析
    parts = _parse_date(value, from_format)
    if parts is None:
        return value

    # 格式化
    y, m, d = parts
    return _build_date(to_format, y, m, d)


def _parse_date(value: str, fmt: str) -> Optional[tuple]:
    """解析日期字符串返回 (year, month, day)，无法解析返回 None"""
    try:
        cleaned = re.sub(r"[^0-9]", "", value.strip())
        if fmt in ("yyyyMMdd", "yyyy-MM-dd", "yyyy/MM/dd"):
            if len(cleaned) >= 8:
                return int(cleaned[:4]), int(cleaned[4:6]), int(cleaned[6:8])
        elif fmt == "yyyyMM":
            if len(cleaned) >= 6:
                return int(cleaned[:4]), int(cleaned[4:6]), 1
        elif fmt == "yyyy":
            if len(cleaned) >= 4:
                return int(cleaned[:4]), 1, 1
        elif fmt == "MMdd":
            if len(cleaned) >= 4:
                return 2000, int(cleaned[:2]), int(cleaned[2:4])
        elif fmt == "dd":
            if len(cleaned) >= 2:
                return 2000, 1, int(cleaned[:2])
    except (ValueError, IndexError):
        pass
    return None


def _build_date(fmt: str, y: int, m: int, d: int) -> str:
    if fmt == "yyyy-MM-dd":
        return f"{y:04d}-{m:02d}-{d:02d}"
    if fmt == "yyyy/MM/dd":
        return f"{y:04d}/{m:02d}/{d:02d}"
    if fmt == "yyyyMMdd":
        return f"{y:04d}{m:02d}{d:02d}"
    if fmt == "yyyyMM":
        return f"{y:04d}{m:02d}"
    if fmt == "yyyy":
        return f"{y:04d}"
    return f"{y:04d}-{m:02d}-{d:02d}"


# ==================== 集合级规则标识 ====================

# 这些规则操作整个行集，不是单行
SET_LEVEL_RULES = {"deduplicate"}


# ==================== 执行器注册 ====================

RULE_EXECUTORS = {
    "rename": _apply_rename,
    "type_convert": _apply_type_convert,
    "value_map": _apply_value_map,
    "unit_convert": _apply_unit_convert,
    "split_merge": _apply_split_merge,
    "deduplicate": _apply_deduplicate,
    "null_handling": _apply_null_handling,
    "format_standardize": _apply_format_standardize,
}


# ==================== 批量执行入口 ====================


def execute_rules(rules: list, rows: list[dict]) -> list[dict]:
    """对 ODS 数据行按顺序应用标准化规则，返回 DWD 结果行。

    - 浅拷贝输入 rows，不修改原始数据（ODS 保护）
    - 按 rule_type 优先级 + display_order 排序
    - 先执行 rename，建立字段名映射；后续规则查找字段时自动解析新名称
    - 集合级规则（deduplicate）在管道中作为过滤步骤执行

    Args:
        rules: StandardizationRule 列表
        rows: ODS 数据行列表（每条是一个 dict）

    Returns:
        DWD 转换后数据行列表
    """
    result = [dict(r) for r in rows]
    if not rules:
        return result

    enabled = sorted(
        [r for r in rules if r.enabled],
        key=_rule_order_key,
    )

    rename_map: dict[str, str] = {}

    for rule in enabled:
        executor = RULE_EXECUTORS.get(rule.rule_type)
        if executor is None:
            continue

        src = rename_map.get(rule.source_field, rule.source_field)
        tgt = rename_map.get(rule.target_field, rule.target_field)

        if rule.rule_type in SET_LEVEL_RULES:
            # 集合级规则：一次性处理整个行集
            result = executor(result, rule, src, tgt)
        elif rule.rule_type == "null_handling" and \
                (rule.rule_config or {}).get("strategy") == "drop_row":
            # 空值丢弃策略
            field = tgt or src
            result = [r for r in result if r.get(field) is not None and str(r.get(field, "")).strip() != ""]
        else:
            for row in result:
                executor(row, rule, src, tgt)

        if rule.rule_type == "rename":
            rename_map[rule.source_field] = rule.target_field

    return result


def execute_single_rule(rule, row: dict) -> dict:
    """对单行数据应用单条规则。用于预览、单步测试等场景。

    不会修改传入的 row。
    """
    r = dict(row)
    executor = RULE_EXECUTORS.get(rule.rule_type)
    if executor and rule.enabled:
        executor(r, rule, rule.source_field, rule.target_field)
    return r
