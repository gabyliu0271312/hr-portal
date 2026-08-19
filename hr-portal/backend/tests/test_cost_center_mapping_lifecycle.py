"""成本中心 Mapping 周期生命周期的无数据库合同测试。

持久化/API 证据需要在迁移后的 PostgreSQL 环境继续执行；这里先锁定不展开默认映射、
差异分类和请求输入边界，避免公共执行器承担业务生命周期。
"""
from types import SimpleNamespace

import pytest
from sqlalchemy import inspect

from app.mapping.cost_center_models import (
    CostCenterMappingDiff,
    CostCenterMappingException,
    CostCenterMappingNotification,
    CostCenterMappingPeriod,
)
from app.mapping.cost_center_router import (
    ConfirmDiffRequest,
    CopyPeriodRequest,
    ExceptionRequest,
    PeriodSnapshotRequest,
    NotificationResultRequest,
    PublishPeriodRequest,
    RebuildResultRequest,
)
from app.mapping.cost_center_service import (
    REVIEW_REQUIRED,
    build_cost_center_rule_document,
    calculate_cost_center_diffs,
)
from app.mapping.dto import MappingDocumentV1
from app.mapping.executor import MappingExecutor
from app.mapping.policy import build_policy


def test_cost_center_default_identity_is_sparse_and_uses_public_rule_types():
    document = build_cost_center_rule_document(period="202608")
    rules = document["ruleSet"]["rules"]
    identity = next(rule for rule in rules if rule["type"] == "identity_with_overrides")

    assert document["mappingSchemaVersion"] == 1
    assert identity["config"] == {
        "defaultBehavior": "keep_source",
        "overrides": {},
        "unmatched": "keep",
    }
    assert "rows" not in identity["config"]
    assert len(identity["config"]["overrides"]) == 0


@pytest.mark.asyncio
async def test_cost_center_document_uses_generic_identity_with_overrides():
    document_dict = build_cost_center_rule_document(
        period="202608",
        overrides={"CC003": "CC100"},
    )
    rules = document_dict["ruleSet"]["rules"]
    assert len(rules) == 1
    identity = rules[0]
    assert identity["type"] == "identity_with_overrides"
    assert identity["sourceFields"] == ["code"]
    assert identity["targetFields"] == ["code"]
    assert identity["config"]["overrides"] == {"CC003": "CC100"}
    assert "cost_center_tree" not in str(document_dict)
    assert "org_node_code" not in str(document_dict)

    result = await MappingExecutor().execute(
        MappingDocumentV1.from_dict(document_dict),
        [{"code": "CC003", "status": "启用"}, {"code": "CC004", "status": "启用"}],
        reference_snapshot={},
        policy=build_policy(
            "warehouse",
            source_asset_id="cost_center_monthly",
            source_field_ids=["code", "status"],
            target_asset_id="dwd_cost_center_monthly",
            target_field_ids=["code", "status"],
            allowed_reference_datasets=[],
            allowed_reference_fields=[],
        ),
    )

    assert result.errors == []
    assert result.outputRows == [
        {"code": "CC100", "status": "启用"},
        {"code": "CC004", "status": "启用"},
    ]

def test_cost_center_diff_ignores_unchanged_default_codes_and_classifies_changes():
    previous = {
        "CC001": {"name": "财务", "active": True},
        "CC002": {"name": "人力", "active": True},
        "CC003": {"name": "研发", "active": True},
    }
    current = {
        "CC001": {"name": "财务", "active": True},
        "CC002": {"name": "人力资源", "active": True},
        "CC003": {"name": "研发", "active": False},
        "CC004": {"name": "", "active": True},
    }

    diffs = calculate_cost_center_diffs(previous, current)
    by_code = {item["source_code"]: item["diff_type"] for item in diffs}

    assert "CC001" not in by_code
    assert by_code == {"CC002": "changed", "CC003": "inactive", "CC004": "invalid"}


def test_cost_center_review_required_contract_is_stable():
    assert REVIEW_REQUIRED == "review_required"


def test_cost_center_period_models_do_not_store_expanded_default_rows():
    period_columns = {column.name for column in inspect(CostCenterMappingPeriod).columns}
    exception_columns = {column.name for column in inspect(CostCenterMappingException).columns}

    assert "source_snapshot" in period_columns
    assert "source_codes" in period_columns
    assert "overrides" not in period_columns
    assert "source_code" in exception_columns
    assert "target_code" in exception_columns
    assert "mapping_rows" not in exception_columns


def test_cost_center_notification_has_database_idempotency_key():
    constraints = {constraint.name for constraint in CostCenterMappingNotification.__table__.constraints}
    columns = {column.name for column in inspect(CostCenterMappingNotification).columns}
    assert "uq_cost_center_mapping_notification" in constraints
    assert {"retry_count", "next_retry_at", "exhausted_at", "last_error"} <= columns


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_cost_center_notification_is_idempotent_across_two_postgres_workers():
    from asyncio import Event, create_task, gather
    from uuid import uuid4
    from sqlalchemy import delete, func, select, text
    from app.core.db import get_session_factory
    from app.mapping.cost_center_models import CostCenterMappingNotification, CostCenterMappingPeriod
    from app.mapping.models import MappingBinding
    from app.mapping.cost_center_service import CostCenterMappingService

    try:
        async with get_session_factory()() as db:
            await db.execute(select(1))
            exists = await db.scalar(text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'cost_center_mapping_notifications'"
            ))
            if not exists:
                raise AssertionError("PostgreSQL integration requires migration 0198_cost_center_mapping_lifecycle")
    except Exception as exc:
        raise AssertionError(f"PostgreSQL integration database unavailable: {exc}") from exc

    period_value = f"20{uuid4().hex[:4]}"[:6]
    notification_key = f"publish:{uuid4().hex}"
    async with get_session_factory()() as db:
        binding = MappingBinding(
            caller="warehouse", asset_id=f"cc-notify-{uuid4().hex}", binding_key="default",
            version=1, expected_version=1, storage_mode="component_v1",
        )
        db.add(binding)
        await db.flush()
        period = CostCenterMappingPeriod(
            period=period_value, binding_id=binding.id, status="published",
            version=1, expected_version=1,
        )
        db.add(period)
        await db.commit()
        period_id, binding_id = period.id, binding.id

    start = Event()

    async def worker():
        async with get_session_factory()() as db:
            await start.wait()
            result = await CostCenterMappingService(db).ensure_notification(
                period=period_value, notification_key=notification_key, event_id="event-1"
            )
            await db.commit()
            return result

    try:
        tasks = [create_task(worker()) for _ in range(2)]
        start.set()
        results = await gather(*tasks)
        assert results[0]["id"] == results[1]["id"]
        async with get_session_factory()() as db:
            count = await db.scalar(select(func.count()).select_from(CostCenterMappingNotification).where(
                CostCenterMappingNotification.period_id == period_id,
                CostCenterMappingNotification.notification_key == notification_key,
            ))
            assert count == 1
    finally:
        async with get_session_factory()() as db:
            await db.execute(delete(CostCenterMappingNotification).where(
                CostCenterMappingNotification.period_id == period_id
            ))
            await db.execute(delete(CostCenterMappingPeriod).where(CostCenterMappingPeriod.id == period_id))
            await db.execute(delete(MappingBinding).where(MappingBinding.id == binding_id))
            await db.commit()


def test_cost_center_period_separates_publish_rebuild_and_notification_states():
    columns = {column.name for column in inspect(CostCenterMappingPeriod).columns}
    assert {
        "publish_audit_id",
        "rebuild_run_id",
        "rebuild_status",
        "notification_status",
    } <= columns


def test_cost_center_diff_has_confirmation_state():
    columns = {column.name for column in inspect(CostCenterMappingDiff).columns}
    assert {"status", "confirmed_by", "confirmed_at"} <= columns


def test_cost_center_write_requests_forbid_unknown_fields():
    request_types = [
        PeriodSnapshotRequest,
        CopyPeriodRequest,
        ExceptionRequest,
        ConfirmDiffRequest,
        PublishPeriodRequest,
        RebuildResultRequest,
        NotificationResultRequest,
    ]
    assert all(model.model_config.get("extra") == "forbid" for model in request_types)


class _LayerOnlySession:
    def __init__(self):
        self.scalar_calls = 0
        self.execute_calls = 0

    async def scalar(self, _statement):
        self.scalar_calls += 1
        return SimpleNamespace(warehouse_layer="ODS")

    async def execute(self, _statement, _params=None):
        self.execute_calls += 1
        raise AssertionError("成本中心期间门禁失败后不得读取规则、ODS 或执行 DWD DDL/DML")


@pytest.mark.asyncio
async def test_cost_center_execute_without_period_blocks_before_any_dwd_work():
    from app.warehouse.service.standardization import StandardizationRuleService

    session = _LayerOnlySession()
    result = await StandardizationRuleService(session).execute_full(
        asset_code="cost_center_monthly",
    )

    assert result == {
        "error": "review_required",
        "status": "review_required",
        "reason": "cost_center_period_required",
        "detail": "成本中心 DWD 执行必须提供已发布的 YYYYMM 期间",
        "total": 0,
        "success": 0,
        "failed": 0,
        "errors": [],
    }
    assert session.scalar_calls == 1
    assert session.execute_calls == 0


@pytest.mark.asyncio
async def test_cost_center_automation_requires_period_before_opening_work_session(monkeypatch):
    from app.automation import action_registry

    opened_sessions = 0

    def _factory():
        nonlocal opened_sessions
        opened_sessions += 1
        raise AssertionError("缺少成本中心期间时不得打开 DWD 工作会话")

    monkeypatch.setattr("app.core.db.get_session_factory", _factory)
    config = SimpleNamespace(update_mode="cleaning_rule")

    result = await action_registry._execute_dwd_update(
        config,
        "cost_center_monthly",
        object(),
        {},
    )

    assert result["status"] == "review_required"
    assert result["reason"] == "cost_center_period_required"
    assert opened_sessions == 0


@pytest.mark.asyncio
async def test_cost_center_notification_action_reuses_feishu_and_marks_sent(monkeypatch):
    from app.automation import action_registry
    from app.mapping.cost_center_service import CostCenterMappingService

    notification = SimpleNamespace(id=31, status="pending")

    class Session:
        async def get(self, model, notification_id):
            assert model is CostCenterMappingNotification
            assert notification_id == 31
            return notification

    async def send(action_config, event_payload, db, execution_id):
        return {"status": "success", "success_count": 1, "failed_count": 0, "errors": []}

    async def mark_sent(self, *, period, notification_id):
        assert period == "202608"
        assert notification_id == 31
        return {"status": "sent", "id": notification_id}

    monkeypatch.setattr(action_registry, "_action_feishu_send_message", send)
    monkeypatch.setattr(CostCenterMappingService, "mark_notification_sent", mark_sent)
    result = await action_registry._action_cost_center_feishu_send_message(
        {"enabled": True},
        {"period": "202608", "notification_id": 31},
        Session(),
        101,
    )

    assert result["status"] == "success"
    assert result["notification"] == {"status": "sent", "id": 31}


@pytest.mark.asyncio
@pytest.mark.parametrize("delivery_status", ["failed", "partial_success"])
async def test_cost_center_notification_action_marks_failure_for_retry(monkeypatch, delivery_status):
    from app.automation import action_registry
    from app.mapping.cost_center_service import CostCenterMappingService

    notification = SimpleNamespace(id=32, status="retrying")

    class Session:
        async def get(self, model, notification_id):
            return notification

    async def send(action_config, event_payload, db, execution_id):
        return {"status": delivery_status, "success_count": 0, "failed_count": 1, "errors": ["timeout"]}

    async def mark_failed(self, *, period, notification_id, error):
        assert (period, notification_id, error) == ("202608", 32, "timeout")
        return {"status": "retrying", "retry_count": 2}

    monkeypatch.setattr(action_registry, "_action_feishu_send_message", send)
    monkeypatch.setattr(CostCenterMappingService, "mark_notification_failed", mark_failed)
    result = await action_registry._action_cost_center_feishu_send_message(
        {"enabled": True},
        {"period": "202608", "notification_id": 32},
        Session(),
    )

    assert result["status"] == delivery_status
    assert result["notification"] == {"status": "retrying", "retry_count": 2}


@pytest.mark.asyncio
async def test_cost_center_notification_action_skips_terminal_notification(monkeypatch):
    from app.automation import action_registry

    class Session:
        async def get(self, model, notification_id):
            return SimpleNamespace(id=notification_id, status="sent")

    async def should_not_send(*args, **kwargs):
        raise AssertionError("sent 通知不得重复发送")

    monkeypatch.setattr(action_registry, "_action_feishu_send_message", should_not_send)
    result = await action_registry._action_cost_center_feishu_send_message(
        {}, {"period": "202608", "notification_id": 33}, Session()
    )
    assert result == {"status": "skipped", "reason": "notification_sent"}
