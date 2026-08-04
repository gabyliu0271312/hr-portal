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
