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
            direct_supervisor_employee_no=None, hrbp_employee_no=None)

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
    assert result["employee_nos"] == ["A"]
    assert [person["value"] for person in result["people"]] == ["A"]
    with pytest.raises(HTTPException) as error:
        await update_focus_group_members(1, 8, FocusGroupMembersPayload(employee_nos=["B"]), context, db)
    assert error.value.status_code == 403 and db.commits == 0
    assert db.group.employee_nos == ["B", "A"] and not db.events
    result = await update_focus_group_members(1, 8, FocusGroupMembersPayload(employee_nos=[]), context, db)
    assert result["employee_nos"] == [] and db.group.employee_nos == ["B"]
    assert db.commits == 1 and db.events[0].before_state == {"employee_nos": ["B", "A"]}
    assert db.events[0].after_state == {"employee_nos": ["B"]}
    assert (await get_focus_group_members(1, 8, context, db))["employee_nos"] == []
    with pytest.raises(HTTPException) as error:
        await get_focus_group_members(2, 8, context, db)
    assert error.value.status_code == 404
    db.group.scope_setting_mode = 0
    with pytest.raises(HTTPException) as error:
        await get_focus_group_members(1, 8, context, db)
    assert error.value.status_code == 409
    with pytest.raises(ValueError):
        FocusGroupMembersPayload(employee_nos=["A"], actor_ref="other")


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
        assert response.status_code == 200 and response.json()["employee_nos"] == ["A"]
        assert (await client.patch(url, json={"employee_nos": ["A"], "actor_ref": "other"})).status_code == 422
        assert (await client.patch(url, json={"employee_nos": ["unknown"]})).status_code == 403
        response = await client.patch(url, json={"employee_nos": []})
        assert response.status_code == 200 and response.json()["employee_nos"] == []
        assert db.group.employee_nos == ["B"] and db.commits == 1
        assert (await client.get(url.replace("cycles/1", "cycles/2"))).status_code == 404
        db.roles[0].is_active = False
        assert (await client.get(url)).status_code == 403
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
