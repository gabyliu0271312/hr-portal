from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
import importlib.util

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.performance import projects_router as router
from app.performance import reconsideration_service as service
from app.performance.models import (
    PerformanceAuditEvent, PerformanceNodeTask, PerformanceProject,
    PerformanceReconsiderationNotification, PerformanceResultReconsideration,
)


def result(rows):
    return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))


@pytest.fixture
def lifecycle(monkeypatch):
    now = datetime.now(UTC)
    project = SimpleNamespace(id=1, cycle_ref="cycle:one", settings={})
    node = SimpleNamespace(id=4, node_id="appeal", config={
        "time": {"start_at": (now - timedelta(days=1)).isoformat(), "appeal_deadline": (now + timedelta(days=1)).isoformat()},
        "template": {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}},
    })
    values = [project, SimpleNamespace(id=2, source_snapshot_id=3),
              SimpleNamespace(employee_no="E1", hrbp_employee_no="H1"),
              SimpleNamespace(result_version={"original": 7}), node, None]

    class Db:
        def __init__(self):
            self.rows, self.sql = [], []
            self.commits = 0

        def add(self, row):
            row.id = len(self.rows) + 1
            self.rows.append(row)
            if isinstance(row, PerformanceResultReconsideration):
                values[-1] = row

        async def flush(self):
            pass

        async def execute(self, statement):
            self.sql.append(str(statement.compile(dialect=postgresql.dialect())))
            table = statement.column_descriptions[0]["entity"]
            if table is PerformanceNodeTask:
                return result([row for row in self.rows if isinstance(row, table) and row.revoked_at is None and row.task_kind == "result_reconsideration"])
            if table is PerformanceReconsiderationNotification:
                return result([row for row in self.rows if isinstance(row, table) and row.status in {"pending", "retrying"}])
            return result([])

        async def commit(self):
            self.commits += 1

    async def context(db, project_id, employee_no, **kwargs):
        assert project_id == 1 and employee_no == "E1"
        return values

    monkeypatch.setattr(service, "submission_context", context)
    monkeypatch.setattr(service, "freeze_published_result", AsyncMock(return_value=({"task_versions": {"original": 7}}, 2)))
    return SimpleNamespace(db=Db(), values=values, node=node,
                           actor=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1"))


@pytest.mark.asyncio
async def test_edit_withdraw_resubmit_preserves_history_and_audit(lifecycle):
    data = lifecycle
    db, actor = data.db, data.actor
    first = await service.submit_reconsideration(db, 1, "E1", "<p>原理由</p>", actor)
    appeal = data.values[-1]
    old_task = next(row for row in db.rows if isinstance(row, PerformanceNodeTask))
    old_task.answers, old_task.draft_answers = {"feedback": "旧答案"}, {"feedback": "旧草稿"}
    old_task.status, old_task.submitted_at = "completed", datetime.now(UTC)
    assert first["version"] == 1 and first["can_edit"]
    edited = await service.edit_reconsideration(db, 1, "E1", "<p>编辑后</p>", 1, actor)
    assert edited["version"] == 2 and edited["reason"] == "<p>编辑后</p>"
    withdrawn = await service.withdraw_reconsideration(db, 1, "E1", 2, actor)
    assert withdrawn["version"] == 3 and withdrawn["can_submit"]
    assert withdrawn["reason"] is None and withdrawn["submitted_at"] is None
    assert withdrawn["withdrawn_at"] is not None
    assert not withdrawn["can_edit"] and not withdrawn["can_withdraw"]
    notification = next(row for row in db.rows if isinstance(row, PerformanceReconsiderationNotification))
    assert notification.status == "skipped" and old_task.revoked_at is not None
    second = await service.submit_reconsideration(db, 1, "E1", "再次发起", actor, 3)
    tasks = [row for row in db.rows if isinstance(row, PerformanceNodeTask)]
    assert second["id"] == first["id"] and second["version"] == 4
    assert len(tasks) == 2 and tasks[1].id != old_task.id and tasks[1].revoked_at is None
    assert old_task.answers == {"feedback": "旧答案"} and old_task.draft_answers == {"feedback": "旧草稿"}
    assert old_task.status == "completed" and old_task.revoked_at is not None
    assert appeal.result_version == {"original": 7}
    events = [row for row in db.rows if isinstance(row, PerformanceAuditEvent)]
    assert [event.event_type for event in events] == [
        "PERFORMANCE_RECONSIDERATION_SUBMITTED", "PERFORMANCE_RECONSIDERATION_EDITED",
        "PERFORMANCE_RECONSIDERATION_WITHDRAWN", "PERFORMANCE_RECONSIDERATION_RESUBMITTED",
    ]
    assert events[1].before_state["reason"] == "<p>原理由</p>"
    assert events[1].after_state["reason"] == "<p>编辑后</p>"
    assert events[2].before_state["withdrawn"] is False and events[2].after_state["withdrawn"] is True
    assert events[3].before_state["version"] == 3 and events[3].after_state["version"] == 4
    assert events[3].before_state["withdrawn"] is True and events[3].after_state["withdrawn"] is False
    status = await service.read_status(db, 1, "E1")
    assert status["reason"] == "再次发起" and status["version"] == 4


@pytest.mark.asyncio
async def test_deadline_blocks_edit_and_resubmit_but_not_withdraw(lifecycle):
    data = lifecycle
    await service.submit_reconsideration(data.db, 1, "E1", "理由", data.actor)
    data.node.config["time"]["appeal_deadline"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    status = await service.read_status(data.db, 1, "E1")
    assert not status["window_open"] and not status["can_edit"] and status["can_withdraw"]
    with pytest.raises(HTTPException, match="RECONSIDERATION_WINDOW_CLOSED"):
        await service.edit_reconsideration(data.db, 1, "E1", "修改", 1, data.actor)
    withdrawn = await service.withdraw_reconsideration(data.db, 1, "E1", 1, data.actor)
    assert withdrawn["version"] == 2 and not withdrawn["can_submit"]
    with pytest.raises(HTTPException, match="RECONSIDERATION_WINDOW_CLOSED"):
        await service.submit_reconsideration(data.db, 1, "E1", "再发起", data.actor, 2)


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "withdraw", "resubmit"])
async def test_stale_version_never_changes_state(lifecycle, action):
    data = lifecycle
    await service.submit_reconsideration(data.db, 1, "E1", "理由", data.actor)
    if action == "resubmit":
        await service.withdraw_reconsideration(data.db, 1, "E1", 1, data.actor)
    appeal = data.values[-1]
    before = service._appeal_state(appeal)
    with pytest.raises(HTTPException, match="VERSION_CONFLICT"):
        if action == "edit":
            await service.edit_reconsideration(data.db, 1, "E1", "新理由", 99, data.actor)
        elif action == "withdraw":
            await service.withdraw_reconsideration(data.db, 1, "E1", 99, data.actor)
        else:
            await service.submit_reconsideration(data.db, 1, "E1", "新理由", data.actor, 99)
    assert service._appeal_state(appeal) == before
    if action == "resubmit":
        with pytest.raises(HTTPException, match="VERSION_REQUIRED"):
            await service.submit_reconsideration(data.db, 1, "E1", "新理由", data.actor)


@pytest.mark.asyncio
async def test_first_submit_reuses_only_active_unsubmitted_legacy_task(lifecycle):
    data = lifecycle
    legacy = PerformanceNodeTask(task_kind="result_reconsideration", handler_ref="H1", revoked_at=None, answers={"legacy": True}, draft_answers={"old": True})
    data.db.add(legacy)
    response = await service.submit_reconsideration(data.db, 1, "E1", "理由", data.actor)
    assert response["task_count"] == 1
    assert len([row for row in data.db.rows if isinstance(row, PerformanceNodeTask)]) == 1
    assert legacy.answers == {"legacy": True} and legacy.draft_answers == {"old": True}
    sql = next(sql for sql in data.db.sql if "FROM performance_node_tasks" in sql)
    assert "revoked_at IS NULL" in sql and "task_kind =" in sql


@pytest.mark.parametrize("value", ["", "  ", "<p><br>&nbsp;​</p>", "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<p>" + "字" * 1501 + "</p>", "x" * 30001])
def test_reason_rejects_empty_unsafe_only_and_visible_overflow(value):
    with pytest.raises(HTTPException) as exc:
        service.validate_reason(value)
    assert exc.value.status_code == 422


def test_reason_counts_visible_text_not_wire_and_sanitizes():
    rich = "<p>" + "<strong>字</strong>" * 1500 + "</p>"
    assert len(rich) > 1500 and service.validate_reason(rich) == rich
    assert service.validate_reason("事实 1 < 2 & 3 > 2") == "事实 1 &lt; 2 &amp; 3 &gt; 2"
    clean = service.validate_reason('<p onclick="evil()">事实<script>evil()</script><a href="javascript:evil()">依据</a></p>')
    assert clean == "<p>事实<a>依据</a></p>"
    assert service.validate_reason("<p>" + "&amp;" * 1500 + "</p>")


def test_payload_version_requirements_and_wire_limit():
    assert router.ReconsiderationPayload(reason="首次理由").version is None
    assert router.ReconsiderationEditPayload(reason="<b>" + "字" * 1500 + "</b>", version=1)
    for payload, kwargs in [
        (router.ReconsiderationEditPayload, {"reason": "理由"}),
        (router.ReconsiderationWithdrawPayload, {}),
        (router.ReconsiderationWithdrawPayload, {"version": 0}),
        (router.ReconsiderationPayload, {"reason": "x" * 30001}),
    ]:
        with pytest.raises(ValidationError):
            payload(**kwargs)


@pytest.mark.asyncio
@pytest.mark.parametrize("revoked,withdrawn", [(True, False), (False, True)])
async def test_old_tasks_cannot_read_active_or_withdrawn_appeal(revoked, withdrawn):
    task = SimpleNamespace(project_id=1, member_snapshot_id=2, node_snapshot_id=4, target_employee_no="E1",
                           task_kind="result_reconsideration", revoked_at=datetime.now(UTC) if revoked else None)
    db = SimpleNamespace(scalar=AsyncMock(return_value=None))
    with pytest.raises(HTTPException, match="TASK_NOT_FOUND"):
        await service.reconsideration_for_task(db, task)
    if revoked:
        db.scalar.assert_not_called()
    else:
        sql = str(db.scalar.call_args.args[0])
        assert "withdrawn_at IS NULL" in sql
    sql = str(service.valid_reconsideration_task())
    assert "withdrawn_at IS NULL" in sql and "revoked_at IS NULL" in sql


@pytest.mark.asyncio
async def test_submission_context_locks_project_before_appeal():
    project = SimpleNamespace(id=1, status="STARTED")
    node = SimpleNamespace(id=4, node_id="appeal", node_type="result_reconsideration")
    values = [project, object(), SimpleNamespace(id=2), object(), None]
    statements = []

    async def scalar(statement):
        statements.append(statement)
        return values.pop(0)

    db = SimpleNamespace(scalar=scalar, execute=AsyncMock(return_value=result([
        SimpleNamespace(node_type="result_view"), node,
    ])))
    await service.submission_context(db, 1, "E1", lock=True)
    assert "FROM performance_projects" in str(statements[0]) and "FOR UPDATE" in str(statements[0])
    assert "FROM performance_result_reconsiderations" in str(statements[-1]) and "FOR UPDATE" in str(statements[-1])


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["DRAFT", "ENDED", None])
async def test_nonstarted_result_remains_not_found(status):
    db = SimpleNamespace(scalar=AsyncMock(return_value=SimpleNamespace(status=status) if status else None))
    with pytest.raises(HTTPException, match="RESULT_NOT_FOUND"):
        await service.submission_context(db, 1, "E1", lock=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("revoked", [False, True])
async def test_handler_lock_is_project_first_and_refresh_detects_withdraw(monkeypatch, revoked):
    calls = []
    task = PerformanceNodeTask(project_id=1, task_kind="result_reconsideration", revoked_at=None)
    node = object()

    async def scalar(statement):
        calls.append("project")
        assert "FOR UPDATE" in str(statement)
        return SimpleNamespace(id=1)

    async def refresh(row, **kwargs):
        calls.append("node" if row is node else "task_lock" if kwargs else "task_refresh")
        if row is task and revoked:
            row.revoked_at = datetime.now(UTC)

    async def appeal(db, row, **kwargs):
        calls.append("appeal_lock")
        if row.revoked_at:
            raise HTTPException(404, "TASK_NOT_FOUND")
        return object()

    monkeypatch.setattr(service, "reconsideration_for_task", appeal)
    db = SimpleNamespace(scalar=scalar, refresh=refresh)
    if revoked:
        with pytest.raises(HTTPException, match="TASK_NOT_FOUND"):
            await router._lock_task_context(db, task, node)
        assert calls == ["project", "node", "task_refresh", "appeal_lock"]
    else:
        await router._lock_task_context(db, task, node)
        assert calls == ["project", "node", "task_refresh", "appeal_lock", "task_lock"]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["locked_project", "revoked_after_refresh", "withdrawn", "missing_task", "completed", "inactive_project"])
async def test_dispatch_never_sends_invalid_or_busy_tasks(monkeypatch, case):
    from app.integrations.feishu import notification_service
    row = SimpleNamespace(id=1, task_id=5, status="retrying", attempts=3, next_retry_at=datetime.now(UTC), last_error="old")
    original_retry = row.next_retry_at
    task = SimpleNamespace(id=5, project_id=1, task_kind="result_reconsideration", revoked_at=None, status="completed" if case == "completed" else "pending")
    project = SimpleNamespace(id=1, status="ENDED" if case == "inactive_project" else "STARTED")
    statements = []

    class Savepoint:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    async def execute(statement):
        statements.append(str(statement.compile(dialect=postgresql.dialect())))
        return result([row])

    async def get(model, key):
        return None if model is not PerformanceNodeTask or case == "missing_task" else task

    async def scalar(statement):
        sql = str(statement.compile(dialect=postgresql.dialect()))
        assert "FOR UPDATE SKIP LOCKED" in sql
        return None if case == "locked_project" else project

    async def refresh(row):
        if case == "revoked_after_refresh":
            row.revoked_at = datetime.now(UTC)

    db = SimpleNamespace(execute=execute, get=get, scalar=scalar, refresh=refresh, begin_nested=Savepoint)
    send = AsyncMock()
    monkeypatch.setattr(notification_service, "send_notification", send)
    monkeypatch.setattr(service, "reconsideration_for_task", AsyncMock(side_effect=HTTPException(404, "TASK_NOT_FOUND")))
    processed, _ = await service.dispatch_notifications(db)
    send.assert_not_called()
    assert row.attempts == 3 and row.next_retry_at == original_retry
    if case == "locked_project":
        assert row.status == "retrying" and row.last_error == "old" and processed == 0
    else:
        assert row.status == "skipped" and processed == 1
    assert "FOR UPDATE" not in statements[0]


@pytest.mark.asyncio
async def test_router_mutations_return_same_status_and_use_current_employee(monkeypatch):
    app = FastAPI()
    app.include_router(router.router)
    db = object()
    context = object()
    app.dependency_overrides[router.get_session] = lambda: db
    app.dependency_overrides[router.get_performance_access_context] = lambda: context
    actor = SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1")
    monkeypatch.setattr(router, "_reconsideration_actor", AsyncMock(return_value=actor))
    output = {"id": 7, "version": 2, "can_edit": True, "can_withdraw": True, "window_open": True}
    submit, edit, withdraw = AsyncMock(return_value=output), AsyncMock(return_value=output), AsyncMock(return_value=output)
    monkeypatch.setattr(service, "submit_reconsideration", submit)
    monkeypatch.setattr(service, "edit_reconsideration", edit)
    monkeypatch.setattr(service, "withdraw_reconsideration", withdraw)
    url = "/performance/projects/1/result-reconsiderations"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post(url, json={"reason": "初次"})).status_code == 201
        assert (await client.patch(url, json={"reason": "修改", "version": 1})).json() == output
        assert (await client.post(url + "/withdraw", json={"version": 2})).json() == output
        assert (await client.patch(url, json={"reason": "无版本"})).status_code == 422
        assert (await client.post(url + "/withdraw", json={})).status_code == 422
    submit.assert_awaited_once_with(db, 1, "E1", "初次", actor, None, context=context)
    edit.assert_awaited_once_with(db, 1, "E1", "修改", 1, actor)
    withdraw.assert_awaited_once_with(db, 1, "E1", 2, actor)


def test_migration_is_linear_and_preserves_rows(monkeypatch):
    path = Path(__file__).parents[1] / "alembic/versions/0300_pm_reconsideration_lifecycle.py"
    spec = importlib.util.spec_from_file_location("reconsideration_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "0300_pm_reconsideration_lifecycle"
    assert migration.down_revision == "0299_pm_node_task_source_type"
    calls = []
    monkeypatch.setattr(migration.op, "add_column", lambda table, column: calls.append((table, column)))
    migration.upgrade()
    assert [column.name for table, column in calls] == ["withdrawn_at", "version"]
    assert calls[0][1].nullable and not calls[1][1].nullable
    assert str(calls[1][1].server_default.arg) == "1"
    dropped = []
    monkeypatch.setattr(migration.op, "drop_column", lambda table, column: dropped.append(column))
    migration.downgrade()
    assert dropped == ["version", "withdrawn_at"]
