"""Tests for performance focus groups (人员组) API.

- 默认：纯单元级 stub DB 测试（无需数据库，验证路由/校验/权限/序列化）
- 显式 RUN_PERFORMANCE_DB_TEST=1：本地开发库回滚验收（需本机 postgres）
"""
from __future__ import annotations

import pytest

from fastapi import FastAPI


def _permission_context(*permissions: str):
    from app.performance.auth_context import PerformanceAccessContext

    async def active_context() -> PerformanceAccessContext:
        return PerformanceAccessContext(
            subject_type="SYSTEM_ACCOUNT",
            subject_id=1,
            display_name="测试管理员",
            account_type="PERFORMANCE_ADMIN",
            portal_entry_permissions=(),
            role_grants=(),
            permission_codes=list(permissions),
        )

    return active_context


class _StubGroup:
    def __init__(self, group_id, cycle_ref, tab, name, employee_nos, scope_mode, project_ref=None):
        self.id = group_id
        self.cycle_ref = cycle_ref
        self.tab = tab
        self.name = name
        self.en_name = ""
        self.description = {}
        self.followee_user_ids = []
        self.view_permission = 1
        self.scope_setting_mode = 1
        self.scope = None
        self.show_group_tag = False
        self.is_communicate_time = False
        self.start_time = None
        self.end_time = None
        self.employee_nos = employee_nos
        self.scope_mode = scope_mode
        self.project_ref = project_ref
        self.activity_ids = []
        self.roles_of_managing_scope = []
        self.created_by_type = "SYSTEM_ACCOUNT"
        self.created_by_ref = "1"
        self.updated_by_type = "SYSTEM_ACCOUNT"
        self.updated_by_ref = "1"
        from datetime import UTC, datetime
        self.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        self.updated_at = datetime(2026, 1, 1, tzinfo=UTC)


class _StubCycle:
    def __init__(self, cycle_id):
        self.id = cycle_id
        self.cycle_ref = f"cycle:{cycle_id}"


class _StubDb:
    """内存 stub DB：支持路由用到的 get/scalar/execute/add/flush/commit/refresh/delete。"""

    def __init__(self, cycle, groups=None):
        self.cycle = cycle
        self.groups = list(groups or [])
        self._next_id = 100
        self.deleted = []
        self.audit_events = []

    async def get(self, model, ident):
        from app.performance.models import PerformanceCycle
        if model is PerformanceCycle:
            return self.cycle if ident == self.cycle.id else None
        return next((g for g in self.groups if g.id == ident), None)

    async def scalar(self, statement):
        from app.performance.models import PerformanceFocusGroup
        from sqlalchemy.sql.selectable import Select
        if not isinstance(statement, Select):
            return None
        # count(*) 聚合查询：selected_columns 含 count 表达式
        if any(str(clause).startswith("count(") for clause in statement.selected_columns):
            return len(self._filtered(statement))
        column = statement.column_descriptions[0]["entity"]
        if column is PerformanceFocusGroup:
            # 实体查询（duplicate 检测等）：返回首个匹配或 None
            filtered = self._filtered(statement)
            return filtered[0] if filtered else None
        return None

    async def execute(self, statement):
        from app.performance.models import PerformanceFocusGroup
        from sqlalchemy.sql.selectable import Select
        class Result:
            def __init__(self, rows): self.rows = rows
            def scalars(self): return self
            def all(self): return self.rows
        if not isinstance(statement, Select):
            return Result([])
        column = statement.column_descriptions[0]["entity"]
        if column is PerformanceFocusGroup:
            return Result(self._filtered(statement))
        return Result([])

    def _filtered(self, statement):
        rows = list(self.groups)
        for criteria in statement.whereclause.get_children() if statement.whereclause is not None else ():
            self._apply_criteria(rows, criteria)
        # order_by id desc（人员组列表按 id 倒序）
        if statement._order_by_clauses:
            rows.sort(key=lambda g: g.id, reverse=True)
        return rows

    def _apply_criteria(self, rows, criteria):
        from sqlalchemy.sql.elements import BinaryExpression, ColumnElement
        if isinstance(criteria, ColumnElement):
            if isinstance(criteria, BinaryExpression):
                right = criteria.right
                value = None
                if hasattr(right, "value"):
                    value = right.value
                elif hasattr(right, "effective_value"):
                    value = right.effective_value
                else:
                    value = right
                col = criteria.left.name
                if col == "tab":
                    rows[:] = [g for g in rows if g.tab == value]
                elif col == "cycle_ref":
                    rows[:] = [g for g in rows if g.cycle_ref == value]
                elif col == "id":
                    rows[:] = [g for g in rows if g.id != value]
                elif col == "name":
                    if isinstance(value, str) and "%" in value:
                        # ilike('%kw%') 搜索：按子串包含过滤
                        keyword = value.replace("%", "")
                        rows[:] = [g for g in rows if keyword in g.name]
                    else:
                        rows[:] = [g for g in rows if g.name == value]

    def add(self, obj):
        from datetime import UTC, datetime
        from app.performance.models import PerformanceAuditEvent, PerformanceFocusGroup
        if isinstance(obj, PerformanceAuditEvent):
            self.audit_events.append(obj)
            return
        if getattr(obj, "id", None) is None:
            obj.id = self._next_id
            self._next_id += 1
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
        self.groups.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def delete(self, obj):
        self.groups.remove(obj)


def _make_app(session, permissions):
    import httpx
    from fastapi import FastAPI
    from httpx import ASGITransport

    from app.performance import focus_groups_router
    from app.performance.auth_context import get_performance_access_context

    app = FastAPI()
    app.include_router(focus_groups_router.router, prefix="/api/v1")
    app.dependency_overrides[focus_groups_router.get_session] = lambda: session
    app.dependency_overrides[get_performance_access_context] = _permission_context(*permissions)
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_focus_groups_list_create_update_delete():
    from app.performance.models import PerformanceFocusGroup

    db = _StubDb(_StubCycle(1))
    base = "/api/v1/performance/cycles/1/focus-groups"
    async with _make_app(db, ("performance.cycles.manage",)) as client:
        # 空列表
        response = await client.get(base, params={"tab": "semester"})
        assert response.status_code == 200
        assert response.json() == {"total": 0, "items": []}

        # 新建（周期级）
        created = await client.post(base, json={
            "name": "核心研发团队",
            "tab": "semester",
            "description": {"zh-CN": "核心研发团队说明", "en-US": "Core R&D team"},
            "scope_setting_mode": 1,
            "employee_nos": ["E001", "E002", "E001"],
            "scope_mode": "manual",
            "activity_ids": ["7654abc", "7654def"],
            "roles_of_managing_scope": ["leader", "hrbp"],
        })
        assert created.status_code == 201, created.text
        created_body = created.json()
        assert created_body["name"] == "核心研发团队"
        assert created_body["employee_nos"] == ["E001", "E002"]
        assert created_body["tab"] == "semester"
        assert created_body["description"] == {"zh-CN": "核心研发团队说明", "en-US": "Core R&D team"}
        assert created_body["scope_setting_mode"] == 1
        assert created_body["activity_ids"] == ["7654abc", "7654def"]
        assert created_body["roles_of_managing_scope"] == ["leader", "hrbp"]
        group_id = created_body["id"]

        # 列表含新建
        listed = await client.get(base, params={"tab": "semester"})
        assert listed.status_code == 200
        assert listed.json()["total"] == 1
        assert listed.json()["items"][0]["name"] == "核心研发团队"

        # 新建（关联项目级）+ 同名不同 tab 不冲突
        created_project = await client.post(base, json={
            "name": "核心研发团队",
            "tab": "project",
            "scope_setting_mode": 1,
            "employee_nos": [],
            "scope_mode": "manual",
            "project_ref": "project:one",
        })
        assert created_project.status_code == 201, created_project.text

        # 同 tab 同名冲突
        duplicate = await client.post(base, json={"name": "核心研发团队", "tab": "semester", "scope_setting_mode": 1, "employee_nos": []})
        assert duplicate.status_code == 409

        # 编辑
        updated = await client.patch(f"{base}/{group_id}", json={
            "name": "核心研发团队（扩编）",
            "tab": "semester",
            "scope_setting_mode": 1,
            "description": {"zh-CN": "扩编说明"},
            "employee_nos": ["E003"],
            "scope_mode": "manual",
            "activity_ids": ["7654zzz"],
            "roles_of_managing_scope": ["activity_manager"],
        })
        assert updated.status_code == 200, updated.text
        assert updated.json()["name"] == "核心研发团队（扩编）"
        assert updated.json()["employee_nos"] == ["E003"]
        assert updated.json()["description"] == {"zh-CN": "扩编说明"}
        assert updated.json()["activity_ids"] == ["7654zzz"]
        assert updated.json()["roles_of_managing_scope"] == ["activity_manager"]

        # 搜索
        searched = await client.get(base, params={"tab": "semester", "keyword": "扩编"})
        assert searched.json()["total"] == 1
        searched_miss = await client.get(base, params={"tab": "semester", "keyword": "不存在"})
        assert searched_miss.json()["total"] == 0

        # 分页参数合法（total 正确；截断语义由真实 DB 回滚测试覆盖）
        paged = await client.get(base, params={"tab": "semester", "current": 1, "size": 1})
        assert paged.status_code == 200
        assert paged.json()["total"] == 1

        # 优先级校验
        priority = await client.get(f"{base}/priority-check")
        assert priority.status_code == 200
        assert priority.json() == {"data": True}

        # 删除
        deleted = await client.delete(f"{base}/{group_id}")
        assert deleted.status_code == 204
        after = await client.get(base, params={"tab": "semester"})
        assert after.json()["total"] == 0


async def test_focus_groups_requires_people_groups_permission():
    db = _StubDb(_StubCycle(1))
    base = "/api/v1/performance/cycles/1/focus-groups"
    async with _make_app(db, permissions=()) as client:
        response = await client.get(base, params={"tab": "semester"})
        assert response.status_code == 403
        response = await client.post(base, json={"name": "X", "tab": "semester", "scope_setting_mode": 1, "employee_nos": []})
        assert response.status_code == 403
        response = await client.get(f"{base}/priority-check")
        assert response.status_code == 403


async def test_focus_groups_missing_cycle_404():
    db = _StubDb(_StubCycle(1))
    base = "/api/v1/performance/cycles/999/focus-groups"
    async with _make_app(db, ("performance.cycles.manage",)) as client:
        response = await client.get(base, params={"tab": "semester"})
        assert response.status_code == 404
        response = await client.post(base, json={"name": "X", "tab": "semester", "scope_setting_mode": 1, "employee_nos": []})
        assert response.status_code == 404


async def test_focus_group_payload_validates_feishu_fields_and_time():
    from app.performance.focus_groups_router import FocusGroupPayload
    from pydantic import ValidationError

    payload = FocusGroupPayload.model_validate({
        "name": " 研发组 ",
        "scope_setting_mode": 1,
        "en_name": "R&D",
        "description": {"zh-CN": "研发人员"},
        "followee_user_ids": ["U1", "U1", " U2 "],
        "view_permission": 2,
        "show_group_tag": True,
        "is_communicate_time": True,
        "start_time": "2026-11-01T09:00:00+08:00",
        "end_time": "2026-11-02T18:00:00+08:00",
    })
    assert payload.name == "研发组"
    assert payload.followee_user_ids == ["U1", "U2"]
    with pytest.raises(ValidationError, match="开始时间必须早于截止时间"):
        FocusGroupPayload.model_validate({
            "name": "研发组",
            "scope_setting_mode": 1,
            "is_communicate_time": True,
            "start_time": "2026-11-02T18:00:00+08:00",
            "end_time": "2026-11-01T09:00:00+08:00",
        })


def test_focus_group_scope_rules_reject_incomplete_and_unconfirmed_dimension():
    from fastapi import HTTPException
    from app.performance.focus_groups_router import _normalize_resolve_rules

    with pytest.raises(HTTPException, match="规则不完整"):
        _normalize_resolve_rules([])
    with pytest.raises(HTTPException, match="序列职级映射未确认"):
        _normalize_resolve_rules([[{"key": "sequenceLevel", "condition": "eq", "value": ["P6"]}]])
    assert _normalize_resolve_rules([[{
        "key": "department", "condition": "eq", "value": ["研发部"],
    }]]) == [{"conditions": [{"field": "department", "operator": "include", "values": ["研发部"]}]}]


async def test_focus_group_rule_create_uses_server_resolved_people(monkeypatch):
    from types import SimpleNamespace
    from app.performance import focus_groups_router

    async def preview_people(self, cycle, settings, *, exclude_occupied=True, **kwargs):
        assert settings["evaluator_rules"]["groups"][0]["conditions"][0]["field"] == "department"
        assert exclude_occupied is False
        return [SimpleNamespace(employee_no="E100")], [], []

    monkeypatch.setattr(focus_groups_router.PerformanceProjectService, "preview_people", preview_people)
    db = _StubDb(_StubCycle(1))
    base = "/api/v1/performance/cycles/1/focus-groups"
    async with _make_app(db, ("performance.cycles.manage",)) as client:
        response = await client.post(base, json={
            "name": "规则组",
            "scope_setting_mode": 0,
            "scope_mode": "rule",
            "scope": [[{"key": "department", "condition": "eq", "value": ["研发部"]}]],
            "employee_nos": ["CLIENT-SPOOFED"],
        })
    assert response.status_code == 201, response.text
    assert response.json()["employee_nos"] == ["E100"]


async def test_resolve_scope_poll_isolated_and_returns_feishu_scopes(monkeypatch):
    from datetime import UTC, datetime
    from types import SimpleNamespace
    from app.performance import focus_groups_router

    task_id = "v2_8129261e-309f-4239-b829-87e97dc0df7c"
    job = SimpleNamespace(
        id=8,
        payload={
            "task_id": task_id,
            "cycle_id": 1,
            "cycle_ref": "cycle:1",
            "user_group_id": "",
            "scopes": [[{"key": "department", "condition": "eq", "value": ["研发部"]}]],
            "owner": {"subject_type": "SYSTEM_ACCOUNT", "subject_id": "1"},
            "selected": ["E1", "E2"],
        },
    )
    run = SimpleNamespace(status="success", started_at=datetime.now(UTC), message=None)

    async def find_job(db, requested):
        return job

    async def find_run(db, job_id):
        return run

    monkeypatch.setattr(focus_groups_router, "_find_resolve_job", find_job)
    monkeypatch.setattr(focus_groups_router, "_find_resolve_run", find_run)
    db = _StubDb(_StubCycle(1))
    body = {"scopes": [[{"key": "department", "condition": "eq", "value": ["研发部"]}]]}
    async with _make_app(db, ("performance.cycles.manage",)) as client:
        response = await client.post(
            f"/api/v1/performance/cycles/1/focus-groups/resolve-scope",
            params={"task_id": task_id},
            json=body,
        )
        assert response.status_code == 200, response.text
        assert response.json()["scopes"][0]["selected"] == ["E1", "E2"]
        job.payload["owner"] = {"subject_type": "SYSTEM_ACCOUNT", "subject_id": "2"}
        forbidden = await client.post(
            f"/api/v1/performance/cycles/1/focus-groups/resolve-scope",
            params={"task_id": task_id},
            json=body,
        )
        assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_focus_groups_real_database_round_trip():
    """本地开发库回滚验收：显式 RUN_PERFORMANCE_DB_TEST=1 才运行。"""
    import os
    if os.getenv("RUN_PERFORMANCE_DB_TEST") != "1":
        pytest.skip("显式 RUN_PERFORMANCE_DB_TEST=1 才运行本地数据库回滚验收")
    from datetime import UTC, datetime
    from uuid import uuid4

    import httpx
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import settings
    from app.core.db import Base
    from app.performance import models as performance_models  # noqa: F401
    from app.performance.models import PerformanceCycle, PerformanceFocusGroup

    assert make_url(settings.db_url_async).host in {"localhost", "127.0.0.1"}, "只允许本地开发数据库"
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
    reference = f"test:focus-groups:{uuid4().hex}"
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with engine.connect() as connection:
            transaction = await connection.begin()
            session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
            try:
                cycle = PerformanceCycle(cycle_ref=reference, name="人员组回滚验收", period_year=2026, period_type="CUSTOM", start_at=datetime(2026, 10, 1, tzinfo=UTC), end_at=datetime(2026, 11, 1, tzinfo=UTC), lock_rule="IMMEDIATE", created_by_type="PORTAL_USER", created_by_ref="1")
                session.add(cycle)
                await session.flush()
                base = f"/api/v1/performance/cycles/{cycle.id}/focus-groups"
                async with _make_app(session, ("performance.cycles.manage",)) as client:
                    created = await client.post(base, json={"name": "真实库人员组", "tab": "semester", "scope_setting_mode": 1, "employee_nos": ["E1", "E2"], "scope_mode": "manual"})
                    assert created.status_code == 201, created.text
                    group_id = created.json()["id"]
                    listed = await client.get(base, params={"tab": "semester"})
                    assert listed.json()["total"] == 1
                    session.expunge_all()
                    persisted = await session.scalar(PerformanceFocusGroup.id.__eq__(group_id))
                    assert persisted is not None
                    updated = await client.patch(f"{base}/{group_id}", json={"name": "真实库人员组改", "tab": "semester", "scope_setting_mode": 1, "employee_nos": ["E3"], "scope_mode": "manual"})
                    assert updated.status_code == 200, updated.text
                    deleted = await client.delete(f"{base}/{group_id}")
                    assert deleted.status_code == 204
                    assert (await client.get(base, params={"tab": "semester"})).json()["total"] == 0
            finally:
                await session.close()
                await transaction.rollback()
        async with engine.connect() as connection:
            assert await connection.scalar(PerformanceFocusGroup.id.__eq__(group_id)) is None
    finally:
        await engine.dispose()
