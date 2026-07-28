"""Catalog of internal events that may start a UCP pipeline."""
from __future__ import annotations

from typing import Any


PLATFORM_EVENT_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "category": "DATA_CHANGE",
        "category_name": "数据变更",
        "source": "DATA_WAREHOUSE",
        "source_name": "数据仓库",
        "event_type": "datasource_sync_completed",
        "event_name": "入仓同步完成",
        "description": "入仓来源完成一次同步后发布，可按同步状态和目标表过滤。",
        "filter_fields": ["table_name", "sync_status"],
        "enabled": True,
    },
    {
        "category": "DATA_CHANGE",
        "category_name": "数据变更",
        "source": "DATA_WAREHOUSE",
        "source_name": "数据仓库",
        "event_type": "ods_table_data_changed",
        "event_name": "入仓数据变更",
        "description": "ODS 表完成写入或替换后发布，可按目标表和变更类型过滤。",
        "filter_fields": ["table_name", "change_type", "affected_row_count"],
        "enabled": True,
    },
)


def list_platform_events() -> list[dict[str, Any]]:
    return [dict(item) for item in PLATFORM_EVENT_CATALOG]


def get_platform_event(event_type: str | None) -> dict[str, Any] | None:
    return next((dict(item) for item in PLATFORM_EVENT_CATALOG if item["event_type"] == event_type), None)


def validate_platform_filter(event_type: str, filter_rule: dict[str, Any]) -> None:
    if not filter_rule:
        return
    item = get_platform_event(event_type)
    if item is None:
        raise ValueError("Platform event type is unavailable")
    path = str(filter_rule.get("path") or "")
    field = path[2:] if path.startswith("$.") else path
    if field not in item["filter_fields"]:
        raise ValueError("Filter field is unavailable for the selected platform event")
    if str(filter_rule.get("op") or "eq").lower() not in {"eq", "ne", "in", "contains", "exists"}:
        raise ValueError("Filter operator is unavailable")
