from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from app.reports.config import DimensionMergeRule, ReportConfig

NUMERIC_TYPES = {"integer", "number", "decimal", "float", "double", "numeric"}
DATE_TYPES = {"date"}
DATETIME_TYPES = {"datetime", "timestamp", "timestamptz"}
BOOLEAN_TYPES = {"boolean", "bool"}


def normalize_typed_value(value: Any, data_type: str | None = None) -> tuple[str, str]:
    if value is None:
        return ("null", "")
    kind = (data_type or "").lower()
    if kind in BOOLEAN_TYPES or isinstance(value, bool):
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes"}:
                value = True
            elif lowered in {"false", "0", "no"}:
                value = False
        if isinstance(value, bool):
            return ("boolean", "1" if value else "0")
    if kind in NUMERIC_TYPES or (isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)):
        try:
            number = Decimal(str(value))
            if not number.is_finite():
                raise InvalidOperation
            normalized = format(number.normalize(), "f")
            if "." in normalized:
                normalized = normalized.rstrip("0").rstrip(".")
            return ("number", normalized or "0")
        except (InvalidOperation, TypeError, ValueError):
            pass
    if kind in DATE_TYPES:
        try:
            parsed = value if isinstance(value, date) and not isinstance(value, datetime) else date.fromisoformat(str(value))
            return ("date", parsed.isoformat())
        except (TypeError, ValueError):
            pass
    if kind in DATETIME_TYPES:
        try:
            parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return ("datetime", parsed.isoformat())
        except (TypeError, ValueError):
            pass
    if isinstance(value, str):
        return ("string", value)
    return (type(value).__name__, json.dumps(value, ensure_ascii=False, sort_keys=True, default=str))


def combination_key(
    values: dict[str, Any],
    signature: Iterable[str],
    data_types: dict[str, str] | None = None,
) -> tuple[tuple[str, str], ...]:
    types = data_types or {}
    return tuple(normalize_typed_value(values.get(field), types.get(field)) for field in signature)


def compile_dimension_merge_map(
    rules: Iterable[DimensionMergeRule | dict[str, Any]],
    data_types: dict[str, str] | None = None,
) -> tuple[list[str], dict[tuple[tuple[str, str], ...], dict[str, Any]]]:
    parsed = [rule if isinstance(rule, DimensionMergeRule) else DimensionMergeRule(**rule) for rule in rules]
    if not parsed:
        return [], {}
    signature = list(parsed[0].dimension_signature)
    mapping: dict[tuple[tuple[str, str], ...], dict[str, Any]] = {}
    for rule in parsed:
        for source in rule.sources:
            mapping[combination_key(source.values, signature, data_types)] = dict(rule.target.values)
    return signature, mapping


def apply_dimension_merge(
    rows: list[dict[str, Any]],
    rules: Iterable[DimensionMergeRule | dict[str, Any]],
    data_types: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    signature, mapping = compile_dimension_merge_map(rules, data_types)
    if not mapping:
        return rows
    result: list[dict[str, Any]] = []
    for row in rows:
        target = mapping.get(combination_key(row, signature, data_types))
        if target is None:
            result.append(row)
            continue
        merged = dict(row)
        merged.update(target)
        result.append(merged)
    return result


def partition_dimension_filters(
    filters: list[dict[str, Any]] | None,
    dimension_signature: Iterable[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    dimensions = set(dimension_signature)
    before: list[dict[str, Any]] = []
    after: list[dict[str, Any]] = []
    for item in filters or []:
        (after if item.get("column") in dimensions else before).append(item)
    return before, after


def validate_dimension_merge_target_types(
    rules: Iterable[DimensionMergeRule | dict[str, Any]],
    data_types: dict[str, str],
) -> None:
    errors: list[dict[str, Any]] = []
    parsed = [rule if isinstance(rule, DimensionMergeRule) else DimensionMergeRule(**rule) for rule in rules]
    for rule in parsed:
        for field in rule.dimension_signature:
            value = rule.target.values.get(field)
            mode = rule.target.modes.get(field)
            source_values = [source.values.get(field) for source in rule.sources]
            kind = (data_types.get(field) or "string").lower()
            valid = True
            if mode == "custom":
                if value is None or (isinstance(value, str) and not value.strip()):
                    valid = False
                elif kind in NUMERIC_TYPES:
                    try:
                        valid = Decimal(str(value)).is_finite() and not isinstance(value, bool)
                    except (InvalidOperation, TypeError, ValueError):
                        valid = False
                elif kind in DATE_TYPES:
                    try:
                        date.fromisoformat(str(value))
                    except (TypeError, ValueError):
                        valid = False
                elif kind in DATETIME_TYPES:
                    try:
                        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                    except (TypeError, ValueError):
                        valid = False
                elif kind in BOOLEAN_TYPES:
                    valid = isinstance(value, bool)
                elif not isinstance(value, str):
                    valid = False
            elif mode == "source":
                valid = any(
                    normalize_typed_value(value, kind) == normalize_typed_value(item, kind)
                    for item in source_values
                )
            elif mode == "auto":
                normalized = {normalize_typed_value(item, kind) for item in source_values}
                valid = len(normalized) == 1 and normalize_typed_value(value, kind) in normalized
            if not valid:
                errors.append({
                    "code": "DIMENSION_MERGE_TARGET_TYPE_INVALID",
                    "rule_id": rule.id,
                    "field": field,
                    "message": f"归并结果字段 {field} 的值或处理方式无效",
                })
    if errors:
        raise ValueError(json.dumps({"code": "DIMENSION_MERGE_INVALID", "errors": errors}, ensure_ascii=False))


def validate_dimension_merge_structure(config: ReportConfig) -> None:
    rules = list(config.dimension_merge_rules)
    if not rules:
        return
    errors: list[dict[str, Any]] = []
    if not config.aggregate:
        errors.append({"code": "DIMENSION_MERGE_REQUIRES_AGGREGATE", "message": "维度归并仅适用于汇总表"})
    transpose = config.transpose or {}
    if bool((transpose.get("column_to_row") or {}).get("enabled")) or bool((transpose.get("row_to_column") or {}).get("enabled")):
        errors.append({
            "code": "DIMENSION_MERGE_STRUCTURAL_RESHAPE_CONFLICT",
            "message": "维度归并不能与列转行或行转列同时启用",
        })

    names: dict[str, str] = {}
    source_owner: dict[tuple[tuple[str, str], ...], str] = {}
    rule_sources: dict[str, set[tuple[tuple[str, str], ...]]] = {}
    rule_targets: dict[str, tuple[tuple[str, str], ...]] = {}
    common_signature = list(rules[0].dimension_signature)

    for rule in rules:
        name_key = rule.name.strip()
        if name_key in names:
            errors.append({
                "code": "DIMENSION_MERGE_RULE_NAME_DUPLICATE",
                "rule_id": rule.id,
                "message": f"归并规则名称重复：{rule.name}",
            })
        names[name_key] = rule.id
        signature = list(rule.dimension_signature)
        if signature != common_signature or len(signature) != len(set(signature)):
            errors.append({
                "code": "DIMENSION_MERGE_SIGNATURE_MISMATCH",
                "rule_id": rule.id,
                "message": "归并规则维度签名不一致或包含重复维度",
            })
        expected = set(signature)
        if set(rule.target.values) != expected or set(rule.target.modes) != expected:
            errors.append({
                "code": "DIMENSION_MERGE_SIGNATURE_MISMATCH",
                "rule_id": rule.id,
                "message": "归并结果必须包含全部维度",
            })
        for field, mode in rule.target.modes.items():
            value = rule.target.values.get(field)
            if mode == "custom" and (value is None or (isinstance(value, str) and not value.strip())):
                errors.append({
                    "code": "DIMENSION_MERGE_TARGET_TYPE_INVALID",
                    "rule_id": rule.id,
                    "field": field,
                    "message": "自定义归并结果不能为空",
                })
        sources: set[tuple[tuple[str, str], ...]] = set()
        for index, source in enumerate(rule.sources):
            if set(source.values) != expected:
                errors.append({
                    "code": "DIMENSION_MERGE_SIGNATURE_MISMATCH",
                    "rule_id": rule.id,
                    "path": f"sources[{index}]",
                    "message": "来源组合必须包含全部维度",
                })
                continue
            key = combination_key(source.values, signature)
            if key in sources or (key in source_owner and source_owner[key] != rule.id):
                errors.append({
                    "code": "DIMENSION_MERGE_SOURCE_DUPLICATE",
                    "rule_id": rule.id,
                    "message": "同一来源组合只能属于一条归并规则",
                })
            sources.add(key)
            source_owner[key] = rule.id
        target_key = combination_key(rule.target.values, signature)
        if len(sources) == 1 and target_key in sources:
            errors.append({
                "code": "DIMENSION_MERGE_NOOP",
                "rule_id": rule.id,
                "message": "单个来源组合与归并结果相同",
            })
        rule_sources[rule.id] = sources
        rule_targets[rule.id] = target_key

    for rule_id, target_key in rule_targets.items():
        owner = source_owner.get(target_key)
        if owner is not None and owner != rule_id:
            errors.append({
                "code": "DIMENSION_MERGE_CHAIN",
                "rule_id": rule_id,
                "message": "归并结果不能再次作为其他规则的来源组合",
            })

    if errors:
        raise ValueError(json.dumps({"code": "DIMENSION_MERGE_INVALID", "errors": errors}, ensure_ascii=False))
