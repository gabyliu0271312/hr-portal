from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import Column, JSON, MetaData, Table, create_engine, event, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.performance import member_identity_service as service
from app.performance.models import (
    PerformanceAuditEvent, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson,
    PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceProject,
    PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot,
)


NOW = datetime(2026, 11, 18, tzinfo=UTC)


@pytest.fixture
def identity_db():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    models = [PerformanceProject, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson,
              PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceNodeTask,
              PerformanceNodeTaskAuthorization, PerformanceProjectNodeSnapshot, PerformanceAuditEvent]
    tables = {}
    for model in models:
        tables[model] = Table(model.__tablename__, metadata, *[
            Column(column.name, JSON() if isinstance(column.type, JSONB) else column.type,
                   primary_key=column.primary_key, nullable=True)
            for column in model.__table__.columns
        ])
    metadata.create_all(engine)
    session = Session(engine)
    def insert(model, **values):
        session.execute(tables[model].insert().values(**values))
    for project_id, cycle, snapshot_id, source in [(1, "C1", 10, 100), (2, "C1", 20, 100), (1, "C1", 11, 101)]:
        if snapshot_id != 11:
            insert(PerformanceProject, id=project_id, cycle_ref=cycle, project_ref=f"P{project_id}", name="项目")
        if snapshot_id != 20:
            insert(PerformanceAuthorizationSnapshot, id=source, cycle_ref=cycle, status="LOCKED")
            for index, (no, name) in enumerate([("E1", "员工"), ("M1", "原处理人"), ("G1", "授权人"), ("R1", "接收人"), ("X1", "撤销人")]):
                insert(PerformanceAuthorizationSnapshotPerson, id=source * 10 + index,
                       snapshot_id=source, employee_no=no, display_name=name if source == 100 else "其他快照" + name,
                       employment_status="在职", live_employment_status="离职" if source == 100 and no == "E1" else None)
        insert(PerformanceProjectMemberSnapshot, id=snapshot_id, project_id=project_id, cycle_ref=cycle, source_snapshot_id=source)
        insert(PerformanceProjectMember, id=snapshot_id, snapshot_id=snapshot_id, employee_no="E1", display_name="冻结员工", employment_status="在职")
    for task_id, project_id, snapshot_id in [(1, 1, 10), (2, 2, 20), (3, 1, 11), (4, 1, 10)]:
        insert(PerformanceProjectNodeSnapshot, id=task_id, project_id=project_id, name="校准" if task_id == 1 else "评估", node_type="calibration" if task_id == 1 else "evaluation")
        insert(PerformanceNodeTask, id=task_id, project_id=project_id, cycle_ref="C1", member_snapshot_id=snapshot_id,
               node_snapshot_id=task_id, target_employee_no="E1", handler_ref="M1", task_kind="calibration" if task_id == 1 else "evaluation",
               revoked_at=NOW if task_id == 4 else None)
    for record_id, task_id, project_id, status in [(1, 1, 1, "REVOKED"), (2, 1, 1, "REPLACED"), (3, 1, 1, "ACTIVE"),
                                                  (4, 2, 2, "ACTIVE"), (5, 3, 1, "ACTIVE"), (6, 4, 1, "ACTIVE"), (7, 4, 1, "REVOKED")]:
        insert(PerformanceNodeTaskAuthorization, id=record_id, task_id=task_id, project_id=project_id, cycle_ref="C1",
               authorization_type="TRANSFER" if record_id == 3 else "AUTHORIZE", grantor_employee_no="G1", recipient_employee_no="R1",
               status=status, created_at=NOW + timedelta(minutes=record_id), authorization_settings={},
               revoked_by_employee_no="X1" if status == "REVOKED" else None,
               revoked_at=NOW + timedelta(hours=1) if status == "REVOKED" else None)
    insert(PerformanceAuditEvent, id=1, event_type="PERFORMANCE_TASK_TRANSFERRED", cycle_ref="C1", employee_no="E1",
           actor_type="EMPLOYEE", actor_ref="G1", subject_type="PERFORMANCE_NODE_TASK", subject_ref="1",
           after_state={"project_id": 1, "authorization_id": "3", "initiator_name": "审计授权人", "recipient_name": "审计接收人"},
           event_at=NOW + timedelta(minutes=3))
    # Same task reference in an unrelated project's audit must not supply names/time.
    insert(PerformanceAuditEvent, id=2, event_type="PERFORMANCE_TASK_TRANSFERRED", cycle_ref="C1", employee_no="E1",
           actor_type="EMPLOYEE", actor_ref="X1", subject_type="PERFORMANCE_NODE_TASK", subject_ref="1",
           after_state={"project_id": 2, "authorization_id": "3", "initiator_name": "泄漏姓名"}, event_at=NOW + timedelta(hours=2))
    session.commit()
    queries = []
    event.listen(engine, "before_cursor_execute", lambda conn, cursor, statement, parameters, context, many: queries.append(statement))
    db = SimpleNamespace(execute=AsyncMock(side_effect=lambda query: session.execute(query)), session=session, insert=insert, queries=queries)
    yield db
    session.close()
    engine.dispose()


@pytest.mark.asyncio
async def test_identity_history_includes_calibration_sorted_by_operation_and_keeps_frozen_person(identity_db):
    db = identity_db
    row = {"employee_no": "E1", "employment_status": "在职", "can_authorize": False}
    await service.hydrate_member_identities(db, [(row, 1, 10)])
    identity = row["identity_status"]
    assert identity["live_employment_status"] == "离职"
    assert row["employment_status"] == "在职"
    records = identity["delegations"]
    assert [item["id"] for item in records] == [7, 1, 3, 2]
    assert {item["status"] for item in records} == {"ACTIVE", "REVOKED", "REPLACED"}
    assert records[-1]["stage_name"] == "校准"
    assert records[-1]["operated_at"] == (NOW + timedelta(minutes=3)).isoformat()
    assert records[1]["revoked_by_name"] == "撤销人"
    assert records[2]["operator_name"] == "审计授权人"
    assert records[2]["recipient_name"] == "审计接收人"
    assert records[2]["original_handler_name"] == "原处理人"
    assert set(records[0]) == {"id", "authorization_type", "status", "operator_name", "recipient_name", "original_handler_name", "stage_name", "created_at", "operated_at", "revoked_by_name"}
    assert db.execute.await_count == 4
    assert all(query.lstrip().upper().startswith("SELECT") for query in db.queries)
    frozen = db.session.get(PerformanceProjectMember, 10)
    assert frozen.display_name == "冻结员工" and frozen.employment_status == "在职"
    assert not db.session.dirty


@pytest.mark.asyncio
async def test_project_snapshot_employee_scope_is_exact_and_batch_count_constant(identity_db):
    rows = [{"employee_no": "E1"} for _ in range(20)]
    bindings = [(row, 1, 10) for row in rows[:18]] + [(rows[18], 2, 20), (rows[19], 1, 11)]
    await service.hydrate_member_identities(identity_db, bindings)
    assert {item["id"] for item in rows[0]["identity_status"]["delegations"]} == {1, 2, 3, 7}
    assert [item["id"] for item in rows[18]["identity_status"]["delegations"]] == [4]
    assert [item["id"] for item in rows[19]["identity_status"]["delegations"]] == [5]
    assert rows[19]["identity_status"]["delegations"][0]["original_handler_name"] == "其他快照原处理人"
    assert identity_db.execute.await_count == 4
    invalid = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(invalid, 2, 10)])
    assert invalid["identity_status"] == {"live_employment_status": None, "delegations": []}


@pytest.mark.asyncio
async def test_no_active_authorization_keeps_full_history_for_hidden_labels(identity_db):
    from sqlalchemy import update
    identity_db.session.execute(update(PerformanceNodeTaskAuthorization).where(PerformanceNodeTaskAuthorization.id == 3).values(status="REVOKED", revoked_at=NOW + timedelta(hours=3), revoked_by_employee_no="X1"))
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)])
    records = row["identity_status"]["delegations"]
    assert records and not any(item["status"] == "ACTIVE" for item in records)
    assert records[0]["id"] == 3 and records[0]["revoked_by_name"] == "撤销人"


@pytest.mark.asyncio
async def test_plain_reviewer_only_gets_live_status_not_reviewee_history(identity_db):
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], include_delegations=False)
    assert row["identity_status"] == {"live_employment_status": "离职", "delegations": []}
    assert identity_db.execute.await_count == 1


@pytest.mark.asyncio
async def test_live_fallback_unknown_and_empty_are_not_rewritten(identity_db):
    rows = [{"employee_no": "M1", "employment_status": "离职"}, {"employee_no": "MISSING", "employment_status": "未知"}]
    await service.hydrate_member_identities(identity_db, [(row, 1, 10) for row in rows])
    assert rows[0]["identity_status"]["live_employment_status"] == "在职"
    assert rows[0]["employment_status"] == "离职"
    assert rows[1]["identity_status"]["live_employment_status"] == "未知"
    identity_db.execute.reset_mock()
    await service.hydrate_member_identities(identity_db, [])
    identity_db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_project_list_hydrates_only_authorized_current_page(monkeypatch):
    from app.performance import projects_router as routes
    project = SimpleNamespace(id=1)
    items = [routes.ProjectMemberResponse(id=i, root_review_id=i, project_id=1, employee_no=f"E{i}", display_name=f"员工{i}") for i in range(1, 4)]
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=project))
    scope = AsyncMock(return_value={"E1", "E2", "E3"})
    monkeypatch.setattr(routes, "_project_data_scope", scope)
    rows = AsyncMock(return_value=(items, []))
    monkeypatch.setattr(routes, "_project_member_rows", rows)
    hydrate = AsyncMock()
    monkeypatch.setattr(routes, "hydrate_project_member_rows", hydrate)
    page = await routes.list_project_members(1, keyword=None, page=2, page_size=1, sort_by="hire_date", sort_order="desc", context=object(), db=object())
    assert page.total == 3 and page.items[0].employee_no == "E2"
    assert rows.call_args.args[1] == {"E1", "E2", "E3"}
    assert hydrate.await_args.args[1] == [items[1]]


@pytest.mark.asyncio
async def test_denied_list_never_calls_hydration(monkeypatch):
    from app.performance import projects_router as routes
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=SimpleNamespace(id=1)))
    monkeypatch.setattr(routes, "_project_data_scope", AsyncMock(side_effect=HTTPException(403, "PROJECT_DATA_FORBIDDEN")))
    monkeypatch.setattr(routes, "_task_management_scope", AsyncMock(side_effect=HTTPException(403, "PROJECT_DATA_FORBIDDEN")))
    hydrate = AsyncMock()
    monkeypatch.setattr(routes, "hydrate_project_member_rows", hydrate)
    with pytest.raises(HTTPException) as exc:
        await routes.list_project_members(1, keyword=None, page=1, page_size=1, sort_by=None, sort_order=None, context=object(), db=object())
    assert exc.value.status_code == 403
    hydrate.assert_not_awaited()


@pytest.mark.asyncio
async def test_anonymous_360_history_never_exposes_reviewer_authorization(identity_db):
    identity_db.session.execute(update(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.id == 1).values(
        config={"template": {"executor_role_code": "assessment.reviewer_360"}}))
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)])
    assert [item["id"] for item in row["identity_status"]["delegations"]] == [7]
    assert identity_db.execute.await_count == 4


@pytest.mark.asyncio
async def test_member_and_reminder_wrappers_bind_employee_and_project(identity_db):
    valid = {"project_id": 1, "root_review_id": 10, "employee_no": "E1"}
    wrong_employee = {"project_id": 1, "root_review_id": 10, "employee_no": "OTHER"}
    wrong_project = {"project_id": 2, "root_review_id": 10, "employee_no": "E1"}
    await service.hydrate_project_member_rows(identity_db, [valid, wrong_employee, wrong_project])
    assert valid["identity_status"]["live_employment_status"] == "离职"
    assert wrong_employee["identity_status"]["delegations"] == []
    assert wrong_project["identity_status"]["delegations"] == []
    reminder = {"project_id": 1, "task_id": 1, "employee_no": "E1", "reminder_target": "不是被评估人"}
    await service.hydrate_task_people_rows(identity_db, [reminder])
    assert reminder["identity_status"] == valid["identity_status"]
    assert reminder["reminder_target"] == "不是被评估人"


@pytest.mark.asyncio
async def test_replaced_child_operation_uses_existing_parent_revocation_audit(identity_db):
    identity_db.session.execute(update(PerformanceNodeTaskAuthorization).where(PerformanceNodeTaskAuthorization.id == 2).values(
        authorization_settings={"parent_authorization_id": 1}))
    identity_db.insert(PerformanceAuditEvent, id=3, event_type="PERFORMANCE_TASK_AUTHORIZATION_REVOKED", cycle_ref="C1", employee_no="E1",
                       actor_type="EMPLOYEE", actor_ref="X1", subject_type="PERFORMANCE_NODE_TASK", subject_ref="1",
                       after_state={"project_id": 1, "authorization_id": "1"}, event_at=NOW + timedelta(minutes=2, seconds=30))
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)])
    child = next(item for item in row["identity_status"]["delegations"] if item["id"] == 2)
    assert child["operated_at"] == (NOW + timedelta(minutes=2, seconds=30)).isoformat()
    assert child["status"] == "REPLACED"


@pytest.mark.asyncio
async def test_reminder_endpoint_hydrates_only_selected_page(monkeypatch, identity_db):
    from app.performance import projects_router as routes
    items = [{"project_id": 1, "task_id": 1, "employee_no": "E1"}, {"project_id": 2, "task_id": 2, "employee_no": "E1"}]
    monkeypatch.setattr(routes, "_completion_reminder_rows", AsyncMock(return_value=items))
    page = await routes.project_management_reminder_people(1, "manager-review", None, None, 1, 1, object(), identity_db)
    assert page["total"] == 2 and len(page["items"]) == 1
    assert page["items"][0]["identity_status"]["live_employment_status"] == "离职"
    assert "identity_status" not in items[1]


@pytest.mark.asyncio
async def test_result_opening_hydrates_reviewee_after_permission_and_paging(monkeypatch, identity_db):
    from app.performance import projects_router as routes
    project = SimpleNamespace(id=1, name="项目")
    member = SimpleNamespace(snapshot_id=10, employee_no="E1", display_name="员工")
    denied = SimpleNamespace(snapshot_id=11, employee_no="DENIED", display_name="隐藏人员")
    monkeypatch.setattr(routes, "_opening_project_members", AsyncMock(return_value=[(project, member), (project, denied)]))
    monkeypatch.setattr(routes, "_opening_access_grants", AsyncMock(return_value=[(SimpleNamespace(is_active=True, function_permission_keys=["performance.frontend.result-open"]), None)]))
    monkeypatch.setattr(routes, "_result_opening_candidates", AsyncMock(return_value=([], {(1, "DENIED"): "RESULT_OPEN_FORBIDDEN"})))
    monkeypatch.setattr(routes, "_opening_state", AsyncMock(return_value=None))
    async def opening_rows(rows, *args):
        return [routes.ResultOpeningPerson(employee_no=person.employee_no, display_name=person.display_name, project_id=project.id, project_name=project.name, can_open=True) for project, person in rows], []
    monkeypatch.setattr(routes, "_result_opening_rows", opening_rows)
    result = await routes.result_opening_people(1, page=1, page_size=1, keyword=None, context=object(), db=identity_db)
    assert result.total == 1
    assert result.items[0].identity_status["live_employment_status"] == "离职"
    assert {record["id"] for record in result.items[0].identity_status["delegations"]} == {1, 2, 3, 7}


@pytest.mark.asyncio
async def test_feedback_reviewee_and_invite_reviewer_use_different_history_boundary(monkeypatch, identity_db):
    from app.performance import review_360_feedback_router as feedback
    from app.performance import review_360_invites_router as invites
    project = SimpleNamespace(id=1, cycle_ref="C1", settings={})
    node = SimpleNamespace(id=1, node_id="360", node_type="evaluation", config={})
    person = SimpleNamespace(employee_no="E1", display_name="员工", direct_supervisor_employee_no=None,
                             department=None, company_org=None, job_family=None, job_category=None, position_level=None)
    task = SimpleNamespace(id=1, target_employee_no="E1", handler_ref="E1", member_snapshot_id=10,
                           status="pending", submitted_at=None, due_at=None)
    for module in (feedback, invites):
        for name, result in [("_get_project", project), ("_locked_snapshot", SimpleNamespace(id=100)),
                             ("_evaluation_node", node), ("_project_nodes", [node]),
                             ("_latest_member_snapshot_id", 10), ("_snapshot_people", [person])]:
            monkeypatch.setattr(module, name, AsyncMock(return_value=result))
    monkeypatch.setattr(feedback, "_resolve_cycle_member_employee", AsyncMock(return_value="ACTOR"))
    monkeypatch.setattr(feedback, "_reviewer_tasks", AsyncMock(return_value=[task]))
    monkeypatch.setattr(feedback, "_feedback_source_labels", AsyncMock(return_value={}))
    monkeypatch.setattr(feedback, "_voluntary_permission_error", AsyncMock(return_value=(403, "VOLUNTARY_NOT_ALLOWED")))
    result = await feedback.list_feedback(1, keyword=None, context=object(), db=identity_db)
    assert result.items[0].identity_status["delegations"]
    monkeypatch.setattr(invites, "_resolve_reviewee_employee", AsyncMock(return_value="ACTOR"))
    monkeypatch.setattr(invites, "_invite_tasks", AsyncMock(return_value=[task]))
    monkeypatch.setattr(invites, "_invite_audit_events", AsyncMock(return_value=[SimpleNamespace(
        subject_ref="E1", after_state={"project_id": 1, "source_type": "SELF"}, event_type="REVIEWER_360_INVITED", event_at=NOW)]))
    result = await invites.list_invites(1, keyword=None, context=object(), db=identity_db)
    assert result.items[0].identity_status == {"live_employment_status": "离职", "delegations": []}
