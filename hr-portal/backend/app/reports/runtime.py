from __future__ import annotations

from typing import Any

from app.reports.config import ReportConfig

def normalize_runtime_filters(raw_filters: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_filters or []:
        if not isinstance(item, dict) or not item.get("column"):
            continue
        next_filter = dict(item)
        op = next_filter.get("op") or "eq"
        value = next_filter.get("value")
        if op in {"is_null", "is_not_null"}:
            value = None
        elif op in {"between", "in"} and isinstance(value, str):
            value = [part.strip() for part in value.split(",") if part.strip()]
        next_filter["op"] = op
        next_filter["value"] = value
        normalized.append(next_filter)
    return normalized


def validate_runtime_filters(config: ReportConfig, raw_filters: list[dict[str, Any]] | None) -> None:
    runtime_filters = normalize_runtime_filters(raw_filters)
    if not runtime_filters:
        return
    data = config.model_dump()
    data['filters'] = [*data['filters'], *runtime_filters]
    from app.reports.validation import ensure_valid_report_config
    ensure_valid_report_config(ReportConfig(**data))

def apply_runtime_overrides(
    cfg: ReportConfig, raw_filters: list[dict[str, Any]] | None
) -> ReportConfig:
    runtime_filters = normalize_runtime_filters(raw_filters)
    if not runtime_filters:
        return cfg

    base = [item.model_dump() for item in cfg.filters]
    used: set[int] = set()
    for runtime_filter in runtime_filters:
        replaced = False
        raw_index = runtime_filter.get("__index")
        if isinstance(raw_index, int) and 0 <= raw_index < len(base):
            existing = base[raw_index]
            if existing.get("visible", True) and not existing.get("locked", False):
                base[raw_index] = {
                    **existing,
                    "op": runtime_filter.get("op", existing.get("op", "eq")),
                    "value": runtime_filter.get("value"),
                }
                used.add(raw_index)
                replaced = True
        if replaced:
            continue
        for index, existing in enumerate(base):
            if index in used:
                continue
            if existing.get("column") != runtime_filter.get("column"):
                continue
            if not existing.get("visible", True) or existing.get("locked", False):
                continue
            base[index] = {
                **existing,
                "op": runtime_filter.get("op", existing.get("op", "eq")),
                "value": runtime_filter.get("value"),
            }
            used.add(index)
            break

    data = cfg.model_dump()
    data["filters"] = base
    return ReportConfig(**data)
