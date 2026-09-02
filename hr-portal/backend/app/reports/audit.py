from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any
from uuid import uuid4

from fastapi import Request

from app.core.config import settings
from app.core.db import get_session_factory
from app.reports.models import Report
from app.system.models import SystemLog, SystemLogDetail
from app.users.models import User


logger = logging.getLogger(__name__)

ACTION_LABELS = {
    "create": "新建",
    "update": "修改",
    "delete": "删除",
    "view_data": "查看数据",
    "export_csv": "导出 CSV",
    "export_xlsx": "导出 Excel",
    "push": "推送",
    "access_denied": "访问拒绝",
}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _value_fingerprint(value: Any) -> str:
    return hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        _canonical_json(value).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _filter_manifest(filters: list[dict[str, Any]] | None, source: str) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for item in filters or []:
        if not isinstance(item, dict):
            continue
        value = item.get("value")
        manifest.append(
            {
                "source": source,
                "column": item.get("column"),
                "op": item.get("op"),
                "has_value": value not in (None, "", []),
                "value_count": len(value) if isinstance(value, list) else (0 if value is None else 1),
                "value_hmac": _value_fingerprint(value) if value not in (None, "", []) else None,
            }
        )
    return manifest


def _config_field_manifest(config: dict[str, Any]) -> list[dict[str, Any]]:
    settings_by_code = config.get("column_settings") or {}
    fields: list[dict[str, Any]] = []
    for raw in config.get("columns") or []:
        if isinstance(raw, str):
            code = raw
            instance_id = None
            configured_label = None
        elif isinstance(raw, dict):
            code = str(raw.get("source_code") or "")
            instance_id = raw.get("instance_id")
            configured_label = raw.get("label")
        else:
            continue
        setting = settings_by_code.get(instance_id or code, {}) if code else {}
        if setting.get("hidden"):
            continue
        fields.append(
            {
                "code": code,
                "instance_id": instance_id,
                "label": setting.get("display_name") or configured_label or code,
                "is_sensitive": None,
            }
        )
    return fields


def _output_field_manifest(columns: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [
        {
            "code": column.get("code"),
            "label": column.get("label") or column.get("code"),
            "data_type": column.get("data_type"),
            "is_sensitive": bool(column.get("is_sensitive")),
        }
        for column in (columns or [])
        if isinstance(column, dict)
    ]


def build_dimension_merge_diff(
    before_config: dict[str, Any] | None,
    after_config: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    from app.reports.dimension_merge import combination_key

    before_rules = list((before_config or {}).get("dimension_merge_rules") or [])
    after_rules = list((after_config or {}).get("dimension_merge_rules") or [])
    before_by_id = {str(item.get("id")): item for item in before_rules if isinstance(item, dict)}
    after_by_id = {str(item.get("id")): item for item in after_rules if isinstance(item, dict)}
    details: list[dict[str, Any]] = []
    counts = {"rules_added": 0, "rules_removed": 0, "rules_modified": 0, "sources_added": 0, "sources_removed": 0}

    def source_map(rule: dict[str, Any]) -> dict[tuple[tuple[str, str], ...], dict[str, Any]]:
        signature = list(rule.get("dimension_signature") or [])
        result: dict[tuple[tuple[str, str], ...], dict[str, Any]] = {}
        for source in rule.get("sources") or []:
            values = dict((source or {}).get("values") or {})
            result[combination_key(values, signature)] = values
        return result

    all_ids = list(dict.fromkeys([*before_by_id, *after_by_id]))
    for rule_id in all_ids:
        before = before_by_id.get(rule_id)
        after = after_by_id.get(rule_id)
        if before is None and after is not None:
            counts["rules_added"] += 1
            sources = source_map(after)
            counts["sources_added"] += len(sources)
            for values in sources.values():
                details.append({"change_type": "rule_added", "rule_id": rule_id, "rule_name": after.get("name"), "source": values, "target": (after.get("target") or {}).get("values") or {}})
            continue
        if before is not None and after is None:
            counts["rules_removed"] += 1
            sources = source_map(before)
            counts["sources_removed"] += len(sources)
            for values in sources.values():
                details.append({"change_type": "rule_removed", "rule_id": rule_id, "rule_name": before.get("name"), "source": values, "target": (before.get("target") or {}).get("values") or {}})
            continue
        if before is None or after is None:
            continue
        before_sources = source_map(before)
        after_sources = source_map(after)
        changed = False
        for key in after_sources.keys() - before_sources.keys():
            counts["sources_added"] += 1
            changed = True
            details.append({"change_type": "source_added", "rule_id": rule_id, "rule_name": after.get("name"), "source": after_sources[key], "target": (after.get("target") or {}).get("values") or {}})
        for key in before_sources.keys() - after_sources.keys():
            counts["sources_removed"] += 1
            changed = True
            details.append({"change_type": "source_removed", "rule_id": rule_id, "rule_name": before.get("name"), "source": before_sources[key], "target": (before.get("target") or {}).get("values") or {}})
        before_target = (before.get("target") or {}).get("values") or {}
        after_target = (after.get("target") or {}).get("values") or {}
        if _canonical_json(before_target) != _canonical_json(after_target):
            changed = True
            details.append({"change_type": "target_changed", "rule_id": rule_id, "rule_name": after.get("name"), "before_target": before_target, "after_target": after_target})
        if before.get("name") != after.get("name"):
            changed = True
            details.append({"change_type": "rule_renamed", "rule_id": rule_id, "before_name": before.get("name"), "after_name": after.get("name")})
        if changed:
            counts["rules_modified"] += 1

    summary = {
        **counts,
        "detail_count": len(details),
        "before_hash": _sha256(before_rules),
        "after_hash": _sha256(after_rules),
    }
    return summary, details


def _protect_diff_value(value: Any, sensitive: bool) -> Any:
    if sensitive:
        return {"display": "******", "value_hmac": _value_fingerprint(value)}
    return value


def protect_dimension_merge_details(
    details: list[dict[str, Any]],
    sensitive_by_instance: dict[str, bool],
) -> list[dict[str, Any]]:
    protected: list[dict[str, Any]] = []
    value_keys = {"source", "target", "before_target", "after_target"}
    for detail in details:
        item = dict(detail)
        for key in value_keys:
            values = item.get(key)
            if isinstance(values, dict):
                item[key] = {
                    field: _protect_diff_value(value, sensitive_by_instance.get(field, False))
                    for field, value in values.items()
                }
        protected.append(item)
    return protected


def report_snapshot(report: Report) -> dict[str, Any]:
    config = report.config or {}
    return {
        "id": report.id,
        "name": report.name,
        "dataset_id": report.dataset_id,
        "owner_id": report.owner_id,
        "visibility": report.visibility,
        "scope_strategy": report.scope_strategy,
        "config_hash": _value_fingerprint(config),
        "configured_fields": _config_field_manifest(config),
        "configured_filters": _filter_manifest(config.get("filters"), "configured"),
    }


def build_report_audit_event(
    *,
    action: str,
    status: str,
    user: User,
    report: Report | None = None,
    report_data: dict[str, Any] | None = None,
    request: Request | None = None,
    columns: list[dict[str, Any]] | None = None,
    runtime_filters: list[dict[str, Any]] | None = None,
    row_count: int | None = None,
    page: int | None = None,
    page_size: int | None = None,
    export_format: str | None = None,
    target_count: int | None = None,
    targets: list[dict[str, Any]] | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    snapshot = report_data or (report_snapshot(report) if report is not None else {})
    fields = _output_field_manifest(columns) or snapshot.get("configured_fields", [])
    filters = [
        *snapshot.get("configured_filters", []),
        *_filter_manifest(runtime_filters, "runtime"),
    ]
    forwarded_for = request.headers.get("x-forwarded-for") if request else None
    client_ip = (
        forwarded_for.split(",", 1)[0].strip()
        if forwarded_for
        else (request.client.host if request and request.client else None)
    )
    trace_id = (
        request.headers.get("x-trace-id") or request.headers.get("x-request-id")
        if request
        else None
    ) or uuid4().hex
    content = {
        "fields": fields,
        "field_count": len(fields),
        "sensitive_field_count": sum(1 for field in fields if field.get("is_sensitive")),
        "filters": filters,
        "row_count": row_count,
        "page": page,
        "page_size": page_size,
        "format": export_format,
        "target_count": target_count,
        "targets": [
            {
                "id": target.get("id"),
                "name": target.get("name"),
                "ok": bool(target.get("ok")),
                "rows": int(target.get("rows") or 0),
            }
            for target in (targets or [])
        ],
    }
    metadata = {
        "schema_version": 1,
        "actor": {
            "user_id": user.id,
            "login_name": user.login_name,
            "display_name": user.display_name,
        },
        "report": snapshot,
        "content": content,
        "client": {
            "ip": client_ip,
            "user_agent": (request.headers.get("user-agent", "")[:512] if request else ""),
        },
    }
    report_name = snapshot.get("name") or f"报表#{snapshot.get('id', '未知')}"
    action_label = ACTION_LABELS.get(action, action)
    response_parts = [f"{len(fields)} 个字段"]
    if row_count is not None:
        response_parts.append(f"{row_count} 行")
    if export_format:
        response_parts.append(export_format.upper())
    return {
        "category": "report_access",
        "action": action,
        "status": status,
        "user_id": user.id,
        "request_summary": f"{action_label}报表「{report_name}」",
        "response_summary": "，".join(response_parts),
        "input_hash": snapshot.get("config_hash"),
        "output_hash": _sha256(content) if fields or row_count is not None else None,
        "metadata_json": metadata,
        "error": error[:1000] if error else None,
        "trace_id": trace_id,
    }


async def _dimension_sensitivity(report: Report | None, config: dict[str, Any], db: Any) -> dict[str, bool]:
    if report is None or report.dataset_id is None:
        return {}
    from sqlalchemy import select
    from app.data.models import TableColumn
    from app.datasets.models import DataSetTable

    dataset_tables = (
        await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == report.dataset_id))
    ).scalars().all()
    table_by_alias = {item.alias: item.table_name for item in dataset_tables}
    table_names = list(set(table_by_alias.values()))
    columns = (
        await db.execute(select(TableColumn).where(TableColumn.table_name.in_(table_names)))
    ).scalars().all() if table_names else []
    sensitive = {(item.table_name, item.column_code): bool(item.is_sensitive) for item in columns}
    result: dict[str, bool] = {}
    for raw in config.get("columns") or []:
        if isinstance(raw, str):
            source = instance_id = raw
        elif isinstance(raw, dict):
            source = str(raw.get("source_code") or "")
            instance_id = str(raw.get("instance_id") or source)
        else:
            continue
        if source.startswith("calc."):
            result[instance_id] = True
        elif "." in source:
            alias, code = source.split(".", 1)
            result[instance_id] = sensitive.get((table_by_alias.get(alias, ""), code), False)
    return result


async def record_report_audit(**kwargs: Any) -> None:
    previous_config = kwargs.pop("previous_config", None)
    try:
        event = build_report_audit_event(**kwargs)
        report = kwargs.get("report")
        after_config = dict((report.config or {}) if report is not None else {})
        summary: dict[str, Any] | None = None
        details: list[dict[str, Any]] = []
        if previous_config is not None:
            summary, details = build_dimension_merge_diff(previous_config, after_config)
            if summary["detail_count"]:
                event["metadata_json"]["change_module"] = "dimension_merge"
                event["metadata_json"]["dimension_merge_diff"] = summary
                event["input_hash"] = summary["before_hash"]
                event["output_hash"] = summary["after_hash"]
        async with get_session_factory()() as audit_db:
            if details:
                sensitivity = await _dimension_sensitivity(report, after_config, audit_db)
                details = protect_dimension_merge_details(details, sensitivity)
            log = SystemLog(**event)
            audit_db.add(log)
            await audit_db.flush()
            for sequence, payload in enumerate(details):
                audit_db.add(SystemLogDetail(
                    system_log_id=log.id,
                    detail_type="report_dimension_merge_diff",
                    sequence=sequence,
                    payload_json=payload,
                ))
            await audit_db.commit()
    except Exception:
        logger.exception("写入报表访问审计失败 action=%s", kwargs.get("action"))
