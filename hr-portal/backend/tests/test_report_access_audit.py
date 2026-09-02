from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException, Request

from app.reports.audit import build_dimension_merge_diff, build_report_audit_event, protect_dimension_merge_details
from app.reports.models import Report
from app.system.models import SystemLog
from app.system import router as system_router
from app.users.models import User


def _user() -> User:
    return User(id=7, login_name="auditor", display_name="审计用户", password_hash="x")


def _report() -> Report:
    return Report(
        id=23,
        name="工资明细",
        dataset_id=5,
        owner_id=7,
        visibility="private",
        scope_strategy="owner_scope",
        config={
            "columns": ["employee_name", "salary"],
            "filters": [{"column": "id_card", "op": "eq", "value": "440101199001011234"}],
            "column_settings": {"salary": {"display_name": "实发工资"}},
        },
    )


def test_report_audit_records_manifest_without_raw_filter_values() -> None:
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/reports/23/run",
            "headers": [(b"user-agent", b"pytest"), (b"x-request-id", b"trace-1")],
            "client": ("127.0.0.1", 1234),
        }
    )
    event = build_report_audit_event(
        action="view_data",
        status="success",
        user=_user(),
        report=_report(),
        request=request,
        columns=[
            {"code": "employee_name", "label": "姓名", "data_type": "string", "is_sensitive": True},
            {"code": "salary", "label": "实发工资", "data_type": "number", "is_sensitive": True},
        ],
        runtime_filters=[{"column": "employee_name", "op": "eq", "value": "张三"}],
        row_count=1,
        page=1,
        page_size=50,
        targets=[{"id": 9, "name": "薪酬归档", "ok": True, "rows": 1, "message": "不应记录"}],
    )

    serialized = json.dumps(event, ensure_ascii=False)
    assert event["category"] == "report_access"
    assert event["trace_id"] == "trace-1"
    assert event["metadata_json"]["content"]["field_count"] == 2
    assert event["metadata_json"]["content"]["sensitive_field_count"] == 2
    assert event["metadata_json"]["content"]["targets"] == [
        {"id": 9, "name": "薪酬归档", "ok": True, "rows": 1}
    ]
    assert "440101199001011234" not in serialized
    assert "张三" not in serialized
    assert "不应记录" not in serialized
    fingerprints = [
        item["value_hmac"] for item in event["metadata_json"]["content"]["filters"]
    ]
    assert all(value and len(value) == 64 for value in fingerprints)


def test_failed_report_audit_does_not_store_raw_runtime_filter() -> None:
    event = build_report_audit_event(
        action="export_csv",
        status="failed",
        user=_user(),
        report=_report(),
        runtime_filters=[{"column": "employee_name", "op": "eq", "value": "李四"}],
        error="导出失败",
    )

    serialized = json.dumps(event, ensure_ascii=False)
    assert event["status"] == "failed"
    assert event["error"] == "导出失败"
    assert "李四" not in serialized
    assert event["metadata_json"]["content"]["filters"][-1]["value_hmac"]


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDb:
    async def scalar(self, _stmt):
        return 1

    async def execute(self, _stmt):
        log = SystemLog(
            id=1,
            category="report_access",
            action="view_data",
            status="success",
            user_id=7,
            request_summary="查看数据报表「工资明细」",
            response_summary="2 个字段，1 行",
            metadata_json={},
            created_at=datetime.now(timezone.utc),
        )
        return _Rows([(log, "审计用户")])


@pytest.mark.asyncio
async def test_system_logs_support_paged_report_access_category(monkeypatch) -> None:
    async def _menus(_user, _db):
        return [{"code": "system.logs.operation"}]

    monkeypatch.setattr(system_router, "get_user_menus", _menus)
    result = await system_router.list_system_logs(
        category="report_access",
        status_filter=None,
        action="view_data",
        operator="审计",
        keyword="工资",
        start_at=None,
        end_at=None,
        paged=True,
        page=1,
        page_size=20,
        limit=100,
        user=_user(),
        db=_FakeDb(),
    )

    assert isinstance(result, system_router.SystemLogPage)
    assert result.total == 1
    assert result.items[0].action == "view_data"


@pytest.mark.asyncio
async def test_unknown_system_log_category_is_rejected() -> None:
    with pytest.raises(HTTPException) as exc:
        await system_router.list_system_logs(
            category="unknown",
            status_filter=None,
            action=None,
            operator=None,
            keyword=None,
            start_at=None,
            end_at=None,
            paged=True,
            page=1,
            page_size=20,
            limit=100,
            user=_user(),
            db=_FakeDb(),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_report_access_category_requires_operation_log_permission(monkeypatch) -> None:
    async def _menus(_user, _db):
        return [{"code": "system.logs.ai"}]

    monkeypatch.setattr(system_router, "get_user_menus", _menus)
    with pytest.raises(HTTPException) as exc:
        await system_router.list_system_logs(
            category="report_access",
            status_filter=None,
            action=None,
            operator=None,
            keyword=None,
            start_at=None,
            end_at=None,
            paged=True,
            page=1,
            page_size=20,
            limit=100,
            user=_user(),
            db=_FakeDb(),
        )
    assert exc.value.status_code == 403


def test_dimension_merge_audit_records_only_changed_sources() -> None:
    before = {
        "dimension_merge_rules": [{
            "id": "r1",
            "name": "规则一",
            "dimension_signature": ["t.a", "t.b"],
            "sources": [{"values": {"t.a": 1, "t.b": "x"}}],
            "target": {"values": {"t.a": 9, "t.b": "z"}, "modes": {"t.a": "custom", "t.b": "custom"}},
        }]
    }
    after = {
        "dimension_merge_rules": [{
            "id": "r1",
            "name": "规则一",
            "dimension_signature": ["t.a", "t.b"],
            "sources": [
                {"values": {"t.a": 1, "t.b": "x"}},
                {"values": {"t.a": 2, "t.b": "y"}},
            ],
            "target": {"values": {"t.a": 9, "t.b": "z"}, "modes": {"t.a": "custom", "t.b": "custom"}},
        }]
    }

    summary, details = build_dimension_merge_diff(before, after)

    assert summary["rules_modified"] == 1
    assert summary["sources_added"] == 1
    assert summary["detail_count"] == 1
    assert details[0]["change_type"] == "source_added"
    assert details[0]["source"] == {"t.a": 2, "t.b": "y"}


def test_dimension_merge_audit_masks_sensitive_values() -> None:
    details = [{
        "change_type": "source_added",
        "source": {"t.employee": "张三", "t.region": "华东"},
        "target": {"t.employee": "李四", "t.region": "华东"},
    }]

    protected = protect_dimension_merge_details(details, {"t.employee": True})
    serialized = json.dumps(protected, ensure_ascii=False)

    assert "张三" not in serialized
    assert "李四" not in serialized
    assert "华东" in serialized
    assert protected[0]["source"]["t.employee"]["value_hmac"]
