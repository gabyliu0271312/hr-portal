"""Restricted mapping and validation for inbound warehouse event rows."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import re
from typing import Any


_YM_RE = re.compile(r"^(\d{4})-(\d{1,2})$")


class WarehouseIngestValidationError(ValueError):
    pass


def _transform(value: Any, transform: str) -> Any:
    if transform in ("", "identity"):
        return value
    if transform == "string":
        return "" if value is None else str(value)
    if transform == "trim":
        return "" if value is None else str(value).strip()
    if transform == "yyyy_mm_to_yyyymm":
        match = _YM_RE.fullmatch(str(value or "").strip())
        if not match or not 1 <= int(match.group(2)) <= 12:
            raise WarehouseIngestValidationError("年月必须是 YYYY-MM 格式")
        return f"{match.group(1)}{int(match.group(2)):02d}"
    if transform in {"decimal", "decimal_divide_100"}:
        try:
            result = Decimal(str(value).strip())
        except (InvalidOperation, ValueError, AttributeError) as exc:
            raise WarehouseIngestValidationError("字段必须是有效数值") from exc
        return result / Decimal("100") if transform == "decimal_divide_100" else result
    raise WarehouseIngestValidationError(f"不支持的转换规则: {transform}")


def map_and_validate_rows(rows: list[dict], mapping: list[dict], validations: list[dict]) -> list[dict]:
    if not isinstance(rows, list) or not rows:
        raise WarehouseIngestValidationError("入仓明细不能为空")
    if not isinstance(mapping, list) or not mapping:
        raise WarehouseIngestValidationError("字段映射不能为空")

    target_fields: set[str] = set()
    mapped_rows: list[dict] = []
    for row_index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise WarehouseIngestValidationError(f"第 {row_index} 行必须是对象")
        output: dict = {}
        for rule in mapping:
            if not isinstance(rule, dict):
                raise WarehouseIngestValidationError("字段映射必须是对象")
            source = rule.get("source")
            target = rule.get("target")
            if not isinstance(source, str) or not source or not isinstance(target, str) or not target:
                raise WarehouseIngestValidationError("字段映射必须包含 source 和 target")
            target_fields.add(target)
            value = _transform(row.get(source), str(rule.get("transform") or "identity"))
            if rule.get("required") and value in (None, ""):
                raise WarehouseIngestValidationError(f"第 {row_index} 行字段 {target} 必填")
            if value not in (None, ""):
                minimum = rule.get("minimum")
                maximum = rule.get("maximum")
                if minimum is not None and Decimal(str(value)) < Decimal(str(minimum)):
                    raise WarehouseIngestValidationError(f"第 {row_index} 行字段 {target} 小于最小值")
                if maximum is not None and Decimal(str(value)) > Decimal(str(maximum)):
                    raise WarehouseIngestValidationError(f"第 {row_index} 行字段 {target} 大于最大值")
            output[target] = value
        mapped_rows.append(output)

    for validation in validations or []:
        if validation.get("type") != "group_sum_equals":
            raise WarehouseIngestValidationError("不支持的聚合校验规则")
        group_by = validation.get("group_by")
        sum_field = validation.get("sum_field")
        if not isinstance(group_by, list) or not group_by or not isinstance(sum_field, str) or not sum_field:
            raise WarehouseIngestValidationError("聚合校验配置无效")
        if not set(group_by + [sum_field]).issubset(target_fields):
            raise WarehouseIngestValidationError("聚合校验字段未映射")
        expected = Decimal(str(validation.get("expected")))
        tolerance = Decimal(str(validation.get("tolerance", 0)))
        totals: dict[tuple[str, ...], Decimal] = {}
        for row in mapped_rows:
            key = tuple(str(row.get(field, "")) for field in group_by)
            totals[key] = totals.get(key, Decimal("0")) + Decimal(str(row.get(sum_field)))
        invalid = [key for key, total in totals.items() if abs(total - expected) > tolerance]
        if invalid:
            raise WarehouseIngestValidationError(f"聚合校验失败: {invalid[:50]}")

    return mapped_rows
