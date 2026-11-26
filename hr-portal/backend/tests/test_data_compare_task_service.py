from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.data_compare import task_service


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected_event"),
    [
        ("success", "scheduled_data_compare_success"),
        ("partial_diff", "scheduled_data_compare_success"),
        ("data_incomplete", "scheduled_data_compare_warning"),
        ("partial_success", "scheduled_data_compare_warning"),
        ("failed", "scheduled_data_compare_failed"),
    ],
)
async def test_scheduler_event_matches_run_status(status, expected_event):
    task = SimpleNamespace(id=10, name="monthly compare", skill_id=None)
    run = SimpleNamespace(
        id=20,
        status=status,
        diff_count=0,
        summary={"data_incomplete_period_count": 1} if status != "failed" else {},
        duration_ms=1,
    )
    db = AsyncMock()
    db.get.return_value = task

    with patch.object(task_service, "execute_task", new=AsyncMock(return_value=run)), \
         patch.object(task_service, "_publish_event", new=AsyncMock()) as publish:
        result = await task_service.execute_for_scheduler(db, task.id)

    assert result[0] == 0
    assert publish.await_args.kwargs["trigger_type"] == expected_event


@pytest.mark.asyncio
async def test_execute_task_promotes_failed_period_errors_to_run_error_message():
    task = SimpleNamespace(id=10, skill_id=20, last_run_at=None, last_status=None, last_diff_count=0, last_summary=None)
    skill = SimpleNamespace(params={}, instruction="test", created_by=1)
    user = SimpleNamespace(id=1)
    db = SimpleNamespace(
        get=AsyncMock(side_effect=[skill, user]),
        add=Mock(),
        flush=AsyncMock(),
        commit=AsyncMock(),
    )
    result = {
        "status": "partial_success",
        "summary": {"diff_count": 2},
        "period_results": [
            {"period": "202603", "status": "failed", "error_message": "查询超时"},
            {"period": "202604", "status": "partial_diff", "diff_count": 2},
        ],
        "details": [],
        "duration_ms": 12,
    }
    with patch("app.data_compare.task_service.run_data_compare", create=True, new=AsyncMock(return_value=result)):
        with patch("app.data_compare.chat_handler.run_data_compare", new=AsyncMock(return_value=result)):
            run = await task_service.execute_task(db, task)

    assert run.error_message == "202603: 查询超时"
    assert run.status == "partial_success"


@pytest.mark.asyncio
async def test_report_compare_task_persists_snapshot_and_incomplete_status():
    task = SimpleNamespace(id=10, skill_id=20)
    skill = SimpleNamespace(params={"kind": "report_amount_v1"}, created_by=1)
    user = SimpleNamespace(id=1, is_active=True)
    db = SimpleNamespace(get=AsyncMock(side_effect=[skill, user]), add=Mock(),
                         flush=AsyncMock(), commit=AsyncMock())
    snapshot = {"kind": "report_amount_v1", "summary": {"items": [], "diff_count": 0, "incomplete_count": 1}, "groups": []}
    gate = AsyncMock()
    with patch("app.core.deps.require_op", return_value=gate), \
         patch("app.data_compare.report_compare.execute_report_compare", new=AsyncMock(return_value=snapshot)):
        run = await task_service.execute_task(db, task, triggered_by=1)
    assert run.status == "data_incomplete"
    assert run.detail is snapshot
    assert task.last_summary == {"diff_count": 0}
    gate.assert_awaited_once_with(user, db)


@pytest.mark.asyncio
async def test_report_compare_scheduler_rejected_before_execution_or_events():
    task = SimpleNamespace(id=10, skill_id=20)
    skill = SimpleNamespace(params={"kind": "report_amount_v1"}, created_by=1)
    db = SimpleNamespace(get=AsyncMock(side_effect=[task, skill]))
    with patch.object(task_service, "execute_task", new=AsyncMock()) as execute, \
         patch.object(task_service, "_publish_event", new=AsyncMock()) as publish:
        with pytest.raises(ValueError, match="不支持调度"):
            await task_service.execute_for_scheduler(db, 10)
    execute.assert_not_awaited()
    publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_report_compare_detail_filters_groups_without_changing_totals():
    from app.data_compare import router
    run = SimpleNamespace(id=3, task_id=10, trigger_type="manual", status="partial_diff", diff_count=1,
                          summary={"items": [{"period": "202601", "amount_a": "100", "amount_b": "95"}]},
                          detail={"kind": "report_amount_v1", "groups": [
                              {"period": "202601", "metric_id": "salary", "dimension": "X", "status": "match"},
                              {"period": "202601", "metric_id": "salary", "dimension": "Y", "status": "diff"}]},
                          duration_ms=1, error_message=None, triggered_by=1, started_at=None, finished_at=None)
    with patch.object(task_service, "get_run", new=AsyncMock(return_value=run)), \
         patch.object(task_service, "get_task", new=AsyncMock(return_value=SimpleNamespace(id=10))), \
         patch.object(task_service, "user_can_access_task", new=AsyncMock(return_value=True)), \
         patch("app.data_compare.report_compare.validate_snapshot", new=AsyncMock()) as validate:
        result = await router.get_run_detail(3, "202601", "salary", True, 1, 0, AsyncMock(), SimpleNamespace(id=1), None)
    assert result["summary"] == run.summary
    assert result["detail"]["total"] == 1
    assert result["detail"]["items"][0]["dimension"] == "Y"
    assert "groups" not in result["detail"]
    assert "execution_sql" not in result
    validate.assert_awaited_once()
