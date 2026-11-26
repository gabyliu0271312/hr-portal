import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from app.performance import projects_router as routes
from app.performance.member_columns_service import column_schema
from app.performance.member_filters_service import (
    filter_member_rows, member_filter_options, parse_member_filters,
)
from app.performance.models import PerformanceProjectMember
from tests.test_performance_management_scope import context, scope_db
from tests.test_performance_projects import management_member_data, context as legacy_context


def payload(*conditions, logic="and"):
    return json.dumps({"logic": logic, "conditions": [
        {"key": key, "op": op, "values": values} for key, op, values in conditions
    ]})


def row(no, **values):
    return SimpleNamespace(employee_no=no, display_name=no, project_id=1, project_name="项目一",
                           column_values={"name": no, **values}, filter_values={}, visible_profile_fields=[])


def schema():
    return column_schema([{"key": "rating:grade", "label": "评级"}],
                         ["department", "position_level", "hire_date", "direct_supervisor", "job_sequence"],
                         [{"node_id": "review", "name": "评估"}],
                         available_profile_fields={"department", "department_path", "position_level", "hire_date", "direct_supervisor", "job_sequence", "project_name"})


def test_service_and_or_include_exclude_and_date():
    items = [row("A", department="研发", position_level="P5", hire_date="2026-01-01"),
             row("B", department="产品", position_level="P6", hire_date="2025-01-01"),
             row("C", department="研发", position_level="P6", hire_date=None)]
    result = filter_member_rows(items, parse_member_filters(payload(
        ("department", "in", ["研发"]), ("position_level", "not_in", ["P6"]))), schema())
    assert [item.employee_no for item in result] == ["A"]
    result = filter_member_rows(items, parse_member_filters(payload(
        ("department", "eq", ["产品"]), ("hire_date", "eq", ["2026-01-01"]), logic="or")), schema())
    assert [item.employee_no for item in result] == ["A", "B"]
    result = filter_member_rows(items, parse_member_filters(payload(("hire_date", "ne", ["2026-01-01"]))), schema())
    assert [item.employee_no for item in result] == ["B"]
    assert filter_member_rows(items, parse_member_filters(payload()), schema()) is items


@pytest.mark.parametrize("raw", ["", "{", "[]", "null", '{}',
    '{"logic":"xor","conditions":[]}', '{"logic":"and","conditions":{},"other":0}',
    payload(("name", "contains", ["a"])), payload(("name", "in", [])),
    payload(("name", "eq", ["a", "b"])), payload(("name", "in", [1])),
    payload(("name", "in", ["a"] * 101)), payload(("a" * 257, "in", ["a"])),
    payload(("name", "in", ["a" * 1537])), payload(*[("name", "in", ["a"])] * 31),
    " " * 65537], ids=[f"invalid-{index}" for index in range(16)])
def test_parser_rejects_malformed_and_oversized_filters(raw):
    with pytest.raises(HTTPException) as error:
        parse_member_filters(raw)
    assert error.value.status_code == 422 and error.value.detail == "INVALID_MEMBER_FILTER"


@pytest.mark.parametrize("condition", [("unknown", "in", ["a"]), ("hrbp", "in", ["a"]),
                                       ("hire_date", "in", ["2026-02-30"]), ("hire_date", "in", ["20260101"])])
def test_service_rejects_unknown_forbidden_and_invalid_dates(condition):
    with pytest.raises(HTTPException) as error:
        filter_member_rows([], parse_member_filters(payload(condition)), schema())
    assert error.value.detail == "INVALID_MEMBER_FILTER"


@pytest.mark.parametrize("operator,expected", [("in", ["START", "MID", "END"]), ("not_in", ["BEFORE", "AFTER"])])
def test_date_range_is_inclusive_not_discrete_dates(operator, expected):
    items = [row(no, hire_date=value) for no, value in [
        ("BEFORE", "2026-01-31"), ("START", "2026-02-01"), ("MID", "2026-02-15"),
        ("END", "2026-02-28"), ("AFTER", "2026-03-01"), ("MISSING", None)]]
    result = filter_member_rows(items, parse_member_filters(payload(("hire_date", operator, ["2026-02-01", "2026-02-28"]))), schema())
    assert [item.employee_no for item in result] == expected


@pytest.mark.parametrize("values", [["2026-02-01"], ["2026-02-28", "2026-02-01"],
                                    ["2026-02-01", "2026-02-15", "2026-02-28"]])
def test_date_range_rejects_partial_reversed_or_extra_endpoints(values):
    with pytest.raises(HTTPException) as error:
        filter_member_rows([], parse_member_filters(payload(("hire_date", "in", values))), schema())
    assert error.value.status_code == 422 and error.value.detail == "INVALID_MEMBER_FILTER"


@pytest.mark.parametrize("op", ["in", "not_in", "eq", "ne"])
@pytest.mark.parametrize("value", [None, ""])
def test_null_values_never_match_positive_or_negative_conditions(op, value):
    assert filter_member_rows([row("A", position_level=value)], parse_member_filters(payload(
        ("position_level", op, ["P5"]))), schema()) == []


def test_fields_only_advertise_include_and_exclude_operators():
    fields = member_filter_options([], schema())["fields"]
    assert fields
    assert all([op["value"] for op in field["operators"]] == ["in", "not_in"] for field in fields)


def test_non_person_options_not_truncated_while_person_search_is_limited():
    items = [row(f"E{index:03}", department=f"部门{index:03}") for index in range(150)]
    departments = member_filter_options(items, schema(), key="department")["fields"][0]["options"]
    people = member_filter_options(items, schema(), key="name", keyword="E")["fields"][0]["options"]
    assert len(departments) == 150
    assert len(people) == 100
    assert len(member_filter_options(items, schema(), key="department", keyword="部门149")["fields"][0]["options"]) == 1


def test_hidden_row_field_never_matches_negative_or_leaks_options():
    items = [row("A", position_level="P5"), row("B")]
    items[1].position_level = "SECRET"
    items[1].filter_values = {"position_level": "SECRET"}
    filtered = filter_member_rows(items, parse_member_filters(payload(("position_level", "not_in", ["P6"]))), schema())
    assert [item.employee_no for item in filtered] == ["A"]
    options = member_filter_options(items, schema(), key="position_level")
    assert options["fields"][0]["options"] == [{"value": "P5", "label": "P5"}]


def test_people_require_search_and_use_ids_ratings_use_option_ids():
    item = row("E1", direct_supervisor="同名经理", **{"rating:grade": {"label": "优秀", "color": "blue"}})
    item.filter_values = {"direct_supervisor": {"value": "M1", "label": "同名经理"},
                          "rating:grade": {"value": "option-a", "label": "优秀", "color": "blue"}}
    fields = member_filter_options([item], schema())["fields"]
    assert all(not field["options"] for field in fields if field["kind"] == "person")
    assert member_filter_options([item], schema(), key="direct_supervisor", keyword="经理")["fields"][0]["options"] == [
        {"value": "M1", "label": "同名经理", "subLabel": "M1"}]
    assert member_filter_options([item], schema(), key="name", keyword="E1")["fields"][0]["options"][0]["value"] == "E1"
    assert member_filter_options([item], schema(), key="rating:grade")["fields"][0]["options"] == [
        {"value": "option-a", "label": "优秀", "color": "blue"}]
    assert filter_member_rows([item], parse_member_filters(payload(("rating:grade", "eq", ["option-a"]))), schema()) == [item]
    assert filter_member_rows([item], parse_member_filters(payload(("rating:grade", "eq", ["优秀"]))), schema()) == []


def test_department_descendants_use_path_boundary_and_options_ancestors():
    items = [row("A", department_path="集团/研发/平台"), row("B", department_path="集团/研发二部")]
    assert [item.employee_no for item in filter_member_rows(items, parse_member_filters(payload(
        ("department_path", "in", ["集团/研发"]))), schema())] == ["A"]
    options = member_filter_options(items, schema(), key="department_path")["fields"][0]["options"]
    assert {option["value"] for option in options} == {"集团", "集团/研发", "集团/研发/平台", "集团/研发二部"}


def test_project_ids_and_dynamic_stage_states():
    items = [row("A", project_name="项目一", **{"stage:review": "completed"}),
             row("B", project_name="同名项目", **{"stage:review": "overdue"})]
    items[1].project_id = 2
    assert [item.employee_no for item in filter_member_rows(items, parse_member_filters(payload(
        ("project_name", "eq", ["2"]), ("stage:review", "in", ["overdue", "pending"]))), schema())] == ["B"]
    assert {option["value"] for option in member_filter_options(items, schema(), key="project_name")["fields"][0]["options"]} == {"1", "2"}


def test_ambiguous_current_status_not_exposed_or_confused_with_snapshot():
    item = row("A")
    item.visible_profile_fields = ["employment_status"]
    item.employment_status = "在职"
    item.identity_status = {"live_employment_status": "离职"}
    assert "current_employment_status" not in {field["key"] for field in member_filter_options([item], schema())["fields"]}
    with pytest.raises(HTTPException):
        filter_member_rows([item], parse_member_filters(payload(("current_employment_status", "eq", ["离职"]))), schema())
    assert item.employment_status == "在职"


@pytest.mark.asyncio
async def test_real_member_rows_keep_snapshot_supervisor_ids_and_effective_rating_ids(management_member_data, monkeypatch):
    data = management_member_data
    data.project.name = "真实项目"
    data.members[0].direct_supervisor_employee_no = "M1"
    monkeypatch.setattr(routes, "load_subject_visibility_rules", AsyncMock(return_value={"activity_manager": ["direct_supervisor"], "hrbp": []}))
    monkeypatch.setattr(routes, "_snapshot_supervisor_names", AsyncMock(return_value={(7, "M1"): "冻结经理"}))
    monkeypatch.setattr(routes, "_matrix_node_schema", AsyncMock(return_value=[{"id": "final", "fields": [{
        "id": "grade", "type": "rating", "label": "最终评级", "options": [{"id": "grade-a", "label": "优秀", "color": "blue"}]
    }]}]))
    monkeypatch.setattr(routes, "_effective_project_results", AsyncMock(return_value={(7, "E1"): {"answers": {"grade": "grade-a"}}}))
    items, _columns = await routes._project_member_rows(data.project, None, None, None, None, legacy_context(), data.db)
    assert items[0].filter_values["direct_supervisor"] == {"value": "M1", "label": "冻结经理"}
    assert items[0].filter_values["rating:grade"] == {"value": "grade-a", "label": "优秀", "color": "blue"}
    assert "filter_values" not in items[0].model_dump()
    assert filter_member_rows(items, parse_member_filters(payload(("rating:grade", "eq", ["grade-a"]))), schema()) == [items[0]]


@pytest.fixture
def api(scope_db, monkeypatch):
    db = scope_db
    monkeypatch.setattr(routes, "_management_member_schema", AsyncMock(return_value=schema()))
    monkeypatch.setattr(routes, "hydrate_project_member_rows", AsyncMock())
    visits = []

    async def member_rows(project, scope, keyword, sort_by, sort_order, actor, session):
        visits.append((project.id, scope))
        statement = routes.select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == routes._latest_member_snapshot_statement(project.id))
        if scope is not None:
            statement = statement.where(PerformanceProjectMember.employee_no.in_(scope))
        if keyword:
            statement = statement.where(PerformanceProjectMember.employee_no.contains(keyword))
        members = db.session.execute(statement).scalars().all()
        return [routes.ProjectMemberResponse(id=member.id, root_review_id=member.id, project_id=project.id,
            employee_no=member.employee_no, display_name=member.display_name, project_name=project.name,
            column_values={"name": member.display_name, "position_level": "P5" if project.id == 1 else "P6", "project_name": project.name})
            for member in members], []

    monkeypatch.setattr(routes, "_project_member_rows", member_rows)
    app = FastAPI()
    app.include_router(routes.router, prefix="/api/v1")
    app.dependency_overrides[routes.get_session] = lambda: db
    app.dependency_overrides[routes.get_performance_access_context] = lambda: context()
    return SimpleNamespace(app=app, db=db, visits=visits)


@pytest.mark.asyncio
@pytest.mark.parametrize("sort_key,sort_order", [("name", "asc"), ("name", "desc"), ("position_level", "desc")])
async def test_api_filters_before_pagination_and_count(api, sort_key, sort_order):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
        url = "/api/v1/performance/project-management/cycles/1/members"
        params = {"filters": payload(("position_level", "eq", ["P6"])), "page_size": 1,
                  "sort_by": sort_key, "sort_order": sort_order}
        first = await client.get(url, params=params)
        second = await client.get(url, params={**params, "page": 2})
    assert first.status_code == second.status_code == 200, first.text
    assert first.json()["total"] == second.json()["total"] == 1
    assert [item["employee_no"] for item in first.json()["items"]] == ["VISIBLE2"]
    assert second.json()["items"] == []
    assert "filter_values" not in first.json()["items"][0]
    assert {project_id for project_id, scope in api.visits} == {1, 2}
    assert all(scope in ({"VISIBLE1"}, {"VISIBLE2"}) for project_id, scope in api.visits)


@pytest.mark.asyncio
async def test_api_export_reuses_filters_and_export_permission(api, monkeypatch):
    original_scope = routes._project_data_scope

    async def limited_scope(actor, project, db, function):
        if function == "performance.frontend.export-members" and project.id == 2:
            raise HTTPException(403, "DENIED")
        return await original_scope(actor, project, db, function)

    monkeypatch.setattr(routes, "_project_data_scope", limited_scope)
    url = "/api/v1/performance/project-management/cycles/1/members/export"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
        excluded = await client.get(url, params={"filters": payload(("position_level", "eq", ["P6"]))})
        allowed = await client.get(url, params={"filters": payload(("position_level", "eq", ["P5"]))})
        role = api.db.session.get(routes.PerformanceRole, 1)
        role.function_permission_keys = ["performance.frontend.data-view"]
        api.db.session.flush()
        denied = await client.get(url, params={"filters": payload()})
    assert excluded.status_code == allowed.status_code == 200
    assert excluded.json()["total"] == 0
    assert [item["employee_no"] for item in allowed.json()["items"]] == ["VISIBLE1"]
    assert denied.status_code == 403 and denied.json()["detail"] == "PERFORMANCE_MEMBER_EXPORT_FORBIDDEN"


@pytest.mark.asyncio
async def test_api_options_use_full_authorized_cycle_and_reject_invalid_filters(api):
    url = "/api/v1/performance/project-management/cycles/1/members"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
        options = await client.get(url + "/filter-options", params={"key": "position_level"})
        people = await client.get(url + "/filter-options", params={"key": "name"})
        search = await client.get(url + "/filter-options", params={"key": "name", "keyword": "VISIBLE"})
        invalid = [await client.get(url, params={"filters": raw}) for raw in ("{", payload(("secret", "not_in", ["x"])), payload(("hire_date", "eq", ["bad"])))]
        unknown = await client.get(url + "/filter-options", params={"key": "hrbp"})
    assert options.status_code == people.status_code == search.status_code == 200
    assert {option["value"] for option in options.json()["fields"][0]["options"]} == {"P5", "P6"}
    assert people.json()["fields"][0]["options"] == []
    assert {option["value"] for option in search.json()["fields"][0]["options"]} == {"VISIBLE1", "VISIBLE2"}
    assert all(response.status_code == 422 and response.json()["detail"] == "INVALID_MEMBER_FILTER" for response in [*invalid, unknown])
