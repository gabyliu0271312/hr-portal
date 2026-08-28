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
from app.system.models import SystemLog
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


async def record_report_audit(**kwargs: Any) -> None:
    try:
        event = build_report_audit_event(**kwargs)
        async with get_session_factory()() as audit_db:
            audit_db.add(SystemLog(**event))
            await audit_db.commit()
    except Exception:
        logger.exception("写入报表访问审计失败 action=%s", kwargs.get("action"))
