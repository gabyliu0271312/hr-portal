from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import Column, JSON, MetaData, String, Table, UniqueConstraint, create_engine, event, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.performance import member_identity_service as service
from app.performance.models import (
    PerformanceAuditEvent, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson,
    PerformanceFocusGroup, PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceProject,
    PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot,
)


NOW = datetime(2026, 11, 18, tzinfo=UTC)


@pytest.fixture
def identity_db():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    models = [PerformanceProject, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson,
              PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceNodeTask,
              PerformanceNodeTaskAuthorization, PerformanceProjectNodeSnapshot, PerformanceAuditEvent, PerformanceFocusGroup]
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
    _insert_tag(identity_db)
    result = await feedback.list_feedback(1, keyword=None, context=_tag_context(), db=identity_db)
    assert result.items[0].identity_status["delegations"]
    assert result.items[0].identity_status["group_tags"][0]["name"] == "人才组"
    monkeypatch.setattr(invites, "_resolve_reviewee_employee", AsyncMock(return_value="ACTOR"))
    monkeypatch.setattr(invites, "_invite_tasks", AsyncMock(return_value=[task]))
    monkeypatch.setattr(invites, "_invite_audit_events", AsyncMock(return_value=[SimpleNamespace(
        subject_ref="E1", after_state={"project_id": 1, "source_type": "SELF"}, event_type="REVIEWER_360_INVITED", event_at=NOW)]))
    result = await invites.list_invites(1, keyword=None, context=_tag_context(), db=identity_db)
    assert result.items[0].identity_status == {"live_employment_status": "离职", "delegations": []}


@pytest.mark.asyncio
async def test_daily_status_refresh_reads_roster_and_reopens_locked_identity_without_changing_snapshot(monkeypatch, identity_db):
    from app.performance import snapshot_service
    from app.scheduler.handlers import get_handler
    db = identity_db
    roster = Table("test_roster", MetaData(), Column("employee_no", String),
                   Column("employment_status", String), Column("active_status", String))
    roster.create(db.session.get_bind())
    db.session.execute(roster.insert(), [
        {"employee_no": " E1 ", "employment_status": "  ", "active_status": " 离职 "},
        {"employee_no": "M1", "employment_status": "在职", "active_status": "in_service"},
    ])
    db.session.execute(update(PerformanceAuthorizationSnapshotPerson).values(live_employment_status="在职"))
    db.session.commit()
    before_members = db.session.execute(select(PerformanceProjectMember.__table__)).all()
    before_tasks = db.session.execute(select(PerformanceNodeTask.__table__)).all()
    before_records = db.session.execute(select(PerformanceNodeTaskAuthorization.__table__)).all()
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: roster)
    handler = get_handler("performance_employment_sync")
    changed, message = await handler(SimpleNamespace(), db, "manual")
    assert changed == 2 and "更新=2" in message
    assert "缺失工号=3" in message
    db.session.commit()
    db.session.expire_all()
    row = {"project_id": 1, "root_review_id": 10, "employee_no": "E1"}
    await service.hydrate_project_member_rows(db, [row])
    assert row["identity_status"]["live_employment_status"] == "离职"
    assert db.session.get(PerformanceAuthorizationSnapshotPerson, 1010).live_employment_status == "离职"
    person = db.session.get(PerformanceAuthorizationSnapshotPerson, 1000)
    assert person.employment_status == "在职" and person.display_name == "员工"
    assert db.session.get(PerformanceAuthorizationSnapshot, 100).status == "LOCKED"
    assert db.session.execute(select(PerformanceProjectMember.__table__)).all() == before_members
    assert db.session.execute(select(PerformanceNodeTask.__table__)).all() == before_tasks
    assert db.session.execute(select(PerformanceNodeTaskAuthorization.__table__)).all() == before_records
    assert (await handler(SimpleNamespace(), db, "cron"))[0] == 0
    assert db.session.execute(select(roster.c.active_status).where(roster.c.employee_no == " E1 ")).scalar_one() == " 离职 "


@pytest.mark.asyncio
async def test_daily_status_refresh_preserves_missing_empty_unknown_and_conflicting_rows(monkeypatch, identity_db):
    from app.performance import snapshot_service
    db = identity_db
    roster = Table("test_roster", MetaData(), Column("employee_no", String),
                   Column("employment_status", String), Column("active_status", String))
    roster.create(db.session.get_bind())
    db.session.execute(roster.insert(), [
        {"employee_no": "E1", "employment_status": "在职", "active_status": "离职"},
        {"employee_no": "M1", "employment_status": None, "active_status": " "},
        {"employee_no": "G1", "employment_status": None, "active_status": "暂停"},
        {"employee_no": "R1", "employment_status": "在职", "active_status": None},
        {"employee_no": "R1", "employment_status": "离职", "active_status": None},
    ])
    db.session.commit()
    before = db.session.execute(select(PerformanceAuthorizationSnapshotPerson.__table__)).all()
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: roster)
    changed, message = await snapshot_service.refresh_live_employment_statuses(db)
    assert changed == 0
    assert all(text in message for text in ("缺失工号=1", "空状态=1", "未知状态=1", "冲突工号=2"))
    assert db.session.execute(select(PerformanceAuthorizationSnapshotPerson.__table__)).all() == before


@pytest.mark.asyncio
@pytest.mark.parametrize("status_field", ["employment_status", "active_status"])
async def test_daily_status_refresh_supports_each_physical_status_field_and_rollback(monkeypatch, identity_db, status_field):
    from app.performance import snapshot_service
    db = identity_db
    roster = Table("test_roster", MetaData(), Column("employee_no", String), Column(status_field, String))
    roster.create(db.session.get_bind())
    db.session.execute(roster.insert().values(employee_no="M1", **{status_field: "已离职"}))
    db.session.commit()
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: roster)
    before = db.session.execute(select(PerformanceAuthorizationSnapshotPerson.__table__)).all()
    assert (await snapshot_service.refresh_live_employment_statuses(db))[0] == 2
    db.session.rollback()
    assert db.session.execute(select(PerformanceAuthorizationSnapshotPerson.__table__)).all() == before
    assert (await snapshot_service.refresh_live_employment_statuses(db))[0] == 2
    db.session.commit()
    with Session(db.session.get_bind()) as reopened:
        assert reopened.get(PerformanceAuthorizationSnapshotPerson, 1001).live_employment_status == "离职"
        assert reopened.get(PerformanceAuthorizationSnapshotPerson, 1001).employment_status == "在职"


@pytest.mark.asyncio
async def test_daily_status_refresh_missing_roster_field_fails_without_writes(monkeypatch, identity_db):
    from app.performance import snapshot_service
    roster = Table("test_roster", MetaData(), Column("employee_no", String))
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: roster)
    with pytest.raises(snapshot_service.EmployeeRosterContractError):
        await snapshot_service.refresh_live_employment_statuses(identity_db)
    assert not identity_db.session.dirty
    assert all(query.lstrip().upper().startswith("SELECT") for query in identity_db.queries)


@pytest.mark.asyncio
async def test_daily_status_refresh_empty_people_has_no_roster_read(monkeypatch):
    from app.performance import snapshot_service
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [])))
    def unavailable():
        raise AssertionError("empty snapshot must not query roster")
    monkeypatch.setattr(snapshot_service, "employee_roster_table", unavailable)
    assert (await snapshot_service.refresh_live_employment_statuses(db))[0] == 0
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_daily_status_job_is_registered_at_shanghai_nine_without_overwriting_existing():
    from app.scheduler.engine import SchedulerEngine
    from app.scheduler.schedule_parser import parse_schedule
    from sqlalchemy.dialects import postgresql
    statements = []
    db = SimpleNamespace(execute=AsyncMock(side_effect=lambda statement: statements.append(statement)), commit=AsyncMock())
    class Context:
        async def __aenter__(self): return db
        async def __aexit__(self, *args): return False
    await SchedulerEngine(Context)._ensure_internal_jobs()
    statement = next(stmt for stmt in statements if stmt.compile().params["kind"] == "performance_employment_sync")
    params = statement.compile().params
    assert len(params["kind"]) <= 32 and params["business_id"] == 0 and params["enabled"]
    assert "ON CONFLICT (kind, business_id) DO NOTHING" in str(statement.compile(dialect=postgresql.dialect()))
    trigger = parse_schedule(params["cron"])
    next_time = trigger.get_next_fire_time(None, datetime(2026, 11, 18, 0, 30, tzinfo=UTC))
    assert str(trigger.timezone) == "Asia/Shanghai"
    assert next_time.hour == 9 and next_time.minute == 0
    assert next_time.astimezone(UTC).hour == 1
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_daily_status_refresh_batches_roster_reads_and_snapshot_updates(monkeypatch, identity_db):
    from app.performance import snapshot_service
    db = identity_db
    roster = Table("test_roster", MetaData(), Column("employee_no", String), Column("active_status", String))
    roster.create(db.session.get_bind())
    numbers = [f"B{index:04d}" for index in range(1001)]
    db.session.execute(roster.insert(), [{"employee_no": no, "active_status": "离职"} for no in numbers])
    for index, no in enumerate(numbers):
        db.insert(PerformanceAuthorizationSnapshotPerson, id=2000 + index, snapshot_id=100,
                  employee_no=no, display_name="批量人员", employment_status="在职", live_employment_status="在职")
    db.session.commit()
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: roster)
    db.execute.reset_mock()
    changed, message = await snapshot_service.refresh_live_employment_statuses(db)
    assert changed == 1001 and "更新=1001" in message
    assert db.execute.await_count == 5
    db.session.commit()
    assert db.session.get(PerformanceAuthorizationSnapshotPerson, 3000).live_employment_status == "离职"


@pytest.mark.asyncio
async def test_daily_status_job_bootstrap_is_idempotent_and_preserves_admin_configuration(identity_db):
    from sqlalchemy import Integer
    from app.scheduler.engine import SchedulerEngine
    from app.scheduler.models import ScheduledJob
    bind = identity_db.session.get_bind()
    metadata = MetaData()
    Table(ScheduledJob.__tablename__, metadata, *[
        Column(column.name, Integer() if column.primary_key else column.type,
               primary_key=column.primary_key, nullable=True)
        for column in ScheduledJob.__table__.columns
    ], UniqueConstraint("kind", "business_id"))
    metadata.create_all(bind)
    class Context:
        async def __aenter__(self):
            self.session = Session(bind)
            return SimpleNamespace(execute=AsyncMock(side_effect=self.session.execute), commit=AsyncMock(side_effect=self.session.commit))
        async def __aexit__(self, *args): self.session.close()
    engine = SchedulerEngine(Context)
    await engine._ensure_internal_jobs()
    with Session(bind) as db:
        job = db.scalar(select(ScheduledJob).where(ScheduledJob.kind == "performance_employment_sync"))
        assert job.cron == "0 9 * * *" and job.enabled
        job.enabled = False
        job.cron = "0 10 * * *"
        db.commit()
    await engine._ensure_internal_jobs()
    with Session(bind) as db:
        jobs = list(db.scalars(select(ScheduledJob)))
        assert len(jobs) == 7
        job = next(job for job in jobs if job.kind == "performance_employment_sync")
        assert job.cron == "0 10 * * *" and job.enabled is False


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["missing_field", "after_update"])
async def test_daily_status_engine_records_failure_rolls_back_and_retries(monkeypatch, identity_db, failure):
    from sqlalchemy import Integer
    from app.performance import snapshot_service
    from app.scheduler import engine as scheduler_module
    from app.scheduler.models import JobRun, ScheduledJob
    bind = identity_db.session.get_bind()
    metadata = MetaData()
    for model in (JobRun, ScheduledJob):
        Table(model.__tablename__, metadata, *[
            Column(column.name, Integer() if column.primary_key else column.type,
                   primary_key=column.primary_key, nullable=True)
            for column in model.__table__.columns
        ])
    metadata.create_all(bind)
    roster = Table("test_roster", MetaData(), Column("employee_no", String), Column("active_status", String))
    roster.create(bind)
    identity_db.session.execute(roster.insert().values(employee_no="M1", active_status="离职"))
    identity_db.session.execute(ScheduledJob.__table__.insert().values(
        id=1, kind="performance_employment_sync", business_id=0, cron="0 9 * * *", enabled=True, payload={}))
    identity_db.session.commit()
    missing = Table("missing_roster", MetaData(), Column("employee_no", String))
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: missing if failure == "missing_field" else roster)

    class Context:
        async def __aenter__(self):
            self.session = Session(bind, expire_on_commit=False)
            return SimpleNamespace(
                get=AsyncMock(side_effect=self.session.get), add=self.session.add,
                execute=AsyncMock(side_effect=self.session.execute), flush=AsyncMock(side_effect=self.session.flush),
                commit=AsyncMock(side_effect=self.session.commit), rollback=AsyncMock(side_effect=self.session.rollback),
                refresh=AsyncMock(side_effect=self.session.refresh))
        async def __aexit__(self, *args): self.session.close()

    engine = scheduler_module.SchedulerEngine(Context)
    monkeypatch.setattr(engine, "_publish_job_events", AsyncMock())
    if failure == "after_update":
        async def explode(*args):
            await snapshot_service.refresh_live_employment_statuses(args[1])
            raise RuntimeError("status refresh transaction failed")
        monkeypatch.setattr(scheduler_module, "get_handler", lambda kind: explode)
    failed = await engine.run_job_now(1, "manual")
    assert failed.status == "failed"
    with Session(bind) as reopened:
        assert reopened.get(ScheduledJob, 1).last_status == "failed"
        assert reopened.get(PerformanceAuthorizationSnapshotPerson, 1001).live_employment_status is None
        assert reopened.get(JobRun, failed.id).status == "failed"
    from app.scheduler.handlers import get_handler
    monkeypatch.setattr(scheduler_module, "get_handler", get_handler)
    monkeypatch.setattr(snapshot_service, "employee_roster_table", lambda: roster)
    succeeded = await engine.run_job_now(1, "retry")
    assert succeeded.status == "success" and succeeded.rows == 2
    with Session(bind) as reopened:
        assert reopened.get(ScheduledJob, 1).last_status == "success"
        assert reopened.get(PerformanceAuthorizationSnapshotPerson, 1001).live_employment_status == "离职"
        assert reopened.get(PerformanceAuthorizationSnapshotPerson, 1001).employment_status == "在职"
        assert [run.status for run in reopened.scalars(select(JobRun).order_by(JobRun.id))] == ["failed", "success"]


def _tag_context(employee="M1", permissions=()):
    from app.performance.auth_context import PerformanceAccessContext
    return PerformanceAccessContext(subject_type="PORTAL_USER", subject_id=99, display_name="同名人员",
                                    account_type=None, portal_entry_permissions=(), role_grants=(),
                                    permission_codes=permissions, effective_employee_no=employee)


def _insert_tag(db, **values):
    db.insert(PerformanceFocusGroup, **{
        "id": 1, "cycle_ref": "C1", "tab": "semester", "name": "人才组", "show_group_tag": True,
        "employee_nos": ["E1"], "view_permission": 1, "followee_user_ids": [], "activity_ids": [],
        "text_color": "#2f0080", "bg_color": "rgba(141,85,237,0.2)", **values,
    })
    db.session.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,followers,actor,visible", [
    (1, [], "M1", True), (2, ["M1"], "M1", True), (2, ["M1"], "R1", False),
    (2, ["99", "同名人员"], "M1", False), (0, ["M1"], "M1", False), (3, ["M1"], "M1", False),
])
async def test_group_tags_modes_use_trusted_employee_and_fail_closed(identity_db, mode, followers, actor, visible):
    _insert_tag(identity_db, view_permission=mode, followee_user_ids=followers)
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], context=_tag_context(actor),
                                           verified_view_keys={(1, 10, "E1")})
    assert bool(row["identity_status"].get("group_tags")) is visible
    if visible:
        assert row["identity_status"]["group_tags"] == [{"group_id": 1, "name": "人才组", "text_color": "#2f0080", "bg_color": "rgba(141,85,237,0.2)"}]
    else:
        assert "group_tags" not in row["identity_status"]


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["disabled", "other_cycle", "other_project", "unknown_tab", "empty_binding", "not_member", "invalid_snapshot", "no_context", "denied_view"])
async def test_group_tags_never_expose_hidden_group_metadata(identity_db, change):
    options = {
        "disabled": {"show_group_tag": False}, "other_cycle": {"cycle_ref": "C2"},
        "other_project": {"tab": "project", "activity_ids": ["2"]}, "unknown_tab": {"tab": "other"},
        "empty_binding": {"tab": "project"}, "not_member": {"employee_nos": ["M1"]},
    }
    _insert_tag(identity_db, **options.get(change, {}))
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 20 if change == "invalid_snapshot" else 10)],
                                           context=None if change == "no_context" else _tag_context(),
                                           verified_view_keys=set() if change == "denied_view" else {(1, 10, "E1")})
    assert "group_tags" not in row["identity_status"]


@pytest.mark.asyncio
@pytest.mark.parametrize("binding", ["id", "ref", "project_ref"])
async def test_group_tags_project_binding_isolated_and_current_configuration_reopens(identity_db, binding):
    db = identity_db
    _insert_tag(db, tab="project", **({"project_ref": "P1"} if binding == "project_ref" else {"activity_ids": ["1" if binding == "id" else "P1"]}))
    async def read():
        rows = [{"employee_no": "E1"}, {"employee_no": "E1"}]
        await service.hydrate_member_identities(db, [(rows[0], 1, 10), (rows[1], 2, 20)], context=_tag_context(),
                                               verified_view_keys={(1, 10, "E1"), (2, 20, "E1")})
        assert "group_tags" not in rows[1]["identity_status"]
        return rows[0]["identity_status"].get("group_tags", [])
    assert (await read())[0]["name"] == "人才组"
    db.session.execute(update(PerformanceFocusGroup).values(name="改名组", text_color="rgb(1, 2, 3)", bg_color="#abcd"))
    db.session.commit()
    assert await read() == [{"group_id": 1, "name": "改名组", "text_color": "rgb(1, 2, 3)", "bg_color": "#abcd"}]
    db.session.execute(update(PerformanceFocusGroup).values(employee_nos=[]))
    db.session.commit()
    assert await read() == []
    db.session.execute(update(PerformanceFocusGroup).values(employee_nos=["E1"]))
    db.session.commit()
    assert await read()
    from sqlalchemy import delete
    db.session.execute(delete(PerformanceFocusGroup))
    db.session.commit()
    assert await read() == []
    assert db.session.get(PerformanceProjectMember, 10).display_name == "冻结员工"


@pytest.mark.asyncio
@pytest.mark.parametrize("color", ["red; background:url(https://invalid)", "var(--secret)", "rgb(999,0,0)", "rgba(1,2,3,2)", "url(x)", "rgba(1,2,3)"])
async def test_group_tags_colors_reject_arbitrary_css(identity_db, color):
    _insert_tag(identity_db, text_color=color, bg_color=color)
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], context=_tag_context(), verified_view_keys={(1, 10, "E1")})
    tag = row["identity_status"]["group_tags"][0]
    assert tag["text_color"] == "#2f0080" and tag["bg_color"] == "rgba(141,85,237,0.2)"


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [1, 100])
async def test_group_tags_management_scope_runs_once_per_project_after_candidates(identity_db, monkeypatch, count):
    from app.performance import projects_router as routes
    _insert_tag(identity_db)
    rows = [{"employee_no": "E1"} for _ in range(count)]
    scope = AsyncMock(return_value={"E1"})
    monkeypatch.setattr(routes, "_project_data_scope", scope)
    identity_db.execute.reset_mock()
    await service.hydrate_member_identities(identity_db, [(row, 1, 10) for row in rows], context=_tag_context())
    scope.assert_awaited_once()
    assert identity_db.execute.await_count == 5
    assert all(row["identity_status"]["group_tags"][0]["group_id"] == 1 for row in rows)
    scope.reset_mock()
    identity_db.session.execute(update(PerformanceFocusGroup).values(show_group_tag=False))
    await service.hydrate_member_identities(identity_db, [(rows[0], 1, 10)], context=_tag_context())
    scope.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", [1, 2])
async def test_group_tags_follower_does_not_grant_performance_access(identity_db, monkeypatch, mode):
    from app.performance import projects_router as routes
    _insert_tag(identity_db, view_permission=mode, followee_user_ids=["M1"])
    scope = AsyncMock(side_effect=HTTPException(403, "PROJECT_DATA_FORBIDDEN"))
    monkeypatch.setattr(routes, "_project_data_scope", scope)
    row = {"employee_no": "E1", "can_authorize": True, "can_open": True}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], context=_tag_context())
    assert "group_tags" not in row["identity_status"]
    scope.assert_awaited_once()


@pytest.mark.asyncio
async def test_group_tags_verified_task_reviewee_needs_no_management_permission(identity_db, monkeypatch):
    from app.performance import projects_router as routes
    _insert_tag(identity_db)
    scope = AsyncMock(side_effect=AssertionError("already verified task detail"))
    monkeypatch.setattr(routes, "_project_data_scope", scope)
    row = {"employee_no": "E1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], context=_tag_context(), verified_view_keys={(1, 10, "E1")})
    assert row["identity_status"]["group_tags"][0]["name"] == "人才组"
    scope.assert_not_awaited()


@pytest.mark.asyncio
async def test_group_tags_anonymous_reviewer_stays_live_only(identity_db):
    _insert_tag(identity_db, employee_nos=["M1"])
    row = {"employee_no": "M1"}
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], include_delegations=False)
    assert row["identity_status"] == {"live_employment_status": "在职", "delegations": []}


@pytest.mark.asyncio
async def test_group_tags_cycle_and_snapshot_mismatch_do_not_share_membership(identity_db):
    db = identity_db
    _insert_tag(db)
    db.insert(PerformanceProject, id=3, cycle_ref="C2", project_ref="P3", name="另一周期")
    db.insert(PerformanceAuthorizationSnapshot, id=200, cycle_ref="C2", status="LOCKED")
    db.insert(PerformanceAuthorizationSnapshotPerson, id=4000, snapshot_id=200, employee_no="E1", display_name="另一周期员工", employment_status="在职")
    db.insert(PerformanceProjectMemberSnapshot, id=30, project_id=3, cycle_ref="C2", source_snapshot_id=200)
    db.insert(PerformanceProjectMember, id=30, snapshot_id=30, employee_no="E1", display_name="另一周期员工")
    db.session.commit()
    rows = [{"employee_no": "E1"} for _ in range(3)]
    await service.hydrate_member_identities(db, [(rows[0], 1, 10), (rows[1], 3, 30), (rows[2], 1, 30)],
                                           context=_tag_context(), verified_view_keys={(1, 10, "E1"), (3, 30, "E1"), (1, 30, "E1")})
    assert rows[0]["identity_status"]["group_tags"]
    assert all("group_tags" not in row["identity_status"] for row in rows[1:])


@pytest.mark.asyncio
async def test_group_tags_verified_member_wrapper_and_switched_identity_read_again(identity_db):
    _insert_tag(identity_db, view_permission=2, followee_user_ids=["M1"])
    row = {"project_id": 1, "root_review_id": 10, "employee_no": "E1"}
    await service.hydrate_project_member_rows(identity_db, [row], context=_tag_context("M1"), verified_view=True)
    assert row["identity_status"]["group_tags"]
    await service.hydrate_project_member_rows(identity_db, [row], context=_tag_context("R1"), verified_view=True)
    assert "group_tags" not in row["identity_status"]
    assert row["identity_status"]["live_employment_status"] == "离职"


@pytest.mark.asyncio
async def test_group_tags_follower_never_matches_system_account_id(identity_db):
    from dataclasses import replace
    _insert_tag(identity_db, view_permission=2, followee_user_ids=["99"])
    row = {"employee_no": "E1"}
    context = replace(_tag_context(None), subject_type="SYSTEM_ACCOUNT")
    await service.hydrate_member_identities(identity_db, [(row, 1, 10)], context=context, verified_view_keys={(1, 10, "E1")})
    assert "group_tags" not in row["identity_status"]


@pytest.mark.asyncio
async def test_task_people_group_tag_uses_admitted_reviewee_not_management_permission(identity_db, monkeypatch):
    from app.performance import projects_router as routes
    db = identity_db
    _insert_tag(db)
    task = db.session.get(PerformanceNodeTask, 2)
    node = db.session.get(PerformanceProjectNodeSnapshot, 2)
    member = db.session.get(PerformanceProjectMember, 20)
    original_execute = db.execute.side_effect
    def execute(query):
        entities = [column["entity"] for column in query.column_descriptions]
        if entities == [PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProjectMember]:
            assert "handler_ref" in str(query) and "performance_node_tasks.project_id = 2" in str(query.compile(compile_kwargs={"literal_binds": True}))
            return SimpleNamespace(all=lambda: [(task, node, member)])
        return original_execute(query)
    db.execute.side_effect = execute
    db.get = AsyncMock(side_effect=db.session.get)
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="M1")))
    for name, value in [("_self_summary_template", {"content": []}), ("_communication_progress_detail", {}),
                        ("_snapshot_supervisor_names", {}), ("_communication_final_rating_values", ([], {})),
                        ("load_subject_visibility_rules", {"other": []}), ("resolve_subject_visibility_role", "other")]:
        monkeypatch.setattr(routes, name, AsyncMock(return_value=value))
    monkeypatch.setattr(routes, "_task_window", lambda *args: (None, None))
    monkeypatch.setattr(routes, "_review_task_status", lambda *args: "pending")
    monkeypatch.setattr(routes, "_task_completed", lambda *args: False)
    forbidden = AsyncMock(side_effect=AssertionError("task view does not require management data view"))
    monkeypatch.setattr(routes, "_project_data_scope", forbidden)
    rows = await routes.workbench_task_people("node", 2, state="all", context=_tag_context(), db=db, keyword=None)
    assert len(rows) == 1 and rows[0]["employee_no"] == "E1"
    assert rows[0]["identity_status"]["group_tags"][0]["name"] == "人才组"
    forbidden.assert_not_awaited()
