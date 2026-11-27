from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles, deregister
from sqlalchemy.orm import Session

from app.performance import calibration_workspace_service as workspace, calibration_completion_service as completion, projects_router as routes, models
from tests.test_performance_user_authorization import AsyncDb


@pytest.fixture
def data(monkeypatch):
    compiles(JSONB, "sqlite")(lambda *_args, **_kwargs: "JSON")
    compiles(BigInteger, "sqlite")(lambda *_args, **_kwargs: "INTEGER")
    engine = create_engine("sqlite://")
    import json
    connection = engine.raw_connection()
    connection.create_function("jsonb_typeof", 1, lambda value: "array" if isinstance(json.loads(value), list) else "object")
    connection.close()
    tables = [model.__table__ for model in (models.PerformanceCycle, models.PerformanceProject, models.PerformanceProjectNodeSnapshot, models.PerformanceProjectMemberSnapshot, models.PerformanceAuthorizationSnapshotPerson, models.PerformanceProjectMember, models.PerformanceNodeTask, models.PerformanceNodeTaskAuthorization, models.PerformanceResultReconsideration, models.PerformanceAuditEvent)]
    models.PerformanceProject.metadata.create_all(engine, tables=tables)
    session = Session(engine, expire_on_commit=False)
    actor = SimpleNamespace(actor_type="EMPLOYEE", actor_ref="H")
    rule = lambda identity: {"rule_id": identity, "scope": "PROJECT_ALL", "subject_type": "PERSON", "operator": "INCLUDE", "allow_authorize": True, "subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["H"]}]}]}
    projects, nodes, tasks = [], [], []
    for project_id in (1, 2):
        rules = [rule("a"), rule("b")]
        project = models.PerformanceProject(id=project_id, project_ref=f"project-{project_id}", cycle_ref="c", name=f"项目{project_id}", status="STARTED", settings={})
        phases = [{"phase_id": phase, "rule_sources": [{"rule_id": item["rule_id"], "rule": item} for item in rules], "assignments": [{"handler_ref": "H", "employee_no": employee, "allow_authorize": True, "source_rule_ids": ["a", "b"] if employee == "E1" else ["a"]} for employee in ("E1", "E2")]} for phase in ("p1", "p2")]
        node = models.PerformanceProjectNodeSnapshot(id=project_id * 10, project_id=project_id, node_id="cal", node_type="calibration", name="校准", node_order=2, config={"calibration": {"role_code": "assessment.calibrator", "phases": phases}})
        snapshot = models.PerformanceProjectMemberSnapshot(id=project_id * 100, project_id=project_id, cycle_ref="c", snapshot_version=1, source_snapshot_id=1)
        session.add_all([project, node, snapshot])
        for phase in phases:
            for employee in ("E1", "E2"):
                task = models.PerformanceNodeTask(id=len(tasks) + 1, project_id=project_id, cycle_ref="c", member_snapshot_id=snapshot.id, node_snapshot_id=node.id, target_employee_no=employee, handler_ref="H", phase_id=phase["phase_id"], task_kind="calibration", status="pending", answers={})
                tasks.append(task)
                session.add(task)
        for employee in ("E1", "E2"):
            session.add(models.PerformanceProjectMember(snapshot_id=snapshot.id, employee_no=employee, display_name=employee))
        projects.append(project); nodes.append(node)
    session.add_all([models.PerformanceAuthorizationSnapshotPerson(id=index, snapshot_id=1, employee_no=employee, display_name=f"姓名{employee}") for index, employee in enumerate(("E1", "E2", "H", "SECRET"), 1)])
    session.commit()
    db = AsyncDb(session)
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(side_effect=lambda *_args, **_kwargs: actor))
    monkeypatch.setattr(routes, "_self_summary_task", AsyncMock(side_effect=lambda identity, *_args, **_kwargs: (session.get(models.PerformanceNodeTask, identity), nodes[0])))
    monkeypatch.setattr(routes, "_get_cycle", AsyncMock(return_value=SimpleNamespace(cycle_ref="c")))
    monkeypatch.setattr(routes, "_task_window", lambda *_args: (None, None))
    monkeypatch.setattr(routes, "_self_summary_template", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "build_self_summary_schema", lambda *_args: [{"id": "s", "fields": [{"id": "grade", "type": "rating", "label": "评级", "options": [{"id": "A", "code": "A", "label": "A"}]}]}])
    monkeypatch.setattr(routes, "_effective_member_result", AsyncMock(return_value={"answers": {"grade": "A"}, "shared_state": {"revision": 1}}))
    monkeypatch.setattr(routes, "_sync_automatic_openings", AsyncMock())
    yield SimpleNamespace(db=db, session=session, actor=actor, projects=projects, nodes=nodes, tasks=tasks)
    session.close(); engine.dispose(); deregister(JSONB); deregister(BigInteger)


@pytest.mark.asyncio
async def test_multiple_projects_phases_and_rules_have_distinct_scopes(data, monkeypatch):
    original_execute = data.db.execute
    queries = 0
    async def counted(statement):
        nonlocal queries
        queries += 1
        return await original_execute(statement)
    monkeypatch.setattr(data.db, "execute", counted)
    result = await workspace.list_scopes(data.db, 1, None)
    assert len(result["tasks"]) == 8
    assert queries == 5
    assert len({item["scope_key"] for item in result["tasks"]}) == 8
    assert [item["task_number"] for item in result["tasks"]] == list(range(1, 9))
    assert result["pending_member_count"] == 4
    assert [item["member_count"] for item in result["tasks"]] == [2, 1, 2, 1] * 2
    assert all(item["status"] == "pending" for item in result["tasks"])
    assert all(item["people_options"] for item in result["tasks"])
    assert all("SECRET" not in {person["employee_no"] for person in item["people_options"]} for item in result["tasks"])
    routes._self_summary_task.assert_not_awaited()
    data.actor.actor_ref = "OUTSIDER"
    assert (await workspace.list_scopes(data.db, 1, None))["tasks"] == []


@pytest.mark.asyncio
async def test_complete_rule_is_independent_locks_final_and_all_completion_waits(data):
    rows = (await workspace.list_scopes(data.db, 1, None))["tasks"]
    selected = rows[0]
    payload = routes.CalibrationCompletionPayload(node_id="cal", phase_id="p1", scope_key=selected["scope_key"])
    preview = await completion.preview_completion(data.db, 1, payload, None)
    confirmed = await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**payload.model_dump(), scope_version=preview["scope_version"]), None)
    assert confirmed["completed"]
    first = data.tasks[0].calibration_completed_at
    data.session.expire_all()
    updated = (await workspace.list_scopes(data.db, 1, None))["tasks"]
    assert [item["status"] for item in updated] == ["completed", "pending", "pending", "pending"] + ["pending"] * 4
    task = data.session.get(models.PerformanceNodeTask, 1)
    assert task.calibration_completed_at is not None
    assert workspace.rule_completed(task, "a") and not workspace.rule_completed(task, "b")
    assert not routes._previous_finished("E1", data.nodes[0], [task])
    final = SimpleNamespace(project_id=1, cycle_ref="c", member_snapshot_id=100, target_employee_no="E1")
    final_node = SimpleNamespace(config={"template": {"include_final_result": True}})
    assert await routes._final_result_locked(final, final_node, data.db)
    assert not await routes._final_result_locked(task, data.nodes[0], data.db)
    await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**payload.model_dump(), scope_version=preview["scope_version"]), None)
    assert task.calibration_completed_at == first
    assert len(data.session.scalars(select(models.PerformanceAuditEvent)).all()) == 1
    other = routes.CalibrationCompletionPayload(node_id="cal", phase_id="p1", scope_key=rows[1]["scope_key"])
    check = await completion.preview_completion(data.db, 1, other, None)
    await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**other.model_dump(), scope_version=check["scope_version"]), None)
    assert routes._previous_finished("E1", data.nodes[0], [task])
    assert task.status == "pending" and task.submitted_at is None and task.answers == {}


@pytest.mark.asyncio
async def test_forged_or_cross_context_scope_never_falls_back(data):
    key = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]["scope_key"]
    for project_id, node_id, scope, phase in [(2, "cal", key, None), (1, "wrong", key, None), (1, "cal", "forged", None), (1, "cal", key, "p2")]:
        with pytest.raises(HTTPException) as error:
            await workspace.resolve_scope(data.db, project_id, node_id, scope, None, phase_id=phase)
        assert error.value.status_code == 404
    data.actor.actor_ref = "OTHER"
    with pytest.raises(HTTPException) as denied:
        await completion.preview_completion(data.db, 1, routes.CalibrationCompletionPayload(node_id="cal", scope_key=key), None)
    assert denied.value.status_code == 404
    assert all(task.calibration_completed_at is None for task in data.tasks)


def grant(data, identity, task_id, recipient, parent=None, source="a", mode="NONE", readonly=False):
    record = models.PerformanceNodeTaskAuthorization(id=identity, project_id=1, cycle_ref="c", task_id=task_id, authorization_type="AUTHORIZE", grantor_employee_no="H", recipient_employee_no=recipient, status="ACTIVE", read_only=readonly, authorization_settings={"source_rule_id": source, "distribution_mode": mode, **({"parent_authorization_id": parent} if parent else {})})
    data.session.add(record)
    return record


@pytest.mark.asyncio
async def test_delegations_independent_parent_child_and_revocation(data):
    parent = grant(data, 11, 1, "R")
    grant(data, 12, 2, "R")
    child = grant(data, 13, 1, "CHILD", 11)
    data.session.commit()
    data.actor.actor_ref = "R"
    row = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    assert row["member_count"] == 2
    payload = routes.CalibrationCompletionPayload(node_id="cal", scope_key=row["scope_key"])
    preview = await completion.preview_completion(data.db, 1, payload, None)
    await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**payload.model_dump(), scope_version=preview["scope_version"]), None)
    assert parent.authorization_settings["calibration_completed_at"]
    assert "calibration_completed_at" not in child.authorization_settings
    assert data.tasks[0].calibration_completed_at is None
    routes._sync_automatic_openings.assert_not_awaited()
    data.actor.actor_ref = "CHILD"
    child_row = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    assert child_row["status"] == "pending" and child_row["scope_key"] != row["scope_key"]
    parent.status = "REVOKED"; data.session.commit()
    assert (await workspace.list_scopes(data.db, 1, None))["tasks"] == []
    with pytest.raises(HTTPException):
        await workspace.resolve_scope(data.db, 1, "cal", child_row["scope_key"], None)


@pytest.mark.asyncio
async def test_readonly_scope_can_read_distribution_but_cannot_complete(data):
    grant(data, 11, 1, "R", readonly=True); data.session.commit()
    data.actor.actor_ref = "R"
    item = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    assert item["read_only"] and not item["can_complete"]
    response = await routes.workbench_task_distribution_tips("cal", 1, None, data.db, scope_key=item["scope_key"])
    assert response["total_people"] == 1
    with pytest.raises(HTTPException) as denied:
        await completion.preview_completion(data.db, 1, routes.CalibrationCompletionPayload(node_id="cal", scope_key=item["scope_key"]), None)
    assert denied.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("overdue", [False, True])
async def test_selected_rule_distribution_and_stale_result_or_scope_block(data, monkeypatch, overdue):
    if overdue:
        monkeypatch.setattr(routes, "_task_window", lambda *_args: (None, datetime(2000, 1, 1, tzinfo=UTC)))
    hard = {"assessment_item_id": "grade", "min_people_count": 1, "conditions": [{"control_mode": "HARD", "grade_codes": ["A"], "operator": "LTE", "value": 0, "unit": "PEOPLE"}]}
    data.projects[0].settings = {"flow_settings": {"node_settings": {"cal": {"calibration": {"force_distribution_enabled": True, "phases": [{"phase_id": "p1", "rules": [{"rule_id": "a", "distribution_rules": []}, {"rule_id": "b", "distribution_rules": [hard]}]}]}}}}}
    data.session.commit()
    rows = (await workspace.list_scopes(data.db, 1, None))["tasks"]
    a, b = [routes.CalibrationCompletionPayload(node_id="cal", scope_key=item["scope_key"]) for item in rows[:2]]
    preview = await completion.preview_completion(data.db, 1, a, None)
    assert preview["can_complete"]
    blocked = await completion.preview_completion(data.db, 1, b, None)
    assert not blocked["can_complete"] and blocked["blocked_reason"] == "CALIBRATION_DISTRIBUTION_VIOLATED"
    with pytest.raises(HTTPException) as error:
        await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**b.model_dump(), scope_version=blocked["scope_version"]), None)
    assert error.value.detail == "CALIBRATION_DISTRIBUTION_VIOLATED"
    monkeypatch.setattr(routes, "_effective_member_result", AsyncMock(return_value={"answers": {"grade": "A"}, "shared_state": {"revision": 2}}))
    with pytest.raises(HTTPException) as stale:
        await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**a.model_dump(), scope_version=preview["scope_version"]), None)
    assert stale.value.detail == "CALIBRATION_SCOPE_CHANGED"
    assert data.tasks[0].calibration_completed_at is None


@pytest.mark.asyncio
async def test_legacy_is_ambiguous_not_fabricated_and_new_member_reopens(data):
    data.tasks[0].calibration_completed_at = datetime.now(UTC)
    data.session.commit()
    rows = (await workspace.list_scopes(data.db, 1, None))["tasks"]
    assert rows[0]["history_ambiguous"] and rows[1]["status"] == "pending"
    workspace.complete_rule(data.tasks[0], data.nodes[0], "a", "H", datetime.now(UTC))
    workspace.complete_rule(data.tasks[1], data.nodes[0], "a", "H", datetime.now(UTC))
    data.session.commit()
    assert (await workspace.list_scopes(data.db, 1, None))["tasks"][0]["status"] == "completed"
    config = deepcopy(data.nodes[0].config)
    config["calibration"]["phases"][0]["assignments"].append({"handler_ref": "H", "employee_no": "NEW", "source_rule_ids": ["a"]})
    data.nodes[0].config = config
    data.session.add(models.PerformanceNodeTask(id=99, project_id=1, cycle_ref="c", member_snapshot_id=100, node_snapshot_id=10, target_employee_no="NEW", handler_ref="H", phase_id="p1", task_kind="calibration", status="pending", answers={}))
    data.session.commit()
    assert (await workspace.list_scopes(data.db, 1, None))["tasks"][0]["status"] == "pending"
    assert workspace.rule_completed(data.tasks[0], "a")


@pytest.mark.asyncio
async def test_people_filter_applies_before_count_sort_and_pagination(data, monkeypatch):
    monkeypatch.setattr(routes, "_communication_progress_detail", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "_snapshot_supervisor_names", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "_communication_final_rating_values", AsyncMock(return_value=([], {})))
    monkeypatch.setattr(routes, "load_subject_visibility_rules", AsyncMock(return_value={"calibrator": []}))
    monkeypatch.setattr(routes, "resolve_subject_visibility_role", AsyncMock(return_value="calibrator"))
    monkeypatch.setattr(routes, "_effective_project_results", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "hydrate_member_identities", AsyncMock())
    from app.performance import member_reminders
    monkeypatch.setattr(member_reminders, "reminder_source_node", lambda node: False)
    rows = (await workspace.list_scopes(data.db, 1, None))["tasks"]
    only_e1 = rows[1]["scope_key"]
    first = await routes.workbench_task_people("cal", 1, "all", None, data.db, phase_id="p1", page=1, page_size=1, scope_key=only_e1)
    assert first["total"] == 1 and [item["employee_no"] for item in first["items"]] == ["E1"]
    second = await routes.workbench_task_people("cal", 1, "all", None, data.db, phase_id="p1", page=2, page_size=1, scope_key=only_e1)
    assert second["total"] == 1 and second["items"] == []
    with pytest.raises(HTTPException) as denied:
        await routes.workbench_task_people("cal", 1, "all", None, data.db, scope_key="forged")
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_missing_results_and_window_are_not_confused(data, monkeypatch):
    row = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    payload = routes.CalibrationCompletionPayload(node_id="cal", scope_key=row["scope_key"])
    monkeypatch.setattr(routes, "_effective_member_result", AsyncMock(return_value={"answers": {}, "shared_state": {"revision": 0}}))
    preview = await completion.preview_completion(data.db, 1, payload, None)
    assert preview["can_complete"] and preview["missing_result_count"] == 2
    monkeypatch.setattr(routes, "_task_window", lambda *_args: (None, datetime(2000, 1, 1, tzinfo=UTC)))
    closed = await completion.preview_completion(data.db, 1, payload, None)
    assert closed["blocked_reason"] is None
    assert closed["missing_result_count"] == 2 and closed["can_complete"]
    overdue_rows = (await workspace.list_scopes(data.db, 1, None))["tasks"]
    assert all(row["status"] == "overdue" and row["can_complete"] for row in overdue_rows)
    confirmed = await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**payload.model_dump(), scope_version=closed["scope_version"]), None)
    assert confirmed["completed"]
    data.session.expire_all()
    assert (await workspace.list_scopes(data.db, 1, None))["tasks"][0]["status"] == "completed"


@pytest.mark.asyncio
async def test_not_started_completion_remains_disallowed(data, monkeypatch):
    row = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    monkeypatch.setattr(routes, "_task_window", lambda *_args: (datetime(2100, 1, 1, tzinfo=UTC), None))
    payload = routes.CalibrationCompletionPayload(node_id="cal", scope_key=row["scope_key"])
    preview = await completion.preview_completion(data.db, 1, payload, None)
    assert not preview["can_complete"] and preview["blocked_reason"] == "SUBMISSION_NOT_ALLOWED"
    with pytest.raises(HTTPException) as denied:
        await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**payload.model_dump(), scope_version=preview["scope_version"]), None)
    assert denied.value.status_code == 409
    assert data.tasks[0].calibration_completed_at is None


def test_legacy_without_rule_sources_can_complete_without_inventing_rule_identity():
    task = SimpleNamespace(phase_id="p", handler_ref="H", target_employee_no="E", calibration_completed_at=None, calibration_rule_completions=None)
    node = SimpleNamespace(config={"calibration": {"phases": [{"phase_id": "p", "assignments": [{"handler_ref": "H", "employee_no": "E"}]}]}})
    workspace.complete_rule(task, node, None, "H", datetime.now(UTC))
    assert workspace.rule_completed(task, None) and workspace.responsibility_completed(task, node)


def test_new_migration_adds_nullable_state_and_refuses_lossy_downgrade(monkeypatch):
    import importlib.util
    from pathlib import Path
    from unittest.mock import Mock
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0322_pm_calibration_rule_completion.py"
    spec = importlib.util.spec_from_file_location("calibration_rule_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    operations = SimpleNamespace(add_column=Mock(), drop_column=Mock(), get_bind=Mock(return_value=SimpleNamespace(execute=lambda _statement: SimpleNamespace(scalar=lambda: True))))
    monkeypatch.setattr(migration, "op", operations)
    migration.upgrade()
    table, column = operations.add_column.call_args.args
    assert table == "performance_node_tasks" and column.name == "calibration_rule_completions" and column.nullable
    assert migration.down_revision == "0321_pm_pre_lock_adjustment"
    with pytest.raises(RuntimeError, match="CALIBRATION_COMPLETION_HISTORY_EXISTS"):
        migration.downgrade()
    operations.drop_column.assert_not_called()
    operations.get_bind.return_value = SimpleNamespace(execute=lambda _statement: SimpleNamespace(scalar=lambda: False))
    migration.downgrade()
    operations.drop_column.assert_called_once_with("performance_node_tasks", "calibration_rule_completions")


@pytest.mark.asyncio
async def test_confirm_transaction_rolls_back_all_rules_and_audit_on_commit_failure(data, monkeypatch):
    row = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    payload = routes.CalibrationCompletionPayload(node_id="cal", scope_key=row["scope_key"])
    preview = await completion.preview_completion(data.db, 1, payload, None)
    monkeypatch.setattr(data.db, "commit", AsyncMock(side_effect=RuntimeError("transaction failed")))
    with pytest.raises(RuntimeError, match="transaction failed"):
        await completion.confirm_completion(data.db, 1, routes.CalibrationCompletionConfirmPayload(**payload.model_dump(), scope_version=preview["scope_version"]), None)
    data.session.rollback()
    data.session.expire_all()
    assert all(task.calibration_completed_at is None and task.calibration_rule_completions is None for task in data.session.scalars(select(models.PerformanceNodeTask)).all())
    assert data.session.scalars(select(models.PerformanceAuditEvent)).all() == []


@pytest.mark.asyncio
async def test_http_contract_preview_confirm_reopen_and_invalid_scope(data):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    app = FastAPI()
    app.include_router(routes.router, prefix="/api/v1")
    app.dependency_overrides[routes.get_session] = lambda: data.db
    app.dependency_overrides[routes.get_performance_access_context] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listing = await client.get("/api/v1/performance/review/calibration-tasks?cycle_id=1")
        assert listing.status_code == 200
        task = listing.json()["tasks"][0]
        payload = {"node_id": task["node_id"], "phase_id": task["phase_id"], "scope_key": task["scope_key"]}
        path = "/api/v1/performance/projects/1/calibration-completion"
        preview = await client.post(path + "/preview", json=payload)
        assert preview.status_code == 200 and "distribution_tips" in preview.json()
        confirmed = await client.post(path + "/confirm", json={**payload, "scope_version": preview.json()["scope_version"]})
        assert confirmed.status_code == 200 and confirmed.json()["completed"]
        reopened = await client.get("/api/v1/performance/review/calibration-tasks?cycle_id=1")
        assert [item["status"] for item in reopened.json()["tasks"]][:2] == ["completed", "pending"]
        denied = await client.post(path + "/preview", json={**payload, "scope_key": "bad"})
        assert denied.status_code == 404 and denied.json()["detail"] == "TASK_NOT_FOUND"
        invalid = await client.post(path + "/preview", json={**payload, "scope_key": ""})
        assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_child_source_and_readonly_cannot_escape_ancestor(data):
    parent = grant(data, 11, 1, "R", source=None, readonly=True)
    child = grant(data, 12, 1, "CHILD", parent=11, source="a")
    data.session.commit()
    data.actor.actor_ref = "CHILD"
    row = (await workspace.list_scopes(data.db, 1, None))["tasks"][0]
    assert row["source_rule_id"] == "a" and row["read_only"]
    parent.authorization_settings = {**parent.authorization_settings, "source_rule_id": "b"}
    data.session.commit()
    assert (await workspace.list_scopes(data.db, 1, None))["tasks"] == []
