from pathlib import Path

import pytest

from app.performance.authorization_service import (
    CYCLE_STATUS_ACTIVE,
    NODE_STATUS_OPEN,
    OBJECT_ACTION_PUBLISH,
    OBJECT_ACTION_WORK_SUMMARY_READ,
    OBJECT_ACTION_RESULT_READ,
    OBJECT_ACTION_TRANSFER_PUBLICATION,
    RECORD_STATUS_PUBLISHED,
    AuditEventInput,
    ObjectAuthorizationRequest,
    PerformanceAuditService,
    PerformanceObjectAuthorizationDenied,
    evaluate_object_authorization,
)
from app.performance.models import (
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    DYNAMIC_IDENTITY_TYPE_SELF,
)


class _AuditDb:
    def __init__(self):
        self.records = []

    def add(self, record):
        self.records.append(record)


def _request(action, *, actor_ref="400", record_status="READY_TO_PUBLISH"):
    return ObjectAuthorizationRequest(
        cycle_ref="PM-T04-TEST",
        employee_no="300",
        actor_type="EMPLOYEE",
        actor_ref=actor_ref,
        action=action,
        cycle_status=CYCLE_STATUS_ACTIVE,
        node_status=NODE_STATUS_OPEN,
        record_status=record_status,
    )


def test_hrbp_can_transfer_but_cannot_directly_publish():
    scopes = {DYNAMIC_IDENTITY_TYPE_HRBP: {"300"}}

    evaluate_object_authorization(
        _request(OBJECT_ACTION_TRANSFER_PUBLICATION),
        scopes,
        is_active_publication_recipient=False,
    )
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_PUBLISH),
            scopes,
            is_active_publication_recipient=False,
        )


def test_transferred_recipient_can_publish_immediately():
    evaluate_object_authorization(
        _request(OBJECT_ACTION_PUBLISH, actor_ref="600"),
        {},
        is_active_publication_recipient=True,
    )


def test_published_result_cannot_be_published_again():
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(
                OBJECT_ACTION_PUBLISH,
                actor_ref="600",
                record_status=RECORD_STATUS_PUBLISHED,
            ),
            {},
            is_active_publication_recipient=True,
        )


def test_out_of_scope_read_is_rejected():
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_WORK_SUMMARY_READ, actor_ref="999"),
            {DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER: {"301"}},
            is_active_publication_recipient=False,
        )


def test_result_read_rejects_360_reviewer_and_unpublished_employee():
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_RESULT_READ, actor_ref="700"),
            {DYNAMIC_IDENTITY_TYPE_REVIEWER_360: {"300"}},
            is_active_publication_recipient=False,
        )
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_RESULT_READ, actor_ref="300"),
            {DYNAMIC_IDENTITY_TYPE_SELF: {"300"}},
            is_active_publication_recipient=False,
        )
    evaluate_object_authorization(
        _request(
            OBJECT_ACTION_RESULT_READ,
            actor_ref="300",
            record_status=RECORD_STATUS_PUBLISHED,
        ),
        {DYNAMIC_IDENTITY_TYPE_SELF: {"300"}},
        is_active_publication_recipient=False,
    )


def test_audit_service_captures_reconstructable_before_and_after_states():
    db = _AuditDb()
    audit = PerformanceAuditService(db)

    record = audit.append_event(
        AuditEventInput(
            event_type="RESULT_PUBLICATION_TRANSFERRED",
            cycle_ref="PM-T04-TEST",
            employee_no="300",
            actor_type="EMPLOYEE",
            actor_ref="400",
            subject_type="EMPLOYEE",
            subject_ref="600",
            before_state={"effective_publisher": {"actor_ref": "200"}},
            after_state={
                "effective_publisher": {"actor_ref": "600"},
                "original_direct_supervisor_employee_no": "200",
                "reason": "原直属上级无法处理",
            },
        )
    )

    assert db.records == [record]
    assert record.before_state["effective_publisher"]["actor_ref"] == "200"
    assert record.after_state["effective_publisher"]["actor_ref"] == "600"
    assert record.after_state["original_direct_supervisor_employee_no"] == "200"


from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException
from app.performance.auth_context import PerformanceAccessContext, TrustedPerformanceActor
from app.performance.feature_authorization import PerformanceFeatureAuthorizationService
from app.performance.authorization_service import PerformanceObjectAuthorizationService
from app.performance.focus_group_members_router import (
    FocusGroupMembersPayload, get_focus_group_members, update_focus_group_members,
)


class _FocusDb:
    def __init__(self):
        self.snapshot = SimpleNamespace(id=1, status="LOCKED")
        self.people = [self.person("actor", "管理员"), self.person("A", "甲"), self.person("B", "乙")]
        self.people[1].direct_supervisor_employee_no = "actor"
        self.roles = [SimpleNamespace(code=code, is_active=True, is_system=True, role_type=kind) for code, kind in (
            ("assessment.line_manager", "ASSESSMENT"), ("performance.hrbp", "MANAGEMENT"), ("performance.project_admin", "MANAGEMENT"),
        )]
        self.group = SimpleNamespace(id=8, name="重点人员", cycle_ref="C", tab="semester", scope_setting_mode=1,
            roles_of_managing_scope=["leader"], activity_ids=[], project_ref=None, employee_nos=["B", "A"])
        self.projects = []
        self.members = {3: {"A"}, 4: {"B"}}
        self.permission = None
        self.events = []
        self.commits = 0

    @staticmethod
    def person(no, name):
        return SimpleNamespace(employee_no=no, display_name=name, department="Org", organization_ref="Org/Team",
            direct_supervisor_employee_no=None, hrbp_employee_no=None, department_2="一级", department_5="末级",
            job_family="序列", job_category="研发", position_level=None, hire_date=None)

    async def scalar(self, statement):
        text = str(statement)
        if "FROM performance_focus_groups" in text:
            params = statement.compile().params
            return self.group if params.get("cycle_ref_1") == self.group.cycle_ref else None
        if "FROM performance_authorization_snapshots" in text:
            return self.snapshot
        if "FROM performance_hrbp_permissions" in text:
            return self.permission
        if "FROM performance_project_member_snapshots" in text:
            return SimpleNamespace(id=statement.compile().params["project_id_1"])
        raise AssertionError(text)

    async def execute(self, statement):
        text = str(statement)
        if "FROM performance_focus_groups" in text:
            rows = [self.group] if self.group.scope_setting_mode == 1 else []
        elif "FROM performance_authorization_snapshot_people" in text:
            rows = self.people
        elif "FROM performance_roles" in text:
            rows = self.roles
        elif "FROM performance_projects" in text:
            rows = self.projects
        elif "FROM performance_project_members" in text:
            rows = list(self.members[statement.compile().params["snapshot_id_1"]])
        elif "FROM performance_audit_events" in text:
            rows = self.events
        elif "FROM users" in text:
            params = statement.compile().params
            ids = []
            for value in params.values():
                if isinstance(value, list):
                    ids.extend(v for v in value if str(v).isdigit())
                elif str(value).isdigit():
                    ids.append(value)
            rows = [SimpleNamespace(id=int(value), display_name="管理员") for value in ids]
        else:
            raise AssertionError(text)
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

    async def get(self, model, pk):
        from app.performance.models import PerformanceCycle
        return SimpleNamespace(id=pk, cycle_ref="C" if pk == 1 else "OTHER") if model is PerformanceCycle else None

    def add(self, event):
        self.events.append(event)

    async def commit(self):
        self.commits += 1


@pytest.fixture
def focus_auth(monkeypatch):
    db = _FocusDb()
    context = PerformanceAccessContext("PORTAL_USER", 9, "管理员", None, ("performance.app",), (), ())
    actor = AsyncMock(return_value=TrustedPerformanceActor("EMPLOYEE", "actor"))
    monkeypatch.setattr("app.performance.authorization_service.resolve_trusted_performance_actor", actor)
    monkeypatch.setattr("app.performance.hrbp_scope_service.global_hrbp_invisible_people", AsyncMock(return_value=set()))
    service = PerformanceObjectAuthorizationService(db)
    async def scopes(cycle_ref, *, actor_type, actor_ref, identity_type):
        assert cycle_ref == "C" and actor_type == "EMPLOYEE" and actor_ref == "actor"
        targets = {"DIRECT_MANAGER": [("EMPLOYEE", "A")], "HRBP": [("EMPLOYEE", "A")], "PROJECT_ADMIN": [("PROJECT", "P4")]}
        return [SimpleNamespace(target_type=kind, target_ref=ref) for kind, ref in targets.get(identity_type, [])]
    service.snapshot_service.resolve_scopes = scopes
    facade = PerformanceFeatureAuthorizationService(db, object_authorization=service)
    return db, context, actor, facade


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [None, "DRAFT", "SYNCED"])
async def test_focus_facade_rejects_missing_or_unlocked_snapshot(focus_auth, status):
    db, context, _, facade = focus_auth
    db.snapshot = None if status is None else SimpleNamespace(id=1, status=status)
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)


@pytest.mark.asyncio
async def test_focus_direct_scope_and_disabled_directory(focus_auth):
    db, context, actor, facade = focus_auth
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert [person.employee_no for person in people] == ["A"]
    actor.assert_awaited_once_with(db, context, cycle_ref="C", require_employee_identity=True)
    db.roles[0].is_active = False
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    db.roles[0].is_active = True
    db.group.roles_of_managing_scope = ["assessment.line_manager", "administrator"]
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)


@pytest.mark.asyncio
async def test_focus_admin_with_cycles_manage_gets_full_scope_without_employee_identity(focus_auth):
    db, _, actor, facade = focus_auth
    # 系统管理员：PORTAL_USER + performance.cycles.manage，无员工身份（resolve 不要求 employee）
    admin_context = PerformanceAccessContext(
        "PORTAL_USER", 9, "管理员", None, ("performance.app", "performance.admin"),
        (), ("performance.cycles.manage",),
    )
    _, people = await facade.resolve_focus_group_member_scope(admin_context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"actor", "A", "B"}
    actor.assert_not_awaited()
    # 项目版同样全量放行
    db.group.tab = "project"
    _, people = await facade.resolve_focus_group_member_scope(admin_context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"actor", "A", "B"}
    # 无 cycles.manage 的 PORTAL_USER 仍走原员工门禁（不进入管理员分支）
    db.group.tab = "semester"
    actor.return_value = TrustedPerformanceActor("EMPLOYEE", "actor")
    _, people = await facade.resolve_focus_group_member_scope(focus_auth[1], cycle_ref="C", group=db.group)
    assert [person.employee_no for person in people] == ["A"]


@pytest.mark.asyncio
async def test_focus_rejects_forged_actor_and_cross_cycle(focus_auth):
    db, context, actor, facade = focus_auth
    actor.return_value = TrustedPerformanceActor("EMPLOYEE", "not-in-snapshot")
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="OTHER", group=db.group)
    actor.return_value = TrustedPerformanceActor("SYSTEM_ACCOUNT", "9")
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)


@pytest.mark.asyncio
async def test_focus_hrbp_relation_and_org_grant_hide_person_and_global(focus_auth, monkeypatch):
    db, context, _, facade = focus_auth
    db.group.roles_of_managing_scope = ["hrbp"]
    db.permission = SimpleNamespace(scope=["Org"], invisible_people=["actor"])
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"A", "B"}
    db.permission.invisible_people = ["actor", "A"]
    monkeypatch.setattr("app.performance.hrbp_scope_service.global_hrbp_invisible_people", AsyncMock(return_value={"B"}))
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    db.permission = None
    monkeypatch.setattr("app.performance.hrbp_scope_service.global_hrbp_invisible_people", AsyncMock(return_value=set()))
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"A"}
    db.roles[1].is_active = False
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)


@pytest.mark.asyncio
async def test_focus_admin_display_name_dynamic_assignment_and_project_binding(focus_auth):
    db, context, _, facade = focus_auth
    db.group.roles_of_managing_scope = ["activity_manager"]
    db.projects = [SimpleNamespace(id=3, project_ref="P3", administrators=["管理员"]), SimpleNamespace(id=4, project_ref="P4", administrators=[])]
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"A", "B"}
    db.people.append(db.person("duplicate", "管理员"))
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"B"}
    db.group.tab, db.group.activity_ids = "project", ["3"]
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    db.group.activity_ids = ["4"]
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert {person.employee_no for person in people} == {"B"}
    db.roles[2].is_active = False
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)


@pytest.mark.asyncio
async def test_focus_members_partial_replace_preserves_others_audits_and_rejects(focus_auth, monkeypatch):
    db, context, _, facade = focus_auth
    monkeypatch.setattr("app.performance.focus_group_members_router.PerformanceFeatureAuthorizationService", lambda db: facade)
    result = await get_focus_group_members(1, 8, context, db)
    assert result["employee_nos"] == ["B", "A"]
    assert [person["value"] for person in result["people"]] == ["B", "A"]
    with pytest.raises(HTTPException) as error:
        await update_focus_group_members(1, 8, FocusGroupMembersPayload(employee_nos=["B"]), context, db)
    assert error.value.status_code == 403 and db.commits == 0
    assert db.group.employee_nos == ["B", "A"] and not db.events
    result = await update_focus_group_members(1, 8, FocusGroupMembersPayload(employee_nos=[]), context, db)
    assert result["employee_nos"] == ["B"] and db.group.employee_nos == ["B"]
    assert db.commits == 1 and db.events[0].before_state == {"employee_nos": ["B", "A"]}
    assert db.events[0].after_state == {"employee_nos": ["B"]}
    assert (await get_focus_group_members(1, 8, context, db))["employee_nos"] == ["B"]
    with pytest.raises(HTTPException) as error:
        await get_focus_group_members(2, 8, context, db)
    assert error.value.status_code == 404
    # 周期级规则组允许后台管理员手动移除，但禁止添加新成员
    db.group.scope_setting_mode = 0
    db.group.tab = "semester"
    admin_context = PerformanceAccessContext(
        "PORTAL_USER", 9, "管理员", None, ("performance.app",), (), ("performance.cycles.manage",),
    )
    assert (await get_focus_group_members(1, 8, admin_context, db))["employee_nos"] == ["B"]
    result = await update_focus_group_members(1, 8, FocusGroupMembersPayload(employee_nos=[]), admin_context, db)
    assert result["employee_nos"] == [] and db.commits == 2
    db.group.employee_nos = ["B"]
    with pytest.raises(HTTPException) as error:
        await update_focus_group_members(1, 8, FocusGroupMembersPayload(employee_nos=["A", "B"]), admin_context, db)
    assert error.value.status_code == 403 and db.commits == 2
    with pytest.raises(ValueError):
        FocusGroupMembersPayload(employee_nos=["A"], actor_ref="other")


@pytest.mark.asyncio
async def test_focus_members_keeps_group_nos_not_in_snapshot(focus_auth, monkeypatch):
    """组内成员不在授权快照时仍返回该成员（列表人数与详情页一致，问题 1 场景）。"""
    db, context, _, facade = focus_auth
    monkeypatch.setattr("app.performance.focus_group_members_router.PerformanceFeatureAuthorizationService", lambda db: facade)
    db.group.employee_nos = ["B", "A", "ZZ"]
    result = await get_focus_group_members(1, 8, context, db)
    assert result["employee_nos"] == ["B", "A", "ZZ"]
    people_by_value = {person["value"]: person for person in result["people"]}
    assert list(people_by_value) == ["B", "A", "ZZ"]
    assert people_by_value["ZZ"]["display_name"] == "ZZ"
    assert people_by_value["ZZ"]["direct_supervisor_name"] is None
    assert people_by_value["ZZ"]["department_2"] is None
    assert people_by_value["ZZ"]["department"] is None
    assert people_by_value["ZZ"]["job_sequence"] is None
    assert people_by_value["A"]["display_name"] == "甲"
    # 规则组（scope_setting_mode=0，scope_mode='rule'）：详情页同样能查看成员（问题 1 生产数据形态）
    db.group.scope_setting_mode = 0
    db.group.scope_mode = "rule"
    result = await get_focus_group_members(1, 8, context, db)
    assert result["employee_nos"] == ["B", "A", "ZZ"]
    assert [person["value"] for person in result["people"]] == ["B", "A", "ZZ"]


@pytest.mark.asyncio
async def test_focus_http_contract_uses_real_facade_and_rejects_extra_actor(focus_auth, monkeypatch):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from app.core.db import get_session
    from app.performance.auth_context import get_performance_access_context
    from app.performance.focus_group_members_router import router
    db, context, _, facade = focus_auth
    monkeypatch.setattr("app.performance.focus_group_members_router.PerformanceFeatureAuthorizationService", lambda db: facade)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_performance_access_context] = lambda: context
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        url = "/api/v1/performance/cycles/1/focus-groups/8/members"
        response = await client.get("/api/v1/performance/cycles/1/manageable-focus-groups?tab=semester")
        assert response.status_code == 200 and response.json()["items"] == [{"id": 8, "name": "重点人员", "tab": "semester", "scope_setting_mode": 1}]
        response = await client.get(url)
        assert response.status_code == 200 and response.json()["employee_nos"] == ["B", "A"]
        assert (await client.patch(url, json={"employee_nos": ["A"], "actor_ref": "other"})).status_code == 422
        assert (await client.patch(url, json={"employee_nos": ["unknown"]})).status_code == 403
        response = await client.patch(url, json={"employee_nos": []})
        assert response.status_code == 200 and response.json()["employee_nos"] == ["B"]
        assert db.group.employee_nos == ["B"] and db.commits == 1
        assert (await client.get(url.replace("cycles/1", "cycles/2"))).status_code == 404
        db.roles[0].is_active = False
        # 查看成员不受维护范围角色影响（管理端查看）；手动维护才受角色门禁
        assert (await client.get(url)).status_code == 200
        assert (await client.patch(url, json={"employee_nos": []})).status_code == 403
        response = await client.get("/api/v1/performance/cycles/1/manageable-focus-groups")
        assert response.json() == {"total": 0, "items": []}


@pytest.mark.asyncio
async def test_focus_project_tab_intersects_bound_members_but_semester_does_not(focus_auth):
    db, context, _, facade = focus_auth
    db.projects = [SimpleNamespace(id=4, project_ref="P4", administrators=[])]
    db.group.activity_ids = ["4"]
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert [person.employee_no for person in people] == ["A"]
    db.group.tab = "project"
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    db.members[4] = {"A", "B"}
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert [person.employee_no for person in people] == ["A"]


@pytest.mark.asyncio
async def test_focus_inner_leader_keeps_directs_inside_group_members(focus_auth):
    db, context, _, facade = focus_auth
    db.group.roles_of_managing_scope = ["leader", "inner_leader"]
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert [person.employee_no for person in people] == ["A"]
    db.group.employee_nos = ["B"]
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    db.group.employee_nos = ["B", "A"]


@pytest.mark.asyncio
async def test_focus_inner_leader_project_tab_uses_bound_project_members(focus_auth):
    db, context, _, facade = focus_auth
    db.group.roles_of_managing_scope = ["leader", "inner_leader"]
    db.projects = [SimpleNamespace(id=4, project_ref="P4", administrators=[])]
    db.group.activity_ids = ["4"]
    db.group.tab = "project"
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    db.members[4] = {"A"}
    _, people = await facade.resolve_focus_group_member_scope(context, cycle_ref="C", group=db.group)
    assert [person.employee_no for person in people] == ["A"]


def test_object_authorization_migration_has_immutable_audit_trigger():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0171_performance_object_authorization_audit.py"
    )
    migration = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0170_performance_authorization_snapshots"' in migration
    assert '"performance_publication_transfers"' in migration
    assert '"performance_audit_events"' in migration
    assert "uq_performance_publication_transfer_active_target" in migration
    assert "performance_reject_audit_event_mutation" in migration
    assert "trg_performance_audit_events_immutable" in migration
    assert 'op.drop_table("performance_audit_events")' in migration


def _audit_event(event_id, cycle_ref, actor_ref, before, after, event_at):
    return SimpleNamespace(
        id=event_id, cycle_ref=cycle_ref, event_type="PERFORMANCE_FOCUS_GROUP_MEMBERS_UPDATED",
        actor_type="PORTAL_USER", actor_ref=actor_ref, subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref="8", before_state={"employee_nos": before}, after_state={"employee_nos": after},
        event_at=event_at,
    )


@pytest.mark.asyncio
async def test_focus_change_log_diff_add_remove_and_added_by(focus_auth, monkeypatch):
    """变更记录：一次 updateMembers 事件 diff 成「新增」「移除」两条，操作条件仅移除显示姓名；
    添加人/时间 = 成员最近一次「新增」事件的操作人/时间。"""
    from datetime import UTC, datetime

    from app.performance.focus_group_members_router import (
        get_focus_group_change_log, get_focus_group_change_people, get_focus_group_members,
    )

    db, context, _, facade = focus_auth
    monkeypatch.setattr("app.performance.focus_group_members_router.PerformanceFeatureAuthorizationService", lambda db: facade)
    # hrbp + 组织范围覆盖：A/B 都在可维护范围内
    db.group.roles_of_managing_scope = ["hrbp"]
    db.permission = SimpleNamespace(scope=["Org"], invisible_people=[])
    for person in db.people:
        person.department = "Org"
        person.department_2 = "一级"
        person.department_5 = "末级"
        person.job_family = "序列"
        person.job_category = "研发"
    db.group.employee_nos = ["A", "B"]
    # 最近事件：actor 加入 B（before=[A]，after=[A,B]）
    db.events = [
        _audit_event(3, "C", "9", ["A"], ["A", "B"], datetime(2026, 8, 4, 10, 54, tzinfo=UTC)),
        # 更早事件：同批加入 A + B（before=[], after=[A,B]）→ A 的 added_by 取这条
        _audit_event(1, "C", "9", [], ["A", "B"], datetime(2026, 8, 3, 9, 0, tzinfo=UTC)),
    ]

    log = await get_focus_group_change_log(1, 8, 1, 10, context, db)
    assert log["total"] == 2
    # 倒序：B 加入(事件3) → A/B 同批加入(事件1)
    assert [item["id"] for item in log["items"]] == ["3-add", "1-add"]
    assert log["items"][0]["change_type"] == "新增"
    assert log["items"][0]["condition"] == ""
    assert log["items"][0]["user_ids"] == ["B"]
    assert log["items"][0]["count"] == 1
    assert log["items"][0]["operator"] == "管理员"
    assert log["items"][0]["changed_at"].startswith("2026-08-04T10:54")

    # 移除：事件 diff 出移除记录，操作条件显示被移除成员姓名
    db.events = [
        _audit_event(5, "C", "9", ["A", "B", "C"], ["A", "B"], datetime(2026, 8, 5, 11, 0, tzinfo=UTC)),
    ]
    db.people.append(db.person("C", "丙"))
    log = await get_focus_group_change_log(1, 8, 1, 10, context, db)
    assert len(log["items"]) == 1
    assert log["items"][0]["change_type"] == "移除"
    assert log["items"][0]["condition"] == "丙"
    assert log["items"][0]["user_ids"] == ["C"]

    # 分页（stub DB 不截断行，仅验证 total；分页截断由真实 DB 测试覆盖）
    db.events = [_audit_event(6, "C", "9", [], ["A"], datetime(2026, 8, 6, 12, 0, tzinfo=UTC))]
    log = await get_focus_group_change_log(1, 8, 2, 1, context, db)
    assert log["total"] == 1 and len(log["items"]) == 1

    # 变更人员数展开：按 user_ids 回传快照画像（一级部门 department / 序列 job_sequence 复用上级评估逻辑）
    people = (await get_focus_group_change_people(1, 8, 6, "A,B", context, db))["items"]
    assert [person["employee_no"] for person in people] == ["A", "B"]
    assert people[0]["display_name"] == "甲" and people[0]["department"] == "Org" and people[0]["job_sequence"] == "序列-研发"

    # 分页 / 搜索：末级部门走 organization_ref（前端 leaf_department 复用），keyword 过滤姓名工号部门序列
    paged = await get_focus_group_change_people(1, 8, 6, "A,B", context, db, current=1, size=1)
    assert paged["total"] == 2 and len(paged["items"]) == 1 and paged["items"][0]["employee_no"] == "A"
    assert paged["items"][0]["organization_ref"] is not None
    searched = await get_focus_group_change_people(1, 8, 6, "A,B", context, db, keyword="乙")
    assert searched["total"] == 1 and searched["items"][0]["employee_no"] == "B"
    empty = await get_focus_group_change_people(1, 8, 6, "A,B", context, db, keyword="不存在")
    assert empty["total"] == 0 and empty["items"] == []

    # 添加人/添加时间：A 取事件1，B 取事件3
    db.events = [
        _audit_event(3, "C", "9", ["A"], ["A", "B"], datetime(2026, 8, 4, 10, 54, tzinfo=UTC)),
        _audit_event(1, "C", "9", [], ["A", "B"], datetime(2026, 8, 3, 9, 0, tzinfo=UTC)),
    ]
    result = await get_focus_group_members(1, 8, context, db)
    by_no = {person["value"]: person for person in result["people"]}
    assert by_no["B"]["added_by"] == "管理员" and by_no["B"]["added_at"].startswith("2026-08-04")
    assert by_no["A"]["added_at"].startswith("2026-08-03")
