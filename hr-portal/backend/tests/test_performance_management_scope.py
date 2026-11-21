from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import Column, JSON, MetaData, Table, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.performance import projects_router as router
from app.performance.auth_context import PerformanceAccessContext, management_request_context
from app.performance.management_scope import MANAGEMENT_FEATURES, management_projects, named_project_scope
from app.performance.models import (
    PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceCycle,
    PerformanceHrbpPermission, PerformanceProject, PerformanceProjectMember,
    PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceRole,
)


def context(role="hrbp", project=None):
    return PerformanceAccessContext(
        subject_type="EMPLOYEE", subject_id=1, display_name="管理人", account_type=None,
        portal_entry_permissions=("performance.app",), role_grants=(),
        permission_codes=("performance.cycles.manage", "performance.projects.manage"),
        effective_employee_no="ADMIN", management_role=role, management_cycle_id=1,
        management_project_id=project,
    )


@pytest.fixture
def scope_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata = MetaData()
    models = [PerformanceCycle, PerformanceProject, PerformanceAuthorizationSnapshot,
              PerformanceAuthorizationSnapshotPerson, PerformanceHrbpPermission, PerformanceRole,
              PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceProjectNodeSnapshot]
    tables = {model: Table(model.__tablename__, metadata, *[
        Column(column.name, JSON() if isinstance(column.type, JSONB) else column.type,
               primary_key=column.primary_key, nullable=True) for column in model.__table__.columns
    ]) for model in models}
    metadata.create_all(engine)
    session = Session(engine)
    def insert(model, **values):
        session.execute(tables[model].insert().values(**values))
    insert(PerformanceCycle, id=1, cycle_ref="C1", name="本周期", start_at=datetime(2026, 1, 1, tzinfo=UTC))
    insert(PerformanceCycle, id=2, cycle_ref="C2", name="其他周期")
    insert(PerformanceAuthorizationSnapshot, id=1, cycle_ref="C1")
    insert(PerformanceAuthorizationSnapshotPerson, id=1, snapshot_id=1, employee_no="ADMIN", display_name="管理人")
    for index, role in enumerate(("hrbp", "project_admin"), 1):
        insert(PerformanceRole, id=index, code=f"performance.{role}", role_type="MANAGEMENT", is_active=True,
               function_permission_keys=list(MANAGEMENT_FEATURES) + ["performance.frontend.export-members"])
    insert(PerformanceHrbpPermission, id=1, cycle_ref="C1", hrbp_employee_no="ADMIN", scope=["集团/A"], invisible_people=["HIDDEN"])
    for project_id in (1, 2, 3):
        insert(PerformanceProject, id=project_id, cycle_ref="C1" if project_id != 3 else "C2", project_ref=f"P{project_id}",
               name=f"项目{project_id}", status="STARTED", administrators=["管理人"], settings={"data_managers": ["PROJECT_ADMIN", "HRBP"]})
        insert(PerformanceProjectMemberSnapshot, id=project_id * 10, project_id=project_id, cycle_ref="C1" if project_id != 3 else "C2")
        for offset, (no, organization) in enumerate(((f"VISIBLE{project_id}", "集团/A/子部门"), (f"OUTSIDE{project_id}", "集团/B"), ("HIDDEN", "集团/A"), ("GLOBAL_HIDDEN", "集团/A"))):
            insert(PerformanceProjectMember, id=project_id * 10 + offset, snapshot_id=project_id * 10,
                   employee_no=no, display_name=no, organization_ref=organization, position_level="P5")
    # Earlier membership cannot enlarge the current HRBP scope.
    insert(PerformanceProjectMemberSnapshot, id=1, project_id=1, cycle_ref="C1")
    insert(PerformanceProjectMember, id=100, snapshot_id=1, employee_no="OLD", display_name="历史", organization_ref="集团/A")
    session.commit()
    monkeypatch.setattr(router, "_global_hrbp_invisible_people", AsyncMock(return_value={"GLOBAL_HIDDEN"}))
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=session.execute), scalar=AsyncMock(side_effect=session.scalar),
        get=AsyncMock(side_effect=session.get), session=session, insert=insert,
    )
    yield db
    session.close()
    engine.dispose()


@pytest.mark.asyncio
async def test_named_roles_are_independent_and_cycle_manager_cannot_expand_scope(scope_db):
    db = scope_db
    project = db.session.get(PerformanceProject, 1)
    assert await router._project_data_scope(context(), project, db, "performance.frontend.data-view") == {"VISIBLE1"}
    assert await router._project_data_scope(context("project_admin"), project, db, "performance.frontend.data-view") is None
    assert not router._can_manage_project(context(), project)
    assert not router._is_cycle_manager(context())
    permitted = await management_projects(1, context(project=2), db, ("performance.frontend.data-view",))
    assert [(project.id, scope) for project, scope in permitted] == [(2, {"VISIBLE2"})]


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["disabled", "function", "selected", "admin_name"])
async def test_named_identity_revocations_do_not_borrow_other_role(scope_db, change):
    db = scope_db
    project = db.session.get(PerformanceProject, 1)
    role = db.session.get(PerformanceRole, 2)
    if change == "disabled":
        role.is_active = False
    elif change == "function":
        role.function_permission_keys = []
    elif change == "selected":
        project.settings = {"data_managers": ["HRBP"]}
    else:
        project.administrators = []
    db.session.flush()
    with pytest.raises(HTTPException) as error:
        await router._project_data_scope(context("project_admin"), project, db, "performance.frontend.data-view")
    assert error.value.status_code == 403
    assert await router._project_data_scope(context(), project, db, "performance.frontend.data-view") == {"VISIBLE1"}


@pytest.mark.asyncio
async def test_cross_cycle_and_explicit_project_conflicts_are_rejected(scope_db):
    for ctx, project_id in ((context(), 3), (context(project=2), 1)):
        with pytest.raises(HTTPException) as error:
            await named_project_scope(ctx, scope_db.session.get(PerformanceProject, project_id), scope_db, "performance.frontend.data-view")
        assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        await management_projects(1, context(project=3), scope_db)
    assert error.value.status_code == 404


@pytest.mark.parametrize("query,path,code", [
    ("management_role=unknown", {}, 422),
    ("management_role=hrbp&project_id=2", {"project_id": 1}, 404),
    ("management_role=hrbp&cycle_id=2", {"cycle_id": 1}, 404),
    ("management_role=hrbp&cycle_id=0", {}, 422),
])
def test_request_scope_rejects_invalid_role_and_path_conflicts(query, path, code):
    request = Request({"type": "http", "query_string": query.encode(), "path_params": path})
    with pytest.raises(HTTPException) as error:
        management_request_context(request, context(None))
    assert error.value.status_code == code


def test_request_scope_uses_project_path_without_project_query_and_preserves_old_callers():
    request = Request({"type": "http", "query_string": b"management_role=hrbp&cycle_id=1", "path_params": {"project_id": 2}})
    selected = management_request_context(request, context(None))
    assert (selected.management_role, selected.management_cycle_id, selected.management_project_id) == ("hrbp", 1, 2)
    old = context(None)
    assert management_request_context(Request({"type": "http", "query_string": b"project_id=2"}), old) is old


@pytest.mark.asyncio
async def test_handler_and_member_reminder_cannot_bypass_selected_scope(scope_db, monkeypatch):
    project = scope_db.session.get(PerformanceProject, 1)
    node = SimpleNamespace(node_type="evaluation")
    task = SimpleNamespace(target_employee_no="OUTSIDE1", revoked_at=None, handler_ref="ADMIN")
    assert not await router._authorize_task_delegation(task, node, project, context(), "ADMIN", scope_db, active_by_task={})
    from app.performance import member_reminders
    with pytest.raises(HTTPException) as error:
        await member_reminders._member_scope(project, "OUTSIDE1", context(), scope_db, source_task_id=123)
    assert error.value.status_code == 403
    with pytest.raises(HTTPException) as error:
        await router._project_member_detail(project, "OUTSIDE1", context(), scope_db, skip_scope=True)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_named_opening_grants_and_add_candidates_retain_only_selected_scope(scope_db):
    project = scope_db.session.get(PerformanceProject, 1)
    grants = await router._opening_access_grants(scope_db, context(), [project])
    for employee, expected in (("VISIBLE1", True), ("OUTSIDE1", False), ("HIDDEN", False)):
        assert router._result_opening_scope(context(), grants, project, SimpleNamespace(employee_no=employee)) is expected
    candidates = [SimpleNamespace(employee_no="NEW", organization_ref="集团/A"), SimpleNamespace(employee_no="OTHER", organization_ref="集团/B")]
    assert await router._reviewee_management_scope(context(), project, candidates, scope_db) == {"NEW"}


@pytest.mark.asyncio
async def test_overview_preserves_sidebar_but_filters_content_and_lists_both_roles(scope_db, monkeypatch):
    db = scope_db
    cycle = db.session.get(PerformanceCycle, 1)
    monkeypatch.setattr(router, "resolve_frontend_access", AsyncMock(return_value=SimpleNamespace(cycles=[cycle])))
    completion = AsyncMock(return_value=[])
    monkeypatch.setattr(router, "_project_completion_nodes", completion)
    monkeypatch.setattr(router, "_opening_project_members", AsyncMock(return_value=[]))
    monkeypatch.setattr(router, "_result_opening_candidates", AsyncMock(return_value=([], {})))
    result = await router.project_management_overview(1, context(), db, project_id=2)
    assert [item["key"] for item in result["categories"]] == ["hrbp", "project_admin"]
    assert [item["project_id"] for item in result["projects"]] == [1, 2]
    assert result["active_role"] == "hrbp"
    assert [project.id for project in completion.await_args.args[0]] == [2]
    assert completion.await_args.kwargs["scopes"] == {2: {"VISIBLE2"}}
    default = await router._named_management_overview(1, None, context(None), db)
    assert default["active_role"] == "hrbp"


@pytest.mark.asyncio
async def test_management_timeline_includes_reconsideration_workbench_excludes_it(scope_db):
    db = scope_db
    for index, kind in enumerate(("work_summary", "result_reconsideration"), 1):
        db.insert(PerformanceProjectNodeSnapshot, id=index, project_id=1, node_id=f"N{index}", name=kind,
                  node_type=kind, node_order=index, config={"time": {}, "template": {}})
    db.session.commit()
    project = db.session.get(PerformanceProject, 1)
    result = await router.project_management_timeline(1, 1, context(), db)
    assert [item["node_type"] for item in result] == ["work_summary", "result_reconsideration"]
    assert [item["node_type"] for item in await router._project_timeline(project, db)] == ["work_summary"]


@pytest.mark.asyncio
async def test_cycle_matrix_reuses_aggregation_and_rejects_overlap_and_scale_conflicts(scope_db, monkeypatch):
    db = scope_db
    monkeypatch.setattr(router, "hydrate_member_identities", AsyncMock())
    final = AsyncMock(return_value=([{"key": "A", "label": "A"}], {}, ["scale1"]))
    monkeypatch.setattr(router, "_project_final_ratings", final)
    result = await router.project_management_matrix(1, None, context(), db)
    assert result.total == 2 and result.pending_count == 2
    assert [call.args[1] for call in final.await_args_list] == [{"VISIBLE1"}, {"VISIBLE2"}]
    db.session.get(PerformanceProjectMember, 20).employee_no = "VISIBLE1"
    db.session.commit()
    with pytest.raises(HTTPException) as overlap:
        await router.project_management_matrix(1, None, context(), db)
    assert overlap.value.detail == "CYCLE_MEMBER_OVERLAP_UNRESOLVED"
    db.session.get(PerformanceProjectMember, 20).employee_no = "VISIBLE2"
    db.session.commit()
    final.side_effect = [([], {}, ["scale1"]), ([], {}, ["scale2"])]
    with pytest.raises(HTTPException) as conflict:
        await router.project_management_matrix(1, None, context(), db)
    assert conflict.value.detail == "RATING_SCALE_CONFLICT"


@pytest.mark.asyncio
@pytest.mark.parametrize("role,expected", [("hrbp", "hrbp"), ("project_admin", "activity_manager")])
async def test_named_disclosure_role_does_not_borrow_self_or_project_admin(scope_db, role, expected):
    from app.performance.subject_visibility_service import resolve_subject_visibility_role
    project = scope_db.session.get(PerformanceProject, 1)
    member = SimpleNamespace(employee_no="ADMIN", direct_supervisor_employee_no="ADMIN")
    assert await resolve_subject_visibility_role(scope_db, context(role), "ADMIN", member, SimpleNamespace(), project) == expected


@pytest.mark.asyncio
async def test_named_statistics_and_comparison_limit_the_selected_project(scope_db, monkeypatch):
    final = AsyncMock(return_value=([], {}, []))
    self_ratings = AsyncMock(return_value=([], {}, []))
    monkeypatch.setattr(router, "_project_final_ratings", final)
    monkeypatch.setattr(router, "_project_self_ratings", self_ratings)
    result = await router.project_management_statistics(1, "level", context(), scope_db, project_id=2)
    assert result.totalParticipants == 1
    final.assert_awaited_once()
    assert final.await_args.args[0].id == 2 and final.await_args.args[1] == {"VISIBLE2"}
    final.reset_mock()
    await router.project_management_self_final_comparison(1, context(), scope_db, project_id=2)
    assert final.await_args.args[0].id == 2 and self_ratings.await_args.args[1] == {"VISIBLE2"}


def test_actual_api_request_preserves_selected_project_and_rejects_path_tampering(scope_db, monkeypatch):
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.db import get_session
    from app.performance.auth_context import get_performance_access_context
    app = FastAPI()
    app.include_router(router.router, prefix="/api/v1")
    async def selected_context(request: Request):
        return management_request_context(request, context(None))
    app.dependency_overrides[get_performance_access_context] = selected_context
    app.dependency_overrides[get_session] = lambda: scope_db
    monkeypatch.setattr(router, "hydrate_member_identities", AsyncMock())
    monkeypatch.setattr(router, "_project_final_ratings", AsyncMock(return_value=([], {}, [])))
    with TestClient(app) as client:
        allowed = client.get("/api/v1/performance/project-management/matrix?cycle_id=1&management_role=hrbp&project_id=2")
        assert allowed.status_code == 200 and allowed.json()["total"] == 1
        rejected = client.get("/api/v1/performance/projects/2/members/OUTSIDE2/detail?cycle_id=1&management_role=hrbp&project_id=1")
        assert rejected.status_code == 404
        unknown = client.get("/api/v1/performance/project-management/matrix?cycle_id=1&management_role=other")
        assert unknown.status_code == 422


@pytest.mark.asyncio
async def test_member_read_scope_reuse_is_identity_function_and_request_scoped(scope_db):
    from dataclasses import replace
    db = scope_db
    db.info = {}
    project = db.session.get(PerformanceProject, 1)
    ctx = context()
    router._enable_member_read_reuse(db)
    first = await router._project_data_scope(ctx, project, db, "performance.frontend.data-view")
    queries = db.execute.await_count
    first.add("FORGED")
    assert await router._project_data_scope(ctx, project, db, "performance.frontend.data-view") == {"VISIBLE1"}
    assert db.execute.await_count == queries
    assert await router._project_data_scope(ctx, project, db, "performance.frontend.progress") == {"VISIBLE1"}
    assert db.execute.await_count > queries
    switched = replace(ctx, management_role="project_admin")
    assert await router._project_data_scope(switched, project, db, "performance.frontend.data-view") is None
    role = db.session.get(PerformanceRole, 1)
    role.function_permission_keys = []
    db.session.flush()
    db.info = {}
    router._enable_member_read_reuse(db)
    with pytest.raises(HTTPException) as denied:
        await router._project_data_scope(ctx, project, db, "performance.frontend.data-view")
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_light_overview_skips_statistics_and_opening_queries(scope_db, monkeypatch):
    db = scope_db
    cycle = db.session.get(PerformanceCycle, 1)
    monkeypatch.setattr(router, "resolve_frontend_access", AsyncMock(return_value=SimpleNamespace(cycles=[cycle])))
    completion = AsyncMock(side_effect=AssertionError("statistics must be deferred"))
    openings = AsyncMock(side_effect=AssertionError("opening must be deferred"))
    monkeypatch.setattr(router, "_project_completion_nodes", completion)
    monkeypatch.setattr(router, "_opening_project_members", openings)
    result = await router.project_management_overview(1, context(), db, project_id=2, include_statistics=False)
    assert result["completion_nodes"] == []
    assert result["active_role"] == "hrbp"
    assert [project["project_id"] for project in result["projects"]] == [1, 2]
    completion.assert_not_awaited()
    openings.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("sort_order", ["asc", "desc"])
async def test_cycle_member_sql_pagination_filters_before_count_and_skips_empty_projects(scope_db, monkeypatch, sort_order):
    from app.performance.member_columns_service import column_schema
    db = scope_db
    db.session.connection().connection.create_collation("C", lambda a, b: (a > b) - (a < b))
    monkeypatch.setattr(router, "_management_member_schema", AsyncMock(return_value=column_schema(
        [{"key": "rating:first", "label": "第一项目"}, {"key": "rating:second", "label": "第二项目"}], [])))
    visited = []
    async def rows(project, scope, keyword, sort_by, order, actor, session, *, employee_nos):
        visited.append(project.id)
        assert len(employee_nos) == 1
        statement = router.select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == router._latest_member_snapshot_statement(project.id),
            PerformanceProjectMember.employee_no.in_(employee_nos))
        members = db.session.execute(statement).scalars().all()
        return [router.ProjectMemberResponse(id=member.id, root_review_id=member.id, project_id=project.id,
            employee_no=member.employee_no, display_name=member.display_name) for member in members], []
    monkeypatch.setattr(router, "_project_member_rows", rows)
    monkeypatch.setattr(router, "hydrate_project_member_rows", AsyncMock())
    pages = [await router.cycle_project_members(1, None, page, 1, "name", sort_order, context(), db) for page in (1, 2, 3)]
    expected = ["VISIBLE1", "VISIBLE2"] if sort_order == "asc" else ["VISIBLE2", "VISIBLE1"]
    assert [page.items[0].employee_no for page in pages[:2]] == expected
    assert all(page.total == 2 for page in pages)
    assert pages[2].items == [] and len(visited) == 2
    assert all({column.key for column in page.rating_columns} == {"rating:first", "rating:second"} for page in pages)
    filtered = await router.cycle_project_members(1, "VISIBLE2", 1, 1, None, None, context(), db)
    assert filtered.total == 1 and filtered.items[0].employee_no == "VISIBLE2"
