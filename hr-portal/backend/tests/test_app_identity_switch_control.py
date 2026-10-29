import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import Depends, FastAPI
from fastapi.exceptions import HTTPException
from pydantic import ValidationError
from sqlalchemy import Column, MetaData, String, Table, cast, func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db import Base, get_session
from app.core.jwt import create_access_token
from app.identity_switch import service
from app.identity_switch.middleware import IdentitySwitchMiddleware
from app.identity_switch.models import IdentitySwitchFavorite, IdentitySwitchNotificationRun, IdentitySwitchSession, IdentitySwitchSetting
from app.identity_switch.notifications import receiver_is_safe, record_notification
from app.identity_switch.router import ControlPatch, FavoriteCreate, SessionCreate, router
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context, performance_admin_preview_enabled, resolve_trusted_performance_actor
from app.performance.models import (PerformanceAuditEvent, PerformanceIdentityLink, PerformanceCycle, PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceAuthorizationSnapshot, PerformanceOtherSetting)
from app.users.models import Menu, Role, RoleAiCapabilityGrant, RoleMenu, User, UserRole


def test_control_payload_is_strict():
    with pytest.raises(ValidationError):
        ControlPatch(expected_revision=1, request_id="test", others_enabled=None)
    with pytest.raises(ValidationError):
        SessionCreate(employee_no="E1", expected_generation=0, request_id="test", operator_user_id=1)
    with pytest.raises(ValidationError):
        FavoriteCreate(employee_no="E1", operator_user_id=1)
    with pytest.raises(ValidationError):
        ControlPatch(expected_revision=1, request_id="test")


def test_target_identity_has_no_admin_preview(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)
    context = PerformanceAccessContext("EMPLOYEE", 0, "employee", None, ("performance.app",), (), (), effective_employee_no="E001", operator_user_id=17)
    assert not performance_admin_preview_enabled(context)
    actor = asyncio.run(resolve_trusted_performance_actor(None, context, cycle_ref="locked-cycle", require_employee_identity=True))
    assert actor.actor_type == "EMPLOYEE" and actor.actor_ref == "E001"


def test_receiver_conflict_and_incomplete_resolution_fail_closed():
    run = SimpleNamespace(original_receivers=["original"], items=[{"errors": [], "missing_variables": []}])
    receiver = SimpleNamespace(is_active=True, feishu_user_id="original")
    assert not receiver_is_safe(run, receiver)
    receiver.feishu_user_id = "dedicated-test"
    assert receiver_is_safe(run, receiver)
    run.items[0]["errors"] = ["unresolved receiver"]
    assert not receiver_is_safe(run, receiver)


def test_direct_transport_is_blocked_during_switch():
    from app.integrations.feishu.feishu_client import FeishuClient, FeishuClientError
    async def scenario():
        token = service.current_switch.set(service.SwitchCall("s", 17, "E1", "r", "/performance/test"))
        try:
            with pytest.raises(FeishuClientError, match="身份切换"):
                await FeishuClient("unused", "unused").send_text_to_user("original", "must not send")
        finally:
            service.current_switch.reset(token)
    asyncio.run(scenario())


def test_cross_application_header_is_rejected():
    async def scenario():
        app = FastAPI()
        app.add_middleware(IdentitySwitchMiddleware)
        @app.get("/api/v1/users")
        async def users():
            return {"unexpected": True}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
            result = await client.get("/api/v1/users", headers={"X-App-Switch-Session": "forged"})
            assert result.status_code == 403
    asyncio.run(scenario())


def test_postgres_identity_switch_closed_loop(monkeypatch):
    if settings.APP_ENV.lower() == "prod" or settings.DB_HOST not in ("127.0.0.1", "localhost", "::1"):
        pytest.skip("requires a local non-production PostgreSQL")
    asyncio.run(_postgres_scenario(monkeypatch))


async def _postgres_scenario(monkeypatch):
    schema = "pm_t008_test_" + uuid4().hex
    admin_engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
    engine = None
    try:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_async_engine(settings.db_url_async, poolclass=NullPool, connect_args={"server_settings": {"search_path": schema}})
        tables = [User.__table__, Role.__table__, Menu.__table__, UserRole.__table__, RoleMenu.__table__, RoleAiCapabilityGrant.__table__, PerformanceIdentityLink.__table__, PerformanceAuditEvent.__table__, IdentitySwitchSetting.__table__, IdentitySwitchSession.__table__, IdentitySwitchNotificationRun.__table__, IdentitySwitchFavorite.__table__]
        def include(table):
            if table in tables:
                return
            tables.append(table)
            for foreign_key in table.foreign_keys:
                include(foreign_key.column.table)
        for model in (PerformanceCycle, PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceAuthorizationSnapshot, PerformanceOtherSetting):
            include(model.__table__)
        metadata = MetaData()
        roster = Table("test_roster", metadata, Column("employee_no", String), Column("full_name", String), Column("department", String))
        async with engine.begin() as connection:
            await connection.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
            await connection.run_sync(metadata.create_all)
            await connection.execute(roster.insert(), [
                {"employee_no": "E001", "full_name": "employee-one", "department": "A"},
                {"employee_no": "E002", "full_name": "employee-two", "department": "B"},
            ])
        monkeypatch.setattr(service, "roster_statement", lambda: (roster, func.trim(cast(roster.c.employee_no, String)), roster.c.full_name))
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            db.add_all([User(id=i, login_name=name, display_name=name, password_hash="unusable-test-password", is_active=True, feishu_user_id="test-open-id" if i == 40 else None) for i, name in [(10, "admin"), (20, "tester"), (30, "other-super"), (40, "test-receiver")]])
            db.add_all([Role(id=1, name="超级管理员"), Role(id=2, name="tester-role")])
            db.add_all([
                Menu(id=1, code="system", label="system"), Menu(id=2, code="system.auth", label="auth", parent_id=1),
                Menu(id=3, code="performance.app", label="performance"), Menu(id=4, code=service.SWITCH_PERMISSION, label="switch"),
                Menu(id=5, code=service.MANAGEMENT_MENU, label="management", parent_id=2), Menu(id=6, code="system.roles", label="roles", parent_id=2),
            ])
            await db.flush()
            db.add_all([UserRole(user_id=10, role_id=1), UserRole(user_id=30, role_id=1), UserRole(user_id=20, role_id=2)])
            db.add_all([RoleMenu(role_id=1, menu_id=3, can_view=True), RoleMenu(role_id=1, menu_id=6, can_view=True, can_update=True), RoleMenu(role_id=2, menu_id=3, can_view=True)])
            db.add(IdentitySwitchSetting(id=1, admin_operator_user_id=10))
            db.add(PerformanceIdentityLink(portal_user_id=40, employee_no="DEDICATED-TEST"))
            now = datetime.now(UTC)
            db.add(PerformanceCycle(id=1, cycle_ref="cycle-test", name="test-cycle", period_year=2026, period_type="year", start_at=now-timedelta(days=1), end_at=now+timedelta(days=7), lock_rule="IMMEDIATE", status="LOCKED", created_by_type="PORTAL_USER", created_by_ref="10"))
            db.add(PerformanceAuthorizationSnapshot(id=1, cycle_ref="cycle-test", status="LOCKED"))
            await db.flush()
            db.add(PerformanceProject(id=1, project_ref="project-test", cycle_ref="cycle-test", name="test-project", status="STARTED"))
            await db.flush()
            db.add(PerformanceProjectMemberSnapshot(id=1, project_id=1, cycle_ref="cycle-test", snapshot_version=1, source_snapshot_id=1))
            db.add(PerformanceProjectNodeSnapshot(id=1, project_id=1, node_id="summary", node_type="work_summary", name="summary", node_order=1, config={"template": {"content": [{"content_id": "summary", "type": "work_summary", "name": "Summary", "items": [{"id": "work", "label": "Work", "settings": {"required": True}}]}]}}))
            await db.flush()
            db.add_all([PerformanceNodeTask(id=i, project_id=1, cycle_ref="cycle-test", member_snapshot_id=1, node_snapshot_id=1, target_employee_no=number, handler_ref=number, task_kind="work_summary", status="pending") for i, number in [(1,"E001"),(2,"E002")]])
            await db.commit()
        app = FastAPI()
        app.add_middleware(IdentitySwitchMiddleware, session_factory=factory)
        app.include_router(router, prefix="/api/v1")
        from app.performance.projects_router import router as projects_router
        app.include_router(projects_router, prefix="/api/v1")
        from app.roles.router import router as roles_router
        app.include_router(roles_router, prefix="/api/v1")
        async def session_override():
            async with factory() as db:
                try:
                    yield db
                except Exception:
                    await db.rollback()
                    raise
        app.dependency_overrides[get_session] = session_override
        @app.get("/api/v1/performance/probe")
        async def probe(context=Depends(get_performance_access_context), db=Depends(get_session)):
            actor = await resolve_trusted_performance_actor(db, context)
            return {"employee_no": actor.actor_ref, "operator": context.operator_user_id, "permissions": context.permission_codes, "preview": performance_admin_preview_enabled(context)}
        auth = lambda i: {"Authorization": "Bearer " + create_access_token(i)}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
            async def patch(user_id, revision, key, **values):
                return await client.patch("/api/v1/identity-switch/control", headers=auth(user_id), json={"expected_revision": revision, "request_id": key, **values})
            control = await client.get("/api/v1/identity-switch/control", headers=auth(10))
            assert control.status_code == 200 and not control.json()["others_enabled"]
            assert (await client.get("/api/v1/identity-switch/control", headers=auth(30))).status_code == 403
            async def start(user_id, key, generation=0):
                return await client.post("/api/v1/performance/identity-switch/sessions", headers=auth(user_id), json={"employee_no": "E001", "expected_generation": generation, "request_id": key})
            own = await start(10, "admin-session")
            assert own.status_code == 201, own.text
            own_header = auth(10) | {"X-App-Switch-Session": own.json()["session_token"]}
            target = await client.get("/api/v1/performance/probe", headers=own_header)
            assert target.status_code == 200, target.text
            assert target.json() == {"employee_no": "E001", "operator": 10, "permissions": [], "preview": False}
            draft = await client.patch("/api/v1/performance/tasks/1/self-summary/draft", headers=own_header, json={"answers": {"work": "verified-real-write"}})
            assert draft.status_code == 200, draft.text
            denied_write = await client.patch("/api/v1/performance/tasks/2/self-summary/draft", headers=own_header, json={"answers": {"work": "must-not-write"}})
            assert denied_write.status_code == 404
            submitted = await client.post("/api/v1/performance/tasks/1/self-summary/submit", headers=own_header, json={"answers": {"work": "verified-real-write"}, "version": draft.json()["version"]})
            assert submitted.status_code == 200, submitted.text
            async with factory() as db:
                task = await db.get(PerformanceNodeTask, 1)
                assert task.status == "completed" and "verified-real-write" in task.answers["work"]
                assert (await db.get(PerformanceNodeTask, 2)).status == "pending"
                assert (await db.get(PerformanceAuthorizationSnapshot, 1)).status == "LOCKED"
                events = list((await db.execute(select(PerformanceAuditEvent).where(PerformanceAuditEvent.event_type == "IDENTITY_SWITCH_BUSINESS_WRITE"))).scalars())
                assert len(events) == 2
                assert all(event.actor_ref == "10" and event.after_state["identity_switch"]["effective_employee_no"] == "E001" for event in events)
            assert (await start(20, "denied")).status_code == 403
            enabled = await patch(10, 1, "enable", others_enabled=True)
            assert enabled.status_code == 200
            payload = {"menus": [{"menu_id": 3}, {"menu_id": 4}], "identity_switch_generation": 0}
            granted = await client.put("/api/v1/roles/2", headers=auth(10), json=payload)
            assert granted.status_code == 200, granted.text
            other = await start(20, "tester-session")
            assert other.status_code == 201, other.text
            old_secret = other.json()["session_token"]
            removed = await client.put("/api/v1/roles/2", headers=auth(10), json={"menus": [{"menu_id": 3}], "identity_switch_generation": 0})
            assert removed.status_code == 200
            assert (await client.put("/api/v1/roles/2", headers=auth(10), json=payload)).status_code == 200
            assert (await client.get("/api/v1/performance/probe", headers=auth(20) | {"X-App-Switch-Session": old_secret})).status_code == 410
            assert (await client.get("/api/v1/performance/identity-switch/favorites", headers=auth(20))).json()["items"] == []
            added = await client.post("/api/v1/performance/identity-switch/favorites", headers=auth(20), json={"employee_no": "E002"})
            assert added.status_code == 201, added.text
            assert added.json() == {"employee_no": "E002", "display_name": "employee-two", "organization_label": "B"}
            assert (await client.post("/api/v1/performance/identity-switch/favorites", headers=auth(20), json={"employee_no": "E002"})).status_code == 201
            assert [item["employee_no"] for item in (await client.get("/api/v1/performance/identity-switch/favorites", headers=auth(20))).json()["items"]] == ["E002"]
            assert (await client.get("/api/v1/performance/identity-switch/favorites", headers=auth(10))).json()["items"] == []
            assert (await client.post("/api/v1/performance/identity-switch/favorites", headers=auth(20), json={"employee_no": "MISSING"})).status_code == 404
            assert (await client.delete("/api/v1/performance/identity-switch/favorites/E002", headers=auth(20))).status_code == 204
            assert (await client.get("/api/v1/performance/identity-switch/favorites", headers=auth(20))).json()["items"] == []
            other = await start(20, "tester-new-session")
            assert other.status_code == 201
            closed = await patch(10, 2, "disable", others_enabled=False, confirm_clear=True)
            assert closed.status_code == 200 and closed.json()["cleared_role_count"] == 1
            assert (await client.get("/api/v1/performance/probe", headers=auth(20) | {"X-App-Switch-Session": other.json()["session_token"]})).status_code == 410
            assert (await client.get("/api/v1/performance/probe", headers=own_header)).status_code == 200
            reopened = await patch(10, 3, "reopen", others_enabled=True)
            assert reopened.status_code == 200
            assert (await client.put("/api/v1/roles/2", headers=auth(10), json=payload)).status_code == 409
            assert (await start(20, "after-reopen", 1)).status_code == 403
            forbidden = await client.put("/api/v1/roles/2", headers=auth(10), json={"menus": [{"menu_id": 5}], "identity_switch_generation": 1})
            assert forbidden.status_code == 403
            from app.core.deps import get_user_menus
            async with factory() as db:
                assert service.MANAGEMENT_MENU in [m["code"] for m in await get_user_menus(await db.get(User, 10), db)]
                assert service.MANAGEMENT_MENU not in [m["code"] for m in await get_user_menus(await db.get(User, 30), db)]
            delivery = await patch(10, 4, "allow-test", test_delivery_enabled=True, test_receiver_user_id=40)
            assert delivery.status_code == 200, delivery.text
            call = service.SwitchCall(own.json()["session_id"], 10, "E001", "batch-500", "/performance/start")
            token = service.current_switch.set(call)
            try:
                async with factory() as db:
                    run = await record_notification(db, [{"key": str(i), "title": "started", "content": f"employee {i}", "receiver_count": 1, "errors": [], "missing_variables": []} for i in range(500)], [f"employee:E{i:03}" for i in range(500)])
                    run_id = run.id
                    await db.commit()
            finally:
                service.current_switch.reset(token)
            calls = []
            class Transport:
                async def send_markdown_to_user(self, receiver, title, content):
                    calls.append((receiver, title))
                    return {"code": 0}
            from app.integrations.feishu import feishu_client
            monkeypatch.setattr(feishu_client, "get_feishu_client", lambda: Transport())
            result = await client.post(f"/api/v1/performance/identity-switch/notification-tests/{run_id}/deliver", headers=auth(10), json={"verify_style": True})
            assert result.status_code == 200, result.text
            assert result.json()["planned_count"] == 500 and result.json()["original_delivery_count"] == 0
            assert len(calls) == 2 and all(receiver == "test-open-id" for receiver, _ in calls)
            repeated = await client.post(f"/api/v1/performance/identity-switch/notification-tests/{run_id}/deliver", headers=auth(10), json={"verify_style": True})
            assert repeated.status_code == 200 and len(calls) == 2
            token = service.current_switch.set(service.SwitchCall(call.session_id, 10, "E001", "conflicting-run", call.source))
            try:
                async with factory() as db:
                    conflict = await record_notification(db, [{"key": "conflict", "title": "x", "content": "x", "receiver_count": 1}], ["test-open-id"])
                    conflict_id = conflict.id
                    await db.commit()
            finally:
                service.current_switch.reset(token)
            denied = await client.post(f"/api/v1/performance/identity-switch/notification-tests/{conflict_id}/deliver", headers=auth(10), json={})
            assert denied.status_code == 403 and len(calls) == 2
            # Two independent transactions cannot both commit the same control revision.
            results = await asyncio.gather(patch(10, 5, "race-a", others_enabled=False, confirm_clear=True), patch(10, 5, "race-b", others_enabled=False, confirm_clear=True))
            assert sorted(response.status_code for response in results) == [200, 409]
            async with factory() as db:
                assert await db.scalar(select(func.count()).select_from(User)) == 4
                assert await db.scalar(select(func.count()).select_from(IdentitySwitchSession).where(IdentitySwitchSession.revoked_at.is_not(None))) == 2
                setting = await db.get(IdentitySwitchSetting, 1)
                assert setting.admin_operator_user_id == 10 and setting.generation == 2
                assert (await db.execute(select(PerformanceAuditEvent).where(PerformanceAuditEvent.event_type == "IDENTITY_SWITCH_STARTED"))).scalars().all()
    finally:
        if engine:
            await engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin_engine.dispose()


def test_switch_audit_keeps_operator_and_business_actor():
    from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
    records = []
    token = service.current_switch.set(service.SwitchCall("session", 17, "E001", "request", "/performance/action"))
    try:
        record = PerformanceAuditService(SimpleNamespace(add=records.append)).append_event(
            AuditEventInput(event_type="TEST_SWITCH_ACTION", actor_type="EMPLOYEE", actor_ref="E001"))
        assert record.actor_type == "PORTAL_USER" and record.actor_ref == "17"
        assert record.after_state["identity_switch"]["effective_employee_no"] == "E001"
        assert record.after_state["identity_switch"]["business_actor_ref"] == "E001"
    finally:
        service.current_switch.reset(token)


@pytest.mark.parametrize("matches, allowed", [(["E001"], True), (["E002"], False), (["E001", "E002"], False)])
def test_switched_project_admin_requires_unique_cycle_identity(matches, allowed):
    from app.performance.projects_router import _project_data_scope
    role = SimpleNamespace(code="performance.project_admin", function_permission_keys=["performance.frontend.data-view"])
    class Result:
        def __init__(self, values): self.values = values
        def scalars(self): return self
        def all(self): return self.values
        def __iter__(self): return iter(self.values)
    class Database:
        def __init__(self): self.responses = [[role], matches]
        async def execute(self, statement): return Result(self.responses.pop(0))
    context = PerformanceAccessContext("EMPLOYEE", 0, "same-name", None, ("performance.app",), (), (), effective_employee_no="E001")
    project = SimpleNamespace(id=1, cycle_ref="cycle", administrators=["same-name"], settings={"data_managers": ["PROJECT_ADMIN"]})
    async def scenario():
        if allowed:
            assert await _project_data_scope(context, project, Database(), "performance.frontend.data-view") is None
        else:
            with pytest.raises(HTTPException) as caught:
                await _project_data_scope(context, project, Database(), "performance.frontend.data-view")
            assert caught.value.status_code == 403
    asyncio.run(scenario())


def test_switched_hrbp_filters_organization_and_invisible_people():
    from app.performance.projects_router import _project_data_scope
    values = [
        [SimpleNamespace(code="performance.hrbp", function_permission_keys=["performance.frontend.data-view"])],
        [SimpleNamespace(scope=["A"], invisible_people=["E002"])],
        [SimpleNamespace(employee_no="E001", organization_ref="A"), SimpleNamespace(employee_no="E002", organization_ref="A/child"), SimpleNamespace(employee_no="E003", organization_ref="B")],
    ]
    class Result:
        def __init__(self, rows): self.rows = rows
        def scalars(self): return self
        def all(self): return self.rows
        def __iter__(self): return iter(self.rows)
    class Database:
        async def execute(self, statement): return Result(values.pop(0))
    context = PerformanceAccessContext("EMPLOYEE", 0, "HRBP", None, ("performance.app",), (), (), effective_employee_no="H001")
    project = SimpleNamespace(id=1, cycle_ref="cycle", administrators=[], settings={"data_managers": ["HRBP"]})
    result = asyncio.run(_project_data_scope(context, project, Database(), "performance.frontend.data-view"))
    assert result == {"E001"}
