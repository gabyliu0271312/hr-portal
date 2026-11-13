from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.integrations.feishu import notification_service
from app.integrations.feishu.models import FeishuNotificationLog
from app.performance import member_reminders as adapter
from app.performance import projects_router as shared
from app.performance.auth_context import PerformanceAccessContext, TrustedPerformanceActor
from app.performance.models import (
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceIdentityLink,
    PerformanceNodeTask,
    PerformanceNodeTaskAuthorization,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot,
)


def result(values):
    return SimpleNamespace(all=lambda: values, scalars=lambda: SimpleNamespace(all=lambda: values))


def node(node_id=11, kind="work_summary", role=None):
    return PerformanceProjectNodeSnapshot(id=node_id, project_id=1, node_id=f"node-{node_id}",
        node_type=kind, name=f"环节{node_id}", node_order=node_id,
        config={"template": {"executor_role_code": role}} if role else {})


def task(task_id=1, node_id=11, kind="work_summary", handler="E1", **kwargs):
    values = dict(id=task_id, project_id=1, cycle_ref="cycle:1", member_snapshot_id=10,
        node_snapshot_id=node_id, target_employee_no="E1", handler_ref=handler,
        task_kind=kind, phase_id="", status="pending", revoked_at=None, submitted_at=None,
        available_at=None, due_at=None)
    values.update(kwargs)
    return PerformanceNodeTask(**values)


def delegation(task_id, recipient, kind="AUTHORIZE", read_only=False, **kwargs):
    values = dict(task_id=task_id, project_id=1, cycle_ref="cycle:1", status="ACTIVE",
        recipient_employee_no=recipient, authorization_type=kind, read_only=read_only,
        created_at=datetime.now(UTC))
    values.update(kwargs)
    return PerformanceNodeTaskAuthorization(**values)


class Db:
    def __init__(self):
        self.project = PerformanceProject(id=1, project_ref="p1", cycle_ref="cycle:1", name="项目", status="STARTED", settings={})
        self.snapshot = PerformanceProjectMemberSnapshot(id=10, project_id=1, cycle_ref="cycle:1", source_snapshot_id=100)
        self.member = PerformanceProjectMember(id=7, snapshot_id=10, employee_no="E1", display_name="冻结姓名",
            company_org="集团", department="研发", organization_ref="集团/研发", job_family="技术", job_category="研发",
            direct_supervisor_employee_no="M1", hire_date=date(2020, 1, 1), position_level="P5", employee_type="正式")
        self.nodes = {11: node(), 12: node(12, "evaluation", shared.ROLE_REVIEWER_360),
            13: node(13, "evaluation", shared.ROLE_LINE_MANAGER)}
        self.tasks = {1: task(), 2: task(2, 12, "evaluation", "R1"), 3: task(3, 13, "evaluation", "M1")}
        self.people = [PerformanceAuthorizationSnapshotPerson(snapshot_id=100, employee_no=no, display_name=f"姓名{no}", employment_status="在职") for no in ["E1", "R1", "M1", "A1", "T1"]]
        self.delegations = []
        self.logs = []
        self.events = []
        self.queries = []
        self.mapped = {person.employee_no for person in self.people}
        self.commit = AsyncMock()
        self.flush = AsyncMock()

    async def get(self, model, key):
        if model is PerformanceProject:
            return self.project if key == self.project.id else None
        if model is PerformanceProjectMemberSnapshot:
            return self.snapshot if key == self.snapshot.id else None
        if model is PerformanceAuthorizationSnapshot:
            return SimpleNamespace(cycle_ref=self.snapshot.cycle_ref)
        if model is PerformanceProjectNodeSnapshot:
            return self.nodes.get(key)
        if model is PerformanceNodeTask:
            return self.tasks.get(key)
        return None

    async def scalar(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is PerformanceProjectMember:
            values = statement.compile().params
            return self.member if self.member.employee_no in values.values() and self.snapshot.id in values.values() else None
        return self.snapshot.id

    async def execute(self, statement):
        self.queries.append(statement)
        entity = statement.column_descriptions[0]["entity"]
        values = statement.compile().params
        if entity is PerformanceNodeTask:
            return result([(item, self.nodes[item.node_snapshot_id]) for item in self.tasks.values()])
        if entity is PerformanceAuthorizationSnapshotPerson:
            return result(self.people)
        if entity is PerformanceIdentityLink:
            return result(list(self.mapped))
        if entity is PerformanceNodeTaskAuthorization:
            task_ids = next((value for key, value in values.items() if key.startswith("task_id")), [])
            if not isinstance(task_ids, list):
                task_ids = [task_ids]
            return result([item for item in self.delegations if item.task_id in task_ids
                and item.status == "ACTIVE" and item.project_id == self.project.id and item.cycle_ref == self.project.cycle_ref])
        if entity is FeishuNotificationLog:
            ids = values["biz_id_1"]
            cutoff = values["created_at_1"]
            return result([log.biz_id for log in self.logs if log.biz_type == values["biz_type_1"]
                and log.biz_id in ids and not log.is_test and log.status == "success" and log.created_at >= cutoff])
        raise AssertionError(str(statement))

    def add(self, value):
        self.events.append(value)


@pytest.fixture
def environment(monkeypatch):
    db = Db()
    context = PerformanceAccessContext(subject_type="PORTAL_USER", subject_id=8, display_name="操作者",
        account_type=None, portal_entry_permissions=(), role_grants=(), permission_codes=(), effective_employee_no="M1")
    monkeypatch.setattr(shared, "resolve_trusted_performance_actor", AsyncMock(return_value=TrustedPerformanceActor("EMPLOYEE", "M1")))
    monkeypatch.setattr(shared, "_can_manage_project_like_overview", AsyncMock(return_value=True))
    monkeypatch.setattr(shared, "_project_data_scope", AsyncMock(return_value=None))
    monkeypatch.setattr(shared, "load_subject_visibility_rules", AsyncMock(return_value={"leader": ["department"], "other": ["department"]}))
    monkeypatch.setattr(shared, "resolve_subject_visibility_role", AsyncMock(return_value="leader"))
    monkeypatch.setattr(notification_service, "_global_delivery_mode", AsyncMock(return_value="normal"))
    sender = AsyncMock(return_value=(True, None))
    monkeypatch.setattr(shared, "_send_performance_task_reminder", sender)
    return db, context, sender


async def listing(db, context, **kwargs):
    return await adapter.project_member_reminder_tasks(1, "E1", context=context, db=db,
        source_task_id=kwargs.get("source_task_id"), node_id=kwargs.get("node_id"), task_id=kwargs.get("task_id"))


async def sending(db, context, task_ids=None, **kwargs):
    return await adapter.project_member_remind_batch(1, "E1", adapter.MemberReminderBatchPayload(
        task_ids=[1, 2] if task_ids is None else task_ids, **kwargs), context, db)


@pytest.mark.asyncio
async def test_reminder_checks_share_snapshot_queries_and_revalidate_tasks(environment):
    db, context, _sender = environment
    db.info = {}
    assert await adapter.can_remind_member(db.project, "E1", context, db)
    assert await adapter.can_remind_member(db.project, "E1", context, db)
    entities = [query.column_descriptions[0]["entity"] for query in db.queries]
    assert entities.count(PerformanceAuthorizationSnapshotPerson) == 1
    assert entities.count(PerformanceIdentityLink) == 1
    shared._can_manage_project_like_overview.assert_awaited_once()
    shared._project_data_scope.assert_awaited_once()
    for item in db.tasks.values():
        item.status = "completed"
    assert not await adapter.can_remind_member(db.project, "E1", context, db)
    db.info.clear()
    assert not await adapter.can_remind_member(db.project, "E1", context, db)
    entities = [query.column_descriptions[0]["entity"] for query in db.queries]
    assert entities.count(PerformanceAuthorizationSnapshotPerson) == 2
    assert entities.count(PerformanceIdentityLink) == 2


@pytest.mark.asyncio
async def test_preloaded_reminder_checks_batch_queries_and_sending_revalidates(environment):
    db, context, sender = environment
    db.info = {}
    await adapter.preload_member_reminders(db.project, [db.member], context, db)
    assert await adapter.can_remind_member(db.project, "E1", context, db)
    first_count = len(db.queries)
    assert await adapter.can_remind_member(db.project, "E1", context, db)
    assert len(db.queries) == first_count
    entities = [query.column_descriptions[0]["entity"] for query in db.queries]
    assert entities.count(PerformanceNodeTask) == 1
    assert entities.count(PerformanceNodeTaskAuthorization) == 1
    db.delegations = [delegation(1, "UNKNOWN", "TRANSFER")]
    response = await sending(db, context, [1])
    assert response["accepted_task_ids"] == []
    sender.assert_not_awaited()
    assert len(db.queries) > first_count


@pytest.mark.asyncio
async def test_all_member_task_types_are_listed_and_sent_without_self_or_profile_leaks(environment):
    db, context, sender = environment
    response = await listing(db, context)
    assert response["total"] == 2 and response["can_remind"] is True
    assert {item["task_kind"] for item in response["items"]} == {"work_summary", "evaluation"}
    assert {item["reminder_target"] for item in response["items"]} == {"姓名E1", "姓名R1"}
    assert all(item["display_name"] == "冻结姓名" and item["department"] == "研发" for item in response["items"])
    assert all(item["position_level"] is None and item["hire_date"] is None and item["can_authorize"] is False for item in response["items"])
    response = await sending(db, context, [1, 2, 3, 1])
    assert response["accepted_task_ids"] == [1, 2] and response["skipped_task_ids"] == [3]
    assert response["delivery_status"] == "partial_success"
    assert [call.args[0].handler_ref for call in sender.await_args_list] == ["E1", "R1"]
    assert all(call.args[0].member_snapshot_id == 10 for call in sender.await_args_list)
    assert [event.after_state["delivery_status"] for event in db.events] == ["sent", "sent"]


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("target_employee_no", "OTHER"), ("project_id", 2),
    ("member_snapshot_id", 9), ("cycle_ref", "cycle:2"), ("revoked_at", datetime.now(UTC)),
    ("status", "completed"), ("submitted_at", datetime.now(UTC)), ("available_at", datetime.now(UTC) + timedelta(days=1))])
async def test_invalid_tasks_are_never_sent(environment, field, value):
    db, context, sender = environment
    setattr(db.tasks[1], field, value)
    response = await sending(db, context, [1, 99])
    assert response["accepted_task_ids"] == [] and response["skipped_task_ids"] == [1, 99]
    sender.assert_not_awaited()


@pytest.mark.asyncio
async def test_concrete_task_and_node_filters_cannot_cross_snapshot(environment):
    db, context, sender = environment
    assert [item["task_id"] for item in (await listing(db, context, node_id="node-12"))["items"]] == [2]
    assert [item["task_id"] for item in (await listing(db, context, task_id=1))["items"]] == [1]
    response = await sending(db, context, [1, 2], node_id="node-12")
    assert response["accepted_task_ids"] == [2] and response["skipped_task_ids"] == [1]
    db.tasks[1].member_snapshot_id = 9
    with pytest.raises(HTTPException) as exc:
        await listing(db, context, task_id=1)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,read_only,allowed", [("AUTHORIZE", False, True), ("TRANSFER", False, True),
    ("AUTHORIZE", True, False), ("TRANSFER", True, False)])
async def test_manager_handler_access_revalidates_write_authorization(environment, monkeypatch, kind, read_only, allowed):
    db, context, sender = environment
    monkeypatch.setattr(shared, "_can_manage_project_like_overview", AsyncMock(return_value=False))
    monkeypatch.setattr(shared, "resolve_trusted_performance_actor", AsyncMock(return_value=TrustedPerformanceActor("EMPLOYEE", "A1")))
    db.delegations = [delegation(3, "A1", kind, read_only)]
    if allowed:
        response = await listing(db, context, source_task_id=3)
        assert response["can_remind"] is True
        await sending(db, context, [1], source_task_id=3)
        sender.assert_awaited_once()
    else:
        with pytest.raises(HTTPException) as exc:
            await sending(db, context, [1], source_task_id=3)
        assert exc.value.status_code == 403
        assert await adapter.can_remind_member(db.project, "E1", context, db, source_task_id=3) is False
        sender.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("target_employee_no", "OTHER"), ("project_id", 2),
    ("cycle_ref", "cycle:2"), ("revoked_at", datetime.now(UTC)), ("task_kind", "work_summary"),
    ("handler_ref", "OTHER"), ("available_at", datetime.now(UTC) + timedelta(days=1))])
async def test_source_task_is_a_trusted_manager_task_not_a_snapshot_selector(environment, field, value):
    db, context, sender = environment
    setattr(db.tasks[3], field, value)
    with pytest.raises(HTTPException) as exc:
        await sending(db, context, [1], source_task_id=3)
    assert exc.value.status_code == 403
    sender.assert_not_awaited()


@pytest.mark.asyncio
async def test_source_task_can_bind_historical_snapshot_but_cannot_mix_other_snapshot(environment):
    db, context, sender = environment
    db.snapshot.id = db.member.snapshot_id = 9
    db.tasks[3].member_snapshot_id = 9
    db.tasks[1].member_snapshot_id = 9
    response = await sending(db, context, [1, 2], source_task_id=3)
    assert response["accepted_task_ids"] == [1] and response["skipped_task_ids"] == [2]
    assert sender.call_args.args[0].member_snapshot_id == 9


@pytest.mark.asyncio
async def test_manager_scope_does_not_expand_to_all_members(environment, monkeypatch):
    db, context, sender = environment
    monkeypatch.setattr(shared, "_project_data_scope", AsyncMock(return_value={"OTHER"}))
    db.tasks.pop(3)
    with pytest.raises(HTTPException) as exc:
        await listing(db, context)
    assert exc.value.status_code == 403
    assert await adapter.can_remind_member(db.project, "E1", context, db) is False
    sender.assert_not_awaited()


@pytest.mark.asyncio
async def test_readonly_or_unrelated_reviewer_cannot_remind_even_without_source(environment, monkeypatch):
    db, context, sender = environment
    monkeypatch.setattr(shared, "_can_manage_project_like_overview", AsyncMock(return_value=False))
    monkeypatch.setattr(shared, "resolve_trusted_performance_actor", AsyncMock(return_value=TrustedPerformanceActor("EMPLOYEE", "R1")))
    with pytest.raises(HTTPException) as exc:
        await listing(db, context)
    assert exc.value.status_code == 403
    db.delegations = [delegation(3, "R1", read_only=True)]
    with pytest.raises(HTTPException) as exc:
        await sending(db, context)
    assert exc.value.status_code == 403
    sender.assert_not_awaited()


@pytest.mark.asyncio
async def test_effective_transfer_and_writable_authorization_receivers_are_server_resolved(environment):
    db, context, sender = environment
    db.delegations = [delegation(1, "T1", "TRANSFER"), delegation(1, "A1"), delegation(1, "R1", read_only=True)]
    response = await sending(db, context, [1])
    assert response["accepted_task_ids"] == [1]
    assert [call.args[0].handler_ref for call in sender.await_args_list] == ["A1", "T1"]
    assert db.tasks[1].handler_ref == "E1" and db.member.display_name == "冻结姓名"


@pytest.mark.asyncio
async def test_self_task_via_delegation_is_not_remindable(environment):
    db, context, sender = environment
    db.delegations = [delegation(1, "M1")]
    response = await sending(db, context, [1])
    assert response["skipped_task_ids"] == [1]
    sender.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome,key,status", [((True, None), "accepted_task_ids", "success"),
    ((False, "NOTIFICATION_PREVIEW_ONLY"), "preview_task_ids", "preview_only"),
    ((False, "failed"), "failed_task_ids", "failed"),
    ((False, "recorded"), "failed_task_ids", "failed")])
async def test_delivery_result_and_audit_match_sender_without_promoting_previews(environment, outcome, key, status):
    db, context, sender = environment
    sender.return_value = outcome
    response = await sending(db, context, [1])
    assert response[key] == [1] and response["delivery_status"] == status
    if status != "success":
        assert response["accepted_task_ids"] == []
    assert db.events[0].event_type == "PERFORMANCE_TASK_REMINDER_REQUESTED"
    assert db.events[0].after_state["delivery_status"] == ("sent" if status == "success" else status)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("is_test,status,hours,biz_type,skip,expected", [
    (False, "success", 1, "performance_task_reminder", True, True),
    (True, "success", 1, "performance_task_reminder", True, False),
    (False, "failed", 1, "performance_task_reminder", True, False),
    (False, "skipped", 1, "performance_task_reminder", True, False),
    (False, "success", 7, "performance_task_reminder", True, False),
    (False, "success", 1, "other", True, False),
    (False, "success", 1, "performance_task_reminder", False, False),
])
async def test_six_hour_dedup_uses_only_successful_non_test_task_logs(environment, is_test, status, hours, biz_type, skip, expected):
    db, context, sender = environment
    db.logs = [SimpleNamespace(biz_id="1", biz_type=biz_type, is_test=is_test, status=status, created_at=datetime.now(UTC) - timedelta(hours=hours))]
    response = await sending(db, context, [1], skip_recently_reminded=skip)
    assert response["skipped_task_ids"] == ([1] if expected else [])
    assert sender.await_count == int(not expected)
    if skip:
        query = next(query for query in db.queries if query.column_descriptions[0]["entity"] is FeishuNotificationLog)
        sql = str(query.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert "is_test IS false" in sql and "status = 'success'" in sql and "performance_task_reminder" in sql


@pytest.mark.asyncio
async def test_can_remind_member_requires_eligible_tasks_without_sending_or_committing(environment):
    db, context, sender = environment
    assert await adapter.can_remind_member(db.project, "E1", context, db) is True
    for item in db.tasks.values():
        item.status = "completed"
    assert await adapter.can_remind_member(db.project, "E1", context, db) is False
    sender.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["leaver", "unmapped", "missing"])
async def test_unavailable_handlers_are_not_selectable_or_sent(environment, reason):
    db, context, sender = environment
    if reason == "leaver":
        db.people[0].employment_status = "离职"
    elif reason == "unmapped":
        db.mapped.remove("E1")
    else:
        db.people.pop(0)
    item = next(item for item in (await listing(db, context))["items"] if item["task_id"] == 1)
    assert item["selectable"] is False
    response = await sending(db, context, [1])
    assert response["skipped_task_ids"] == [1]
    sender.assert_not_awaited()


def test_empty_prefix_router_contract_and_client_receivers_are_rejected():
    app = FastAPI()
    app.include_router(adapter.router, prefix="/performance")
    schema = app.openapi()
    path = "/performance/projects/{project_id}/members/{employee_no}"
    assert "get" in schema["paths"][path + "/reminder-tasks"]
    assert "post" in schema["paths"][path + "/remind-batch"]
    assert adapter.router.prefix == ""
    assert adapter.MemberReminderBatchPayload(task_ids=[1]).skip_recently_reminded is True
    with pytest.raises(ValidationError):
        adapter.MemberReminderBatchPayload(task_ids=[1], receivers=["CLIENT_EMPLOYEE"])
    with pytest.raises(ValidationError):
        adapter.MemberReminderBatchPayload(task_ids=[])
