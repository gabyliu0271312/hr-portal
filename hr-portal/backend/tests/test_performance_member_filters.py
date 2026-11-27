import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from app.performance import projects_router as routes
from app.performance.member_columns_service import column_schema
from app.performance.member_filters_service import (
    filter_member_rows, member_filter_options, parse_member_filters, sequence_identity, stage_filter_field,
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


def test_v2_groups_sequence_tree_and_boundary_matching():
    items = [row("A", job_family="技术", job_category="研发", job_sequence="后端"),
             row("B", job_family="技术二", job_category="研发", job_sequence="后端"),
             row("HIDDEN")]
    items[-1].filter_values = {"job_sequence": "SECRET"}
    fields = member_filter_options(items, schema())["fields"]
    by_key = {field["key"]: field for field in fields}
    assert by_key["rating:grade"]["group"] == ["当前周期绩效结果"]
    assert by_key["stage:review"]["group"] == ["环节状态"]
    assert by_key["stage:review"]["label"] == "评估"
    assert all(isinstance(field["group"], list) for field in fields)
    tree = by_key["job_sequence_descendants"]
    assert tree["kind"] == by_key["job_sequence"]["kind"] == "sequence"
    assert tree["label"] == "序列（筛选结果含子序列）"
    assert by_key["job_sequence"]["label"] == "序列（筛选结果不含子序列）"
    assert tree["options"][0]["children"][0] == {
        "value": sequence_identity(["技术", "研发"]), "label": "研发"}
    for key, selected in [("job_sequence_descendants", ["技术"]), ("job_sequence", ["技术", "研发"])]:
        selected_rows = filter_member_rows(items, parse_member_filters(payload((key, "in", [sequence_identity(selected)]))), schema())
        assert [item.employee_no for item in selected_rows] == ["A"]
        excluded = filter_member_rows(items, parse_member_filters(payload((key, "not_in", [sequence_identity(selected)]))), schema())
        assert [item.employee_no for item in excluded] == ["B"]
    assert filter_member_rows(items, parse_member_filters(payload(("job_sequence", "in", [sequence_identity(["技术"])]))), schema()) == []


def test_v2_person_avatar_and_hrbp_follow_visible_values():
    current = schema()
    current["columns"].append({"key": "hrbp", "label": "HRBP"})
    visible = row("A", hrbp="冻结HRBP")
    visible.avatar_url = "/avatar/a.png"
    visible.filter_values = {"hrbp": {"value": "H1", "label": "冻结HRBP", "avatarUrl": "/avatar/h.png"}}
    hidden = row("B")
    hidden.filter_values = {"hrbp": {"value": "SECRET", "label": "不可见"}}
    assert member_filter_options([visible], current, key="name", keyword="A")["fields"][0]["options"][0]["avatarUrl"] == "/avatar/a.png"
    options = member_filter_options([visible, hidden], current, key="hrbp", keyword="HRBP")["fields"][0]["options"]
    assert options == [{"value": "H1", "label": "冻结HRBP", "avatarUrl": "/avatar/h.png", "subLabel": "H1"}]
    assert filter_member_rows([visible, hidden], parse_member_filters(payload(("hrbp", "not_in", ["OTHER"]))), current) == [visible]


@pytest.mark.parametrize("node_type", ["project_start", "project_end", "evaluation", "reviewer_360_invite", "reviewer_360_confirm", "result_reconsideration", "result_view", "result_communication"])
def test_v2_stage_fixed_candidates_original_name_and_invalid_state(node_type):
    node = SimpleNamespace(node_id="original", name="自定义状态", node_type=node_type)
    field = stage_filter_field(node)
    current = {"columns": [{"key": field["key"], "label": "自定义状态状态"}], "_filter_fields": [field]}
    result = member_filter_options([], current)["fields"][0]
    assert result["label"] == "自定义状态" and result["group"] == ["环节状态"]
    states = {option["value"] for option in result["options"]}
    labels = {"pending": "待完成", "completed": "已完成", "overdue": "已逾期", "not_started": "未开始"}
    assert all(option["label"] == labels[option["value"]] for option in result["options"])
    assert states == ({"not_started", "completed"} if node_type.startswith("project_") else {"pending", "overdue", "completed"} if node_type == "result_reconsideration" else {"not_started", "pending", "overdue", "completed"})
    with pytest.raises(HTTPException) as error:
        filter_member_rows([], parse_member_filters(payload((field["key"], "in", ["invented"]))), current)
    assert error.value.detail == "INVALID_MEMBER_FILTER"


def test_v2_360_rejection_and_reconsideration_without_not_started():
    from app.performance.assessment_roles import ROLE_REVIEWER_360
    node = SimpleNamespace(id=1, node_id="feedback", name="反馈", node_type="evaluation",
                           config={"template": {"executor_role_code": ROLE_REVIEWER_360}})
    field = stage_filter_field(node)
    assert {option["value"] for option in field["options"]} == {"not_started", "pending", "overdue", "completed", "rejected"}
    task = SimpleNamespace(node_snapshot_id=1, status="rejected", revoked_at=None)
    assert routes._member_stage_values([task], [node], SimpleNamespace()) == {"stage:feedback": "rejected"}
    appeal = SimpleNamespace(id=2, node_id="appeal", name="复议", node_type="result_reconsideration", config={})
    assert "not_started" not in {option["value"] for option in stage_filter_field(appeal)["options"]}
    assert routes._member_stage_values([], [appeal], SimpleNamespace()) == {}


@pytest.fixture
def preset_api(api):
    from app.performance.member_filter_presets_model import PerformanceMemberFilterPreset
    PerformanceMemberFilterPreset.__table__.create(api.db.session.get_bind())
    api.db.get_bind = api.db.session.get_bind
    api.db.commit = AsyncMock(side_effect=api.db.session.commit)
    return api


@pytest.mark.asyncio
async def test_v2_presets_create_list_duplicate_delete_and_role_actor_cycle_isolation(preset_api):
    from dataclasses import replace
    api = preset_api
    url = "/api/v1/performance/project-management/cycles/1/members/filter-presets"
    original_rows = routes._cycle_member_rows
    async def rows(*args, **kwargs):
        kwargs.pop("page", None)
        kwargs.pop("page_size", None)
        return await original_rows(*args, **kwargs)
    from unittest.mock import patch
    with patch.object(routes, "_cycle_member_rows", rows):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
            body = {"name": "已保存", "filters": json.loads(payload(("position_level", "in", ["P5"])))}
            created = await client.post(url, json=body)
            assert created.status_code == 200, created.text
            saved = created.json()
            assert isinstance(saved["id"], int) and saved["filters"] == body["filters"]
            assert (await client.get(url)).json() == {"items": [saved]}
            duplicate = await client.post(url, json=body)
            assert duplicate.status_code == 409 and duplicate.json()["detail"] == "MEMBER_FILTER_NAME_EXISTS"
            api.app.dependency_overrides[routes.get_performance_access_context] = lambda: context("project_admin")
            assert (await client.get(url)).json() == {"items": []}
            assert (await client.delete(f"{url}/{saved['id']}")).status_code == 404
            api.db.insert(routes.PerformanceAuthorizationSnapshotPerson, id=99, snapshot_id=1, employee_no="OTHER", display_name="管理人")
            from app.performance.models import PerformanceHrbpPermission
            api.db.insert(PerformanceHrbpPermission, id=99, cycle_ref="C1", hrbp_employee_no="OTHER", scope=["集团/A"], invisible_people=["HIDDEN"])
            api.db.session.commit()
            api.app.dependency_overrides[routes.get_performance_access_context] = lambda: replace(context(), effective_employee_no="OTHER")
            assert (await client.get(url)).json() == {"items": []}
            assert (await client.delete(f"{url}/{saved['id']}")).status_code == 404
            api.app.dependency_overrides[routes.get_performance_access_context] = lambda: context()
            assert (await client.get(url.replace("cycles/1", "cycles/2"))).status_code == 404
            removed = await client.delete(f"{url}/{saved['id']}")
            assert removed.status_code == 200, removed.text
            assert (await client.get(url)).json() == {"items": []}
            assert (await client.delete(f"{url}/{saved['id']}")).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"name": "", "filters": json.loads(payload(("position_level", "in", ["P5"])))},
    {"name": " " * 5, "filters": json.loads(payload())},
    {"name": "x" * 501, "filters": json.loads(payload())},
    {"name": "条件", "filters": json.loads(payload())},
    {"name": "条件", "filters": json.loads(payload(("secret", "in", ["x"])))},
    {"name": "条件", "filters": {"logic": "xor", "conditions": []}},
])
async def test_v2_preset_rejects_invalid_name_empty_filters_and_hidden_fields(preset_api, body, monkeypatch):
    api = preset_api
    original_rows = routes._cycle_member_rows
    async def rows(*args, **kwargs):
        kwargs.pop("page", None)
        kwargs.pop("page_size", None)
        return await original_rows(*args, **kwargs)
    monkeypatch.setattr(routes, "_cycle_member_rows", rows)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
        response = await client.post("/api/v1/performance/project-management/cycles/1/members/filter-presets", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "INVALID_MEMBER_FILTER"


@pytest.mark.asyncio
async def test_v2_history_reauthorizes_each_cycle_member_and_filters_before_pagination(api, monkeypatch):
    from datetime import UTC, datetime
    from app.performance.models import PerformanceCycle, PerformanceHrbpPermission
    db = api.db
    cycle = db.session.get(PerformanceCycle, 2)
    cycle.start_at = datetime(2025, 1, 1, tzinfo=UTC)
    db.insert(PerformanceProjectMember, id=301, snapshot_id=30, employee_no="VISIBLE1", display_name="VISIBLE1", organization_ref="集团/A")
    db.insert(PerformanceProjectMember, id=302, snapshot_id=30, employee_no="VISIBLE2", display_name="VISIBLE2", organization_ref="集团/B")
    db.session.commit()
    original = routes._project_member_rows
    async def rows(project, *args, **kwargs):
        items, columns = await original(project, *args, **kwargs)
        if project.id == 3:
            for item in items:
                item.column_values["rating:grade"] = {"label": "历史优秀"}
                item.filter_values["rating:grade"] = {"value": "historic-local-a", "label": "历史优秀"}
        return items, columns
    monkeypatch.setattr(routes, "_project_member_rows", rows)
    url = "/api/v1/performance/project-management/cycles/1/members"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
        denied = await client.get(url + "/filter-options")
        assert denied.status_code == 200, denied.text
        assert not any(field["key"].startswith("history_rating:") for field in denied.json()["fields"])
        db.insert(PerformanceHrbpPermission, id=99, cycle_ref="C2", hrbp_employee_no="ADMIN", scope=["集团/A"], invisible_people=[])
        db.session.commit()
        allowed = await client.get(url + "/filter-options", params={"key": "history_rating:2:grade"})
        assert allowed.status_code == 200, allowed.text
        assert allowed.json()["fields"][0]["group"] == ["历史周期绩效结果", "其他周期"]
        assert allowed.json()["fields"][0]["options"] == [{"value": "historic-local-a", "label": "历史优秀"}]
        positive = await client.get(url, params={"filters": payload(("history_rating:2:grade", "in", ["historic-local-a"])), "page_size": 1})
        negative = await client.get(url, params={"filters": payload(("history_rating:2:grade", "not_in", ["other"]))})
        assert positive.status_code == negative.status_code == 200
        assert positive.json()["total"] == 1
        assert [item["employee_no"] for item in positive.json()["items"]] == ["VISIBLE1"]
        assert [item["employee_no"] for item in negative.json()["items"]] == ["VISIBLE1"]
        assert "history_rating:2:grade" not in positive.json()["items"][0]["column_values"]
        role = db.session.get(routes.PerformanceRole, 1)
        role.function_permission_keys = []
        db.session.commit()
        assert (await client.get(url + "/filter-options", params={"key": "history_rating:2:grade"})).status_code == 403
    assert db.session.get(PerformanceProjectMember, 301).organization_ref == "集团/A"


@pytest.mark.asyncio
async def test_v2_hrbp_real_member_rows_use_snapshot_and_field_permission(management_member_data, scope_db, monkeypatch):
    data = management_member_data
    data.members[0].hrbp_employee_no = "FROZEN-HR"
    from app.performance.subject_visibility_service import normalize_subject_visibility_rules, DEFAULT_SUBJECT_VISIBILITY_RULES, load_subject_visibility_rules
    from app.performance.models import PerformanceSubjectVisibilitySetting
    from sqlalchemy import Column, JSON, MetaData, Table
    table = Table(PerformanceSubjectVisibilitySetting.__tablename__, MetaData(), *[
        Column(column.name, JSON() if column.name == "rules" else column.type, primary_key=column.primary_key, nullable=True)
        for column in PerformanceSubjectVisibilitySetting.__table__.columns])
    table.create(scope_db.session.get_bind())
    scope_db.session.execute(table.insert().values(id=1, rules={"activity_manager": ["hrbp"], "hrbp": []}))
    scope_db.session.commit()
    original_get = data.db.get
    async def get(model, key):
        return await scope_db.get(model, key) if model is PerformanceSubjectVisibilitySetting else await original_get(model, key)
    monkeypatch.setattr(data.db, "get", get)
    monkeypatch.setattr(routes, "load_subject_visibility_rules", load_subject_visibility_rules)
    assert all("hrbp" not in fields for fields in DEFAULT_SUBJECT_VISIBILITY_RULES.values())
    assert normalize_subject_visibility_rules({"activity_manager": ["hrbp"]})["activity_manager"] == ["hrbp"]
    people = AsyncMock(return_value={"FROZEN-HR": SimpleNamespace(display_name="冻结HR")})
    monkeypatch.setattr(routes, "_delegation_snapshot_people", people)
    items, _ = await routes._project_member_rows(data.project, None, None, None, None, legacy_context(), data.db)
    assert items[0].filter_values["hrbp"] == {"value": "FROZEN-HR", "label": "冻结HR"}
    assert items[0].column_values["hrbp"] == "冻结HR"
    monkeypatch.setattr(routes, "hydrate_project_member_rows", AsyncMock())
    app = FastAPI()
    app.include_router(routes.router, prefix="/api/v1")
    app.dependency_overrides[routes.get_session] = lambda: data.db
    app.dependency_overrides[routes.get_performance_access_context] = lambda: legacy_context()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        allowed_http = await client.get("/api/v1/performance/projects/1/members")
    assert allowed_http.status_code == 200, allowed_http.text
    assert allowed_http.json()["items"][0]["column_values"]["hrbp"] == "冻结HR"
    setting = scope_db.session.get(PerformanceSubjectVisibilitySetting, 1)
    setting.rules = {"activity_manager": [], "hrbp": []}
    scope_db.session.commit()
    items, _ = await routes._project_member_rows(data.project, None, None, None, None, legacy_context(), data.db)
    assert "hrbp" not in items[0].column_values and "hrbp" not in items[0].filter_values
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        denied_http = await client.get("/api/v1/performance/projects/1/members")
    assert denied_http.status_code == 200, denied_http.text
    assert "hrbp" not in denied_http.json()["items"][0]["column_values"]


def test_v2_filter_preset_migration_executes_upgrade_and_downgrade_on_sqlite(scope_db):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect, text
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0327_member_filter_presets.py"
    spec = importlib.util.spec_from_file_location("filter_preset_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    connection = scope_db.session.connection()
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
        assert "performance_member_filter_presets" in inspect(connection).get_table_names()
        connection.execute(text("INSERT INTO performance_member_filter_presets (owner_type, owner_ref, cycle_id, management_role, name, filters) VALUES ('EMPLOYEE', 'ADMIN', 1, 'hrbp', '条件', '{}')"))
        assert connection.scalar(text("SELECT count(*) FROM performance_member_filter_presets")) == 1
        migration.downgrade()
        assert "performance_member_filter_presets" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT count(*) FROM performance_cycles")) == 2


@pytest.mark.asyncio
async def test_v2_saved_condition_is_revalidated_after_field_permission_revoked(preset_api, monkeypatch):
    api = preset_api
    original_rows = routes._cycle_member_rows
    async def rows(*args, **kwargs):
        kwargs.pop("page", None)
        kwargs.pop("page_size", None)
        return await original_rows(*args, **kwargs)
    monkeypatch.setattr(routes, "_cycle_member_rows", rows)
    url = "/api/v1/performance/project-management/cycles/1/members"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://test") as client:
        created = await client.post(url + "/filter-presets", json={"name": "名" * 500, "filters": json.loads(payload(("position_level", "in", ["P5"])))})
        assert created.status_code == 200, created.text
        limited = schema()
        limited["columns"] = [column for column in limited["columns"] if column["key"] != "position_level"]
        monkeypatch.setattr(routes, "_management_member_schema", AsyncMock(return_value=limited))
        saved = (await client.get(url + "/filter-presets")).json()["items"][0]
        response = await client.get(url, params={"filters": json.dumps(saved["filters"])})
        assert response.status_code == 422 and response.json()["detail"] == "INVALID_MEMBER_FILTER"