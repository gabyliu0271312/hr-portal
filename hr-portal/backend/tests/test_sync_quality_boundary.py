from unittest.mock import AsyncMock
from types import SimpleNamespace

import pytest

from app.datasources import sync_service


class FakeDb:
    def __init__(self):
        self.rollback = AsyncMock()


@pytest.mark.asyncio
async def test_sync_passes_actual_periods_to_quality_dispatch(monkeypatch):
    db = FakeDb()

    async def sync_impl(*args, period_sink, **kwargs):
        period_sink.update({"202606", "202607"})
        return 2, "同步完成"

    dispatch = AsyncMock()
    monkeypatch.setattr(sync_service, "_sync_to_table_impl", sync_impl)
    monkeypatch.setattr(sync_service, "_publish_sync_completed_event", AsyncMock())
    monkeypatch.setattr(sync_service, "schedule_quality_checks_after_sync", dispatch)
    monkeypatch.setattr(sync_service, "_publish_ods_data_changed_event", AsyncMock())

    await sync_service.sync_to_table(
        "emp_monthly_allocation", "test", {}, {}, db, source_sync_batch_id="sync_run:periods"
    )

    assert dispatch.await_args.kwargs["periods"] == {"202606", "202607"}


@pytest.mark.asyncio
async def test_quality_dispatch_failure_keeps_actual_periods(monkeypatch):
    captured = []

    class SessionContext:
        def add(self, record):
            captured.append(record)

        async def commit(self):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(
        "app.core.db.get_session_factory",
        lambda: (lambda: SessionContext()),
    )

    await sync_service._record_quality_dispatch_failure(
        "emp_monthly_salary",
        {},
        "sync_run:compensation",
        {"202607", "202606"},
        "quality database unavailable",
    )

    assert captured[0].periods == ["202606", "202607"]


@pytest.mark.asyncio
async def test_post_commit_quality_failure_does_not_fail_sync(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(sync_service, "_sync_to_table_impl", AsyncMock(return_value=(7, "同步完成")))
    success_event = AsyncMock()
    monkeypatch.setattr(sync_service, "_publish_sync_completed_event", success_event)
    monkeypatch.setattr(
        sync_service,
        "schedule_quality_checks_after_sync",
        AsyncMock(side_effect=RuntimeError("quality database unavailable")),
    )
    monkeypatch.setattr(sync_service, "_record_quality_dispatch_failure", AsyncMock())
    monkeypatch.setattr(sync_service, "_publish_ods_data_changed_event", AsyncMock())

    rows, message = await sync_service.sync_to_table(
        "demo_table", "test", {}, {}, db, source_sync_batch_id="sync_run:42"
    )

    assert rows == 7
    assert "质量检查任务待补偿投递" in message
    db.rollback.assert_awaited_once()
    success_event.assert_awaited_once()
    sync_service._record_quality_dispatch_failure.assert_awaited_once()


@pytest.mark.asyncio
async def test_post_commit_event_failure_does_not_fail_sync(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(sync_service, "_sync_to_table_impl", AsyncMock(return_value=(3, "同步完成")))
    monkeypatch.setattr(
        sync_service,
        "_publish_sync_completed_event",
        AsyncMock(side_effect=RuntimeError("event bus unavailable")),
    )
    monkeypatch.setattr(sync_service, "schedule_quality_checks_after_sync", AsyncMock())
    monkeypatch.setattr(sync_service, "_publish_ods_data_changed_event", AsyncMock())

    rows, message = await sync_service.sync_to_table(
        "demo_table", "test", {}, {}, db, source_sync_batch_id="sync_run:43"
    )

    assert rows == 3
    assert "同步成功事件发布失败" in message
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_sync_completed_event_separates_batch_id_and_error(monkeypatch):
    captured = []

    class SessionContext:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(
        "app.core.db.get_session_factory",
        lambda: (lambda: SessionContext()),
    )

    async def capture_event(event, db):
        captured.append(event.payload)

    monkeypatch.setattr("app.automation.events.publish_event", capture_event)
    monkeypatch.setattr(sync_service, "_publish_ucp_platform_event", AsyncMock())

    await sync_service._publish_sync_completed_event(
        table_name="employee_table",
        sync_status="success",
        sync_rows=42,
        sync_message="ok",
        source_sync_batch_id="sync_run:42",
    )
    await sync_service._publish_sync_completed_event(
        table_name="employee_table",
        sync_status="failed",
        sync_rows=0,
        sync_message="",
        error_message="connection failed",
        source_sync_batch_id="sync_run:43",
    )

    assert captured[0]["source_sync_batch_id"] == "sync_run:42"
    assert captured[0]["error_message"] is None
    assert captured[1]["source_sync_batch_id"] == "sync_run:43"
    assert captured[1]["error_message"] == "connection failed"
