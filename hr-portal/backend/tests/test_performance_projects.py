from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.performance.projects_router import ProjectPayload, _can_manage_project, _review_node_category, _review_node_status
from app.performance.auth_context import PerformanceAccessContext, PerformanceRoleGrant, performance_admin_preview_enabled
from app.performance.project_service import PerformanceProjectService, ProjectValidationError


def context(*permissions: str, refs: tuple[str, ...] = (), portal_entry_permissions: tuple[str, ...] = ()) -> PerformanceAccessContext:
    return PerformanceAccessContext(
        subject_type="PORTAL_USER",
        subject_id=1,
        display_name="管理员",
        account_type=None,
        portal_entry_permissions=portal_entry_permissions,
        role_grants=tuple(PerformanceRoleGrant("project-admin", "PROJECT", ref) for ref in refs),
        permission_codes=permissions,
    )


def project(status="DRAFT", project_ref="project:one"):
    return SimpleNamespace(
        id=1,
        project_ref=project_ref,
        cycle_ref="cycle:one",
        name="项目一",
        description="说明",
        administrators=["张三"],
        status=status,
        evaluated_count=0,
        settings={"flow_settings": {"node_settings": {}}},
        template_id=None,
    )


def test_admin_preview_requires_dev_debug_and_admin_permission(monkeypatch):
    admin = context("performance.cycles.manage")
    portal_admin = context(portal_entry_permissions=("performance.admin",))
    ordinary = context()
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", False)
    assert not performance_admin_preview_enabled(admin)
    assert not performance_admin_preview_enabled(portal_admin)
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)
    assert performance_admin_preview_enabled(admin)
    assert performance_admin_preview_enabled(portal_admin)
    assert not performance_admin_preview_enabled(ordinary)
    monkeypatch.setattr(settings, "APP_ENV", "prod")
    assert not performance_admin_preview_enabled(admin)


    with pytest.raises(ValidationError):
        ProjectPayload(name="")
    with pytest.raises(ValidationError):
        ProjectPayload(name="项目一", unknown="value")


def test_result_opening_requires_complete_tasks_and_configured_rating_answers():
    from datetime import UTC, datetime
    from app.performance.projects_router import _result_ready, _previous_finished, _manual_openable, _result_opening_scope

    schema = [{"fields": [{"id": "rating-a", "type": "rating", "options": [{"id": "A", "label": "优秀"}]}, {"id": "rating-b", "type": "rating", "options": [{"id": "B", "label": "良好"}]}]}]
    submitted = datetime(2026, 10, 19, tzinfo=UTC)
    first = SimpleNamespace(id=1, status="completed", submitted_at=submitted, answers={"rating-a": "A", "rating-b": "B"}, target_employee_no="E001", node_snapshot_id=11)
    second = SimpleNamespace(id=2, status="pending", submitted_at=None, answers={}, target_employee_no="E001", node_snapshot_id=11)
    assert not _result_ready([first, second], schema)
    second.status = "completed"
    second.submitted_at = submitted
    second.answers = {"rating-a": "A"}
    assert not _result_ready([first, second], schema)
    second.answers["rating-b"] = "B"
    assert _result_ready([first, second], schema)
    assert not _result_ready([], schema)
    assert not _result_ready([first], [{"fields": [{"id": "score", "type": "rich_text"}]}])
    previous = SimpleNamespace(id=12, node_type="calibration")
    assert _previous_finished("E001", previous, [])
    assert not _previous_finished("E001", previous, [SimpleNamespace(target_employee_no="E001", node_snapshot_id=12, status="pending", submitted_at=None)])
    assert _previous_finished("E001", previous, [SimpleNamespace(target_employee_no="E001", node_snapshot_id=12, status="completed", submitted_at=submitted)])

    project = SimpleNamespace(project_ref="project:one", settings={"flow_settings": {"node_settings": {"view": {"result_view": {"manual_enabled": True}}}, "node_times": {"view": {"start_at": "2026-10-19T00:00:00Z"}}}})
    view = SimpleNamespace(node_id="view", config={})
    member = SimpleNamespace(employee_no="E001", organization_ref="总部/研发")
    state = (view, SimpleNamespace(id=11), None, [member], [first, second], schema)
    assert _manual_openable(project, member, state, submitted) is None
    project.settings["flow_settings"]["node_settings"]["view"]["result_view"]["manual_enabled"] = False
    assert _manual_openable(project, member, state, submitted) == "MANUAL_OPENING_DISABLED"
    grant = SimpleNamespace(scope_type="ORG", scope_ref="总部", is_active=True)
    role = SimpleNamespace(is_active=True, function_permission_keys=["performance.frontend.result-open"])
    assert _result_opening_scope(context(), [(role, grant)], project, member)
    assert not _result_opening_scope(context(), [(role, grant)], project, SimpleNamespace(organization_ref="分部/研发"))


def test_result_opening_batch_contract_is_bounded_and_forbids_unexpected_fields():
    from app.performance.projects_router import ResultOpeningBatchPayload

    assert ResultOpeningBatchPayload.model_validate({"employee_nos": ["E001"]}).employee_nos == ["E001"]
    with pytest.raises(ValidationError):
        ResultOpeningBatchPayload.model_validate({"employee_nos": []})
    with pytest.raises(ValidationError):
        ResultOpeningBatchPayload.model_validate({"employee_nos": ["E001"], "actor_ref": "forged"})


@pytest.mark.asyncio
async def test_result_opening_list_and_batch_deny_roles_without_function_key(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    async def grants(_db, _context):
        return [(SimpleNamespace(is_active=True, function_permission_keys=[]), SimpleNamespace(scope_type="GLOBAL", scope_ref="GLOBAL"))]

    monkeypatch.setattr(projects_router, "_opening_role_grants", grants)
    with pytest.raises(HTTPException) as listed:
        await projects_router.result_opening_people(1, context=context(), db=object())
    assert listed.value.status_code == 403
    with pytest.raises(HTTPException) as opened:
        await projects_router.open_cycle_results(1, projects_router.ResultOpeningBatchPayload(employee_nos=["E001"]), context=context(), db=object())
    assert opened.value.status_code == 403


def test_project_payload_normalizes_duplicate_administrators():
    name, description, administrators, settings = PerformanceProjectService._validate_payload({
        "name": " 项目一 ",
        "description": " 说明 ",
        "administrators": ["张三", " 张三 ", ""],
    })
    assert (name, description, administrators) == ("项目一", "说明", ["张三"])


def test_project_delete_allows_started_with_audit():
    import asyncio

    class _RecordingDB:
        def __init__(self):
            self.deleted = []
            self.committed = 0

        def add(self, *_args):
            pass

        async def delete(self, obj):
            self.deleted.append(obj)

        async def commit(self):
            self.committed += 1

    class _RecordingAudit:
        def __init__(self):
            self.events = []

        def append_event(self, event):
            self.events.append(event)

    async def run(status):
        db = _RecordingDB()
        service = PerformanceProjectService(db)  # type: ignore[arg-type]
        service.audit = _RecordingAudit()
        target = project(status)
        await service.delete_project(target, actor_type="PORTAL_USER", actor_id=7)
        return db, service, target

    for status in ("DRAFT", "STARTED"):
        db, service, target = asyncio.run(run(status))
        assert db.deleted == [target]
        assert db.committed == 1
        assert service.audit.events[0].event_type == "PERFORMANCE_PROJECT_DELETED"
        assert service.audit.events[0].subject_ref == "project:one"


def test_project_delete_removes_draft_and_writes_audit():
    import asyncio

    class _RecordingDB:
        def __init__(self):
            self.deleted = []
            self.committed = 0

        def add(self, *_args):
            pass

        async def delete(self, obj):
            self.deleted.append(obj)

        async def commit(self):
            self.committed += 1

    class _RecordingAudit:
        def __init__(self):
            self.events = []

        def append_event(self, event):
            self.events.append(event)

    async def run():
        db = _RecordingDB()
        service = PerformanceProjectService(db)  # type: ignore[arg-type]
        service.audit = _RecordingAudit()
        draft = project("DRAFT")
        await service.delete_project(draft, actor_type="PORTAL_USER", actor_id=7)
        return db, service, draft

    db, service, draft = asyncio.run(run())
    assert db.deleted == [draft]
    assert db.committed == 1
    assert service.audit.events[0].event_type == "PERFORMANCE_PROJECT_DELETED"
    assert service.audit.events[0].subject_ref == "project:one"




@pytest.mark.asyncio
async def test_template_task_rejects_unmapped_or_other_employee(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    task = SimpleNamespace(cycle_ref="cycle:one", handler_ref="EMP-1", task_kind="evaluation", target_employee_no="EMP-2")
    node = SimpleNamespace(node_type="evaluation")

    class Result:
        def first(self):
            return (task, node)

    class Db:
        async def execute(self, _statement):
            return Result()

    async def trusted(_db, _context, *, cycle_ref, require_employee_identity):
        assert cycle_ref == "cycle:one" and require_employee_identity
        return SimpleNamespace(actor_ref="EMP-3")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", trusted)
    with pytest.raises(HTTPException) as denied:
        await projects_router._self_summary_task(1, context(), Db(), "evaluation")
    assert denied.value.status_code == 404

    async def unmapped(*_args, **_kwargs):
        raise projects_router.PerformanceIdentityMappingNotFound("no identity")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", unmapped)
    with pytest.raises(HTTPException) as denied:
        await projects_router._self_summary_task(1, context(), Db(), "evaluation")
    assert denied.value.status_code == 404


def test_real_line_handlers_follow_selected_snapshot_levels():
    from app.performance.project_service import _resolve_node_handlers

    people = {
        "subject": SimpleNamespace(employee_no="subject", direct_supervisor_employee_no="m1", hrbp_employee_no=None),
        "m1": SimpleNamespace(employee_no="m1", direct_supervisor_employee_no="m2"),
        "m2": SimpleNamespace(employee_no="m2", direct_supervisor_employee_no="m3"),
        "m3": SimpleNamespace(employee_no="m3", direct_supervisor_employee_no="m4"),
        "m4": SimpleNamespace(employee_no="m4", direct_supervisor_employee_no="m5"),
        "m5": SimpleNamespace(employee_no="m5", direct_supervisor_employee_no=None),
    }
    node = {"node_type": "evaluation", "executor_label": "实线上级", "executor_types": ["DIRECT_MANAGER", "LEVEL_2_MANAGER", "LEVEL_3_MANAGER_PLUS"]}
    assert _resolve_node_handlers(node, people["subject"], people) == {"m1", "m3", "m4", "m5"}
    assert _resolve_node_handlers({**node, "executor_label": "虚线上级"}, people["subject"], people) == set()
    project_member = SimpleNamespace(employee_no="subject", direct_supervisor_employee_no="m1", hrbp_employee_no=None, project_manager_employee_no="m2")
    assert _resolve_node_handlers({"node_type": "evaluation", "executor_types": ["PROJECT_MANAGER"]}, project_member, people) == {"m2"}
    project_member.project_manager_employee_no = None
    assert _resolve_node_handlers({"node_type": "evaluation", "executor_types": ["PROJECT_MANAGER"]}, project_member, people) == set()


def test_real_line_handlers_stop_at_cyclic_supervisor_chain():
    from app.performance.project_service import _resolve_node_handlers

    people = {
        "subject": SimpleNamespace(employee_no="subject", direct_supervisor_employee_no="m1", hrbp_employee_no=None),
        "m1": SimpleNamespace(employee_no="m1", direct_supervisor_employee_no="m2"),
        "m2": SimpleNamespace(employee_no="m2", direct_supervisor_employee_no="m1"),
    }
    node = {"node_type": "reviewer_360_confirm", "executor_label": "实线上级", "executor_types": ["DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_3_MANAGER_PLUS"]}
    assert _resolve_node_handlers(node, people["subject"], people) == {"m1", "m2"}


def test_review_nodes_follow_template_executor_mapping():
    assert _review_node_category("work_summary", [], has_task=False) == "mine"
    assert _review_node_category("evaluation", ["SUBJECT"], has_task=False) == "mine"
    assert _review_node_category("evaluation", ["REAL_LINE_MANAGER"], has_task=False) == "team"
    assert _review_node_category("reviewer_360_confirm", [], has_task=False) == "team"
    assert _review_node_category("result_reconsideration", [], has_task=False) == "other"
    assert _review_node_category("evaluation", ["REVIEWER_360"], has_task=False) is None
    assert _review_node_category("evaluation", ["REVIEWER_360"], has_task=True) == "others"


def test_review_node_status_has_three_time_based_states():
    from datetime import UTC, datetime

    now = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
    assert _review_node_status("2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z", now) == "not_started"
    assert _review_node_status("2026-09-10T00:00:00Z", "2026-09-10T11:00:00Z", now) == "overdue"
    assert _review_node_status("2026-09-10T00:00:00Z", "2026-09-12T00:00:00Z", now) == "pending"


def test_review_overview_keeps_preferred_task_and_completed_state():
    from datetime import UTC, datetime

    from app.performance.projects_router import _review_task_status, _select_review_task, _task_entry_mode

    pending = SimpleNamespace(id=145, submitted_at=None, task_kind="evaluation")
    completed = SimpleNamespace(id=146, submitted_at=datetime(2026, 9, 17, tzinfo=UTC), task_kind="work_summary")

    assert _select_review_task([pending, completed], 146) is completed
    assert _select_review_task([completed, pending]) is pending
    assert _review_task_status(completed, None, None) == "completed"
    assert _review_task_status(pending, None, None) == "pending"
    assert _task_entry_mode(completed) == "template_task"
    assert _task_entry_mode(pending) == "template_task"
    assert _task_entry_mode(None) == "route"


def test_evaluation_self_task_uses_completed_template_overview_contract():
    from datetime import UTC, datetime

    from app.performance.projects_router import _TASK_ENTRY_MODES, _review_task_status, _task_entry_mode

    completed = SimpleNamespace(id=147, submitted_at=datetime(2026, 9, 17, tzinfo=UTC), task_kind="evaluation")

    assert "evaluation" in _TASK_ENTRY_MODES
    assert _task_entry_mode(completed) == "template_task"
    assert _review_task_status(completed, "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z") == "completed"


def _pm_project(project_id, name, cycle_id, *, administrators=("张三",), status="STARTED", project_ref="project:x"):
    return SimpleNamespace(
        id=project_id,
        project_ref=f"{project_ref}:{project_id}",
        cycle_ref=f"cycle:{cycle_id}",
        name=name,
        administrators=list(administrators),
        status=status,
        settings={"data_managers": ["PROJECT_ADMIN", "HRBP"]},
    )


def _pm_cycle(cycle_id, name="周期"):
    from datetime import UTC, datetime
    return SimpleNamespace(id=cycle_id, cycle_ref=f"cycle:{cycle_id}", name=name, start_at=datetime(2026, 1, 1, tzinfo=UTC), end_at=datetime(2026, 12, 31, tzinfo=UTC))


@pytest.mark.asyncio
async def test_project_management_overview_filters_cycles_and_projects_by_involvement(monkeypatch):
    from app.performance import projects_router
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    async def hrbp_scope(_db, _ref):
        return set()
    monkeypatch.setattr(projects_router, "_person_hrbp_project_refs", hrbp_scope)

    rows = [
        (_pm_project(1, "乙项目", 1, administrators=["张三"]), _pm_cycle(1, "周期一")),
        (_pm_project(2, "甲项目", 1, administrators=["李四"]), _pm_cycle(1, "周期一")),
        (_pm_project(3, "丙项目", 2, administrators=["张三"]), _pm_cycle(2, "周期二")),
    ]

    class Db:
        async def scalar(self, _query):
            return None

        async def execute(self, query):
            # SQL 层已按 status=STARTED 过滤，这里忠实返回启动项目
            model = query.column_descriptions[0].get("entity")
            from app.performance.models import PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot
            if model is projects_router.PerformanceRole:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [SimpleNamespace(code="performance.project_admin", function_permission_keys=["performance.frontend.progress"])]))
            if model in {PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot}:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            return SimpleNamespace(all=lambda: rows)

    zhang_san = PerformanceAccessContext(
        subject_type="PORTAL_USER",
        subject_id=2,
        display_name="张三",
        account_type=None,
        portal_entry_permissions=("performance.app",),
        role_grants=(),
        permission_codes=(),
    )

    result = await projects_router.project_management_overview(None, zhang_san, Db())
    assert [cycle["cycle_id"] for cycle in result["cycles"]] == [1, 2]
    assert result["active_cycle"]["cycle_id"] == 1
    assert [item["project_name"] for item in result["projects"]] == ["乙项目"]
    assert result["hrbp_scope"] == []
    assert result["category"] == {"key": "admin", "label": "项目管理员"}
    assert len(result["completion_nodes"]) == 8
    assert all(item["status"] == "unavailable" for item in result["completion_nodes"])

    explicit = await projects_router.project_management_overview(2, zhang_san, Db())
    assert explicit["active_cycle"]["cycle_id"] == 2
    assert [item["project_name"] for item in explicit["projects"]] == ["丙项目"]

    admin = await projects_router.project_management_overview(None, context("performance.cycles.manage"), Db())
    assert len(admin["cycles"]) == 2
    assert sorted(item["project_name"] for item in admin["projects"]) == ["乙项目", "甲项目"]


@pytest.mark.asyncio
async def test_project_management_overview_empty_and_missing_cycle(monkeypatch):
    import pytest as _pytest
    from fastapi import HTTPException
    from app.performance import projects_router

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    class EmptyDb:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [])

    empty = await projects_router.project_management_overview(None, context(), EmptyDb())
    assert empty == {"cycles": [], "active_cycle": None, "projects": [], "completion_nodes": [], "hrbp_scope": [], "category": {"key": "admin", "label": "项目管理员"}}

    with _pytest.raises(HTTPException) as exc_info:
        await projects_router.project_management_overview(99, context(), EmptyDb())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_project_completion_nodes_aggregate_real_deadlines_and_task_progress():
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceResultOpening

    project = _pm_project(1, "项目", 1)
    project.settings = {"flow_settings": {}}
    members = [SimpleNamespace(snapshot_id=10, employee_no="E001"), SimpleNamespace(snapshot_id=10, employee_no="E002")]
    nodes = [
        SimpleNamespace(id=11, project_id=1, node_id="summary", node_type="work_summary", node_order=1, name="工作总结", config={"template": {"executor_types": ["SUBJECT"]}, "time": {"start_at": "2026-09-01T00:00:00Z", "end_at": "2026-10-01T15:59:00Z"}}),
        SimpleNamespace(id=12, project_id=1, node_id="self", node_type="evaluation", node_order=2, name="自评", config={"template": {"executor_types": ["SUBJECT"]}, "time": {"start_at": "2026-10-01T00:00:00Z", "end_at": "2026-10-10T15:59:00Z"}}),
        SimpleNamespace(id=13, project_id=1, node_id="reconsider", node_type="result_reconsideration", node_order=3, name="结果复议处理", config={"template": {}, "time": {"start_at": "2026-09-01T00:00:00Z", "end_at": "2026-10-10T15:59:00Z"}}),
    ]
    tasks = [
        SimpleNamespace(project_id=1, node_snapshot_id=11, submitted_at=datetime(2026, 9, 20, tzinfo=UTC), status="completed"),
        SimpleNamespace(project_id=1, node_snapshot_id=11, submitted_at=None, status="pending"),
        SimpleNamespace(project_id=1, node_snapshot_id=12, submitted_at=None, status="pending"),
        SimpleNamespace(project_id=1, node_snapshot_id=13, submitted_at=None, status="pending"),
    ]

    class Db:
        async def scalar(self, _query):
            return 10

        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            if model is PerformanceProjectMember:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: members))
            if model is PerformanceProjectNodeSnapshot:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: nodes))
            if model is PerformanceNodeTask:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: tasks))
            if model is PerformanceResultOpening:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            raise AssertionError(model)

    result = await projects_router._project_completion_nodes([project], Db(), datetime(2026, 9, 23, tzinfo=UTC))
    by_key = {item["key"]: item for item in result}
    assert by_key["work-summary"]["status"] == "active"
    assert (by_key["work-summary"]["completed_count"], by_key["work-summary"]["total_count"], by_key["work-summary"]["completion_rate"]) == (1, 2, 50.0)
    assert by_key["work-summary"]["deadline_at"] == datetime(2026, 10, 1, 15, 59, tzinfo=UTC)
    assert by_key["self-review"]["status"] == "not_started"
    assert by_key["self-review"]["completion_rate"] == 0
    assert by_key["result-reconsideration"]["total_count"] == 1
    assert by_key["result-reconsideration"]["completed_count"] == 0
    assert by_key["result-reconsideration"]["completion_rate"] == 0


def test_person_in_project_administrators_matches_by_display_name():
    from app.performance.projects_router import _person_in_project_administrators

    target = _pm_project(1, "项目", 1)
    assert _person_in_project_administrators(target, "张三")
    assert not _person_in_project_administrators(target, "李四")
    assert not _person_in_project_administrators(target, None)



def test_project_scope_permissions_are_limited_to_granted_project():
    target = project(project_ref="project:one")
    assert _can_manage_project(context("performance.projects.manage", refs=("project:one",)), target)
    assert not _can_manage_project(context("performance.projects.manage", refs=("project:two",)), target)
    assert _can_manage_project(context("performance.cycles.manage"), target)
    assert not _can_manage_project(context(), target)


def _distribution_rule(assessment_item_id="grade", grade_codes=None):
    return {
        "assessment_item_id": assessment_item_id,
        "min_people_count": 8,
        "conditions": [{"control_mode": "HARD", "grade_codes": grade_codes or ["A"], "operator": "GTE", "value": 20, "unit": "PERCENT"}],
        "rounding_method": "ROUND",
    }


def test_project_distribution_accepts_all_comparison_operators():
    for operator in ("EQ", "LT", "LTE", "GT", "GTE"):
        rule = _distribution_rule()
        rule["conditions"][0]["operator"] = operator
        flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "rules": [rule], "scope_configured": False}, "phases": []}}}}
        assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["calibration-1"]["calibration"]["distribution"]["rules"][0]["conditions"][0]["operator"] == operator


def test_project_distribution_accepts_no_rounding_method():
    rule = _distribution_rule()
    rule["rounding_method"] = "NONE"
    flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "rules": [rule], "scope_configured": False}, "phases": []}}}}
    assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["calibration-1"]["calibration"]["distribution"]["rules"][0]["rounding_method"] == "NONE"


def test_project_distribution_rules_round_trip_and_reject_duplicate_assessment_item():
    distribution = {"mode": "UNIFIED", "rules": [_distribution_rule()], "scope_configured": False}
    flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": distribution, "phases": []}}}}
    assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["calibration-1"]["calibration"]["distribution"] == distribution
    duplicate = {**distribution, "rules": [_distribution_rule(), _distribution_rule()]}
    with pytest.raises(ProjectValidationError, match="同一评估项只能配置一套分布规则"):
        PerformanceProjectService._validate_flow_settings({"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": duplicate, "phases": []}}}})


def test_calibration_rule_distribution_accepts_multiple_execution_scopes_and_rejects_incomplete_scope():
    rule = _distribution_rule()
    rule["execution_scope"] = {
        "calibration_scope": True,
        "department": True,
        "other_dimension": True,
        "rules": [
            {"type": "DEPARTMENT", "values": ["研发部"]},
            {"type": "DEPARTMENT_LEVEL", "values": ["department_2"]},
            {"type": "POSITION_LEVEL", "values": ["P6"]},
        ],
    }
    calibration_rule = {
        "subject_type": "PERSON",
        "operator": "INCLUDE",
        "scope": "PROJECT_ALL",
        "allow_authorize": False,
        "distribution_rules": [rule],
    }
    flow = {"node_settings": {"calibration-1": {"calibration": {"phases": [{"rules": [calibration_rule]}]}}}}
    normalized = PerformanceProjectService._validate_flow_settings(flow)
    saved = normalized["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"][0]
    assert saved["distribution_rules"][0]["execution_scope"] == rule["execution_scope"]

    incomplete = {**rule, "execution_scope": {**rule["execution_scope"], "department": True, "rules": [{"type": "POSITION_LEVEL", "values": ["P6"]}]}}
    with pytest.raises(ProjectValidationError, match="指定部门"):
        PerformanceProjectService._validate_flow_settings({"node_settings": {"calibration-1": {"calibration": {"phases": [{"rules": [{**calibration_rule, "distribution_rules": [incomplete]}]}]}}}})


@pytest.mark.parametrize("distribution,error", [
    ({"mode": "UNIFIED", "rules": [], "scope_configured": False}, "请至少添加一条"),
    ({"mode": "BY_CALIBRATION_SCOPE", "rules": [], "scope_configured": False}, "请完善绩效结果强制 / 建议分布"),
])
def test_project_distribution_incomplete_configuration_blocks_start(distribution, error):
    flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": distribution}}}}
    with pytest.raises(ProjectValidationError, match=error):
        PerformanceProjectService._validate_distribution_start_readiness(flow, [{"node_id": "calibration-1", "node_type": "calibration"}])


def test_project_distribution_disabled_keeps_configuration_without_blocking_start():
    flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": False, "distribution": {"mode": "BY_CALIBRATION_SCOPE", "rules": [_distribution_rule()], "scope_configured": False}}}}}
    PerformanceProjectService._validate_distribution_start_readiness(flow, [{"node_id": "calibration-1", "node_type": "calibration"}])


@pytest.mark.asyncio
async def test_project_distribution_template_options_reject_unknown_assessment_and_grade():
    from app.performance.models import PerformanceTemplateWorkflow
    workflow = SimpleNamespace(nodes=[{"node_id": "final", "include_final_result": True, "content_bindings": {"fill": ["rating"]}}], content_library=[{
        "content_id": "rating", "type": "rating", "name": "评级", "items": [{"id": "grade", "label": "等级"}], "options": [{"id": "level-1", "code": "A", "label": "优秀"}],
    }])
    class Db:
        async def get(self, model, _key): return workflow if model is PerformanceTemplateWorkflow else None
    service = PerformanceProjectService(Db())
    def flow(rule): return {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "scope_configured": False, "rules": [rule]}}}}}
    with pytest.raises(ProjectValidationError, match="评估项不属于当前模板"):
        await service._validate_distribution_template_options(11, flow(_distribution_rule("missing")))
    with pytest.raises(ProjectValidationError, match="等级不属于所选评估项"):
        await service._validate_distribution_template_options(11, flow(_distribution_rule("grade", ["B"])))
    await service._validate_distribution_template_options(11, flow(_distribution_rule("grade", ["A"])))
    await service._validate_distribution_template_options(11, flow(_distribution_rule("grade", ["level-1"])))
    nested = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "phases": [{"rules": [{"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False, "distribution_rules": [_distribution_rule("missing")]}]}]}}}}
    with pytest.raises(ProjectValidationError, match="评估项不属于当前模板"):
        await service._validate_distribution_template_options(11, nested)


def test_project_flow_settings_validate_supported_editable_variants():
    settings = {
        "node_settings": {
            "invite-1": {
                "invite": {
                    "default_invite": "DIRECT_SUBORDINATES",
                    "minimum_invited_count": 5,
                    "exclude_default_invite_from_limit": True,
                    "recommended_invite": ["HRBP"],
                    "allow_voluntary_evaluation": False,
                }
            },
            "calibration-1": {
                "calibration": {
                    "force_distribution_enabled": True,
                    "phases": [{"rules": [{"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False}]}],
                }
            },
            "result-view-1": {"result_view": {"automatic_enabled": False, "manual_enabled": True, "automatic_rule": "PREVIOUS_AND_START"}},
            "reconsideration-1": {"result_reconsideration": {"handler": "HRBP"}},
        }
    }
    normalized = PerformanceProjectService._validate_flow_settings(settings)
    assert normalized["node_settings"] == settings["node_settings"]
    assert normalized["node_times"] == {}


def test_project_result_view_modes_round_trip_and_reject_invalid_rule():
    for automatic, manual in [(True, False), (False, True), (True, True), (False, False)]:
        result_view = {"automatic_enabled": automatic, "manual_enabled": manual, "automatic_rule": "PREVIOUS_IMMEDIATE"}
        flow = {"node_settings": {"view-1": {"result_view": result_view}}}
        assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["view-1"]["result_view"] == result_view
    with pytest.raises(ProjectValidationError, match="结果开通方式不合法"):
        PerformanceProjectService._validate_flow_settings({"node_settings": {"view-1": {"result_view": {"automatic_enabled": True, "manual_enabled": False, "automatic_rule": "UNKNOWN"}}}})


@pytest.mark.asyncio
async def test_new_project_manual_opening_follows_global_setting_but_existing_selection_is_preserved(monkeypatch):
    async def disabled(_cls, _db):
        return False

    monkeypatch.setattr(PerformanceProjectService, "_manual_opening_allowed_for_new_project", classmethod(disabled))
    service = PerformanceProjectService(object())
    flow = {"node_settings": {"view-1": {"result_view": {"automatic_enabled": False, "manual_enabled": True}}}}
    with pytest.raises(ProjectValidationError, match="组织内暂不允许手动开通绩效结果"):
        await service._validate_manual_opening_policy(flow)
    await service._validate_manual_opening_policy(flow, {"flow_settings": flow})


def test_project_invite_counts_round_trip_and_legacy_compatibility():
    invite = {
        "default_invite": "DIRECT_SUBORDINATES", "minimum_invited_count": 5,
        "maximum_invited_count": 8, "maximum_invite_mode": "SUGGESTED",
        "second_prompt_enabled": True, "second_prompt_count": 10, "second_prompt_mode": "SUGGESTED",
        "exclude_default_invite_from_limit": True, "recommended_invite": [], "allow_voluntary_evaluation": False,
    }
    flow = {"node_settings": {"invite-1": {"invite": invite}}}
    normalized = PerformanceProjectService._validate_flow_settings(flow)
    assert normalized["node_settings"]["invite-1"]["invite"] == invite
    assert PerformanceProjectService._validate_flow_settings(normalized) == normalized
    _, _, _, settings = PerformanceProjectService._validate_payload({"name": "360项目", "flow_settings": flow})
    target = project()
    target.settings = settings
    assert PerformanceProjectService.serialize(target)["flow_settings"]["node_settings"]["invite-1"]["invite"] == invite

    limited = {**invite, "maximum_invite_mode": "LIMIT", "second_prompt_mode": "LIMIT"}
    flow["node_settings"]["invite-1"]["invite"] = limited
    assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["invite-1"]["invite"] == limited

    legacy = {key: value for key, value in invite.items() if key not in {
        "maximum_invited_count", "maximum_invite_mode", "second_prompt_enabled", "second_prompt_count", "second_prompt_mode",
    }}
    old_flow = {"node_settings": {"invite-1": {"invite": legacy}}}
    assert PerformanceProjectService._validate_flow_settings(old_flow)["node_settings"]["invite-1"]["invite"] == legacy


@pytest.mark.parametrize(("updates", "error"), [
    ({"maximum_invited_count": 5}, "需大于最少邀请人数"),
    ({"maximum_invited_count": 4}, "需大于最少邀请人数"),
    ({"maximum_invited_count": True}, "需大于最少邀请人数"),
    ({"maximum_invited_count": 8, "second_prompt_enabled": True}, "需大于最多邀请人数"),
    ({"maximum_invited_count": 8, "second_prompt_enabled": True, "second_prompt_count": 8}, "需大于最多邀请人数"),
    ({"maximum_invited_count": 8, "second_prompt_enabled": True, "second_prompt_count": 101}, "需大于最多邀请人数"),
    ({"maximum_invited_count": 8, "second_prompt_enabled": False, "second_prompt_count": 9}, "二次触发提示人数不合法"),
    ({"maximum_invited_count": 8, "maximum_invite_mode": "UNKNOWN"}, "最多邀请人数提示方式不合法"),
    ({"second_prompt_mode": "UNKNOWN"}, "二次触发提示方式不合法"),
    ({"second_prompt_enabled": "true"}, "二次触发提示设置不合法"),
])
def test_project_invite_count_validation(updates, error):
    flow = {"node_settings": {"invite-1": {"invite": {"minimum_invited_count": 5, **updates}}}}
    with pytest.raises(ProjectValidationError, match=error):
        PerformanceProjectService._validate_flow_settings(flow)


def _calibration_rule_settings(rule):
    return {"node_settings": {"calibration-1": {"calibration": {"phases": [{"rules": [rule]}]}}}}


def test_project_calibration_rule_groups_round_trip_without_mutating_input():
    rule = {
        "subject_type": "PERSON", "operator": "EXCLUDE", "scope": "RULE", "allow_authorize": True,
        "subject_source": "RULE", "description": "  按指定人员校准  ",
        "subject_groups": [
            {"conditions": [
                {"field": "employee", "operator": "INCLUDE", "values": [" E001 ", "E002"]},
                {"field": "employee", "operator": "EXCLUDE", "values": ["E003"]},
            ]},
            {"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["E004"]}]},
        ],
        "scope_groups": [
            {"conditions": [
                {"field": "department", "operator": "INCLUDE", "values": [" 新疆事业部 "]},
                {"field": "employee", "operator": "EXCLUDE", "values": ["E003"]},
                {"field": "hire_date", "operator": "not_before", "values": ["2026-01-01"]},
            ]},
            {"conditions": [{"field": "calibrator_relation", "operator": "INCLUDE", "values": ["INDIRECT_SUBORDINATES"]}]},
        ],
    }
    payload = _calibration_rule_settings(rule)
    normalized = PerformanceProjectService._validate_flow_settings(payload)
    saved = normalized["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"][0]
    assert saved == {**rule, "description": "按指定人员校准", "subject_groups": [
        {"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["E001", "E002"]},
                        {"field": "employee", "operator": "EXCLUDE", "values": ["E003"]}]},
        rule["subject_groups"][1],
    ], "scope_groups": [
        {"conditions": [{"field": "department", "operator": "INCLUDE", "values": ["新疆事业部"]},
                        {"field": "employee", "operator": "EXCLUDE", "values": ["E003"]},
                        {"field": "hire_date", "operator": "not_before", "values": ["2026-01-01"]}]},
        rule["scope_groups"][1],
    ]}
    assert rule["subject_groups"][0]["conditions"][0]["values"][0] == " E001 "
    assert PerformanceProjectService._validate_flow_settings(normalized) == normalized
    _, _, _, settings = PerformanceProjectService._validate_payload({"name": "校准项目", "flow_settings": payload})
    assert settings["flow_settings"] == normalized
    target = project()
    target.settings = settings
    assert PerformanceProjectService.serialize(target)["flow_settings"] == normalized


def test_project_calibration_legacy_rule_keeps_four_fields():
    rule = {"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False}
    normalized = PerformanceProjectService._validate_flow_settings(_calibration_rule_settings(rule))
    assert normalized["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"] == [rule]


@pytest.mark.parametrize("changes", [
    {"scope": "RULE"},
    {"scope": "RULE", "scope_groups": []},
    {"scope_groups": []},
    {"subject_groups": []},
    {"subject_groups": [{"conditions": []}]},
    {"scope": "RULE", "scope_groups": [{"conditions": []}]},
    {"subject_groups": [{"conditions": [{"field": "department", "operator": "INCLUDE", "values": ["研发"]}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E001"]}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": []}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": [" "]}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": "E001"}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": [123]}]}]},
    {"subject_groups": [{"conditions": "bad"}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["E001", ""]}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["x" * 129]}]}]},
    {"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["E001"], "extra": 1}]}]},
    {"scope": "RULE", "scope_groups": [{"conditions": [{"field": "hire_date", "operator": "INCLUDE", "values": ["2026-01-01"]}]}]},
    {"scope": "RULE", "scope_groups": [{"conditions": [{"field": "hire_date", "operator": "before", "values": ["bad-date"]}]}]},
    {"scope": "RULE", "scope_groups": [{"conditions": [{"field": "department", "operator": "before", "values": ["新疆"]}]}]},
    {"scope_groups": [{"conditions": [{"field": "unknown", "operator": "INCLUDE", "values": ["E001"]}]}]},
    {"scope": "RULE", "scope_groups": [{"conditions": [{"field": "calibrator_relation", "operator": "INCLUDE", "values": [""]}]}]},
    {"scope": "RULE", "scope_groups": [{"conditions": [{"field": "calibrator_relation", "operator": "INCLUDE", "values": ["HRBP"]}]}]},
    {"subject_source": "IMPORT"},
    {"subject_source": ""},
    {"description": "x" * 501},
    {"description": 123},
    {"unknown": "lost"},
])
def test_project_calibration_rejects_invalid_rule_fields(changes):
    rule = {"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False, **changes}
    with pytest.raises(ProjectValidationError):
        PerformanceProjectService._validate_flow_settings(_calibration_rule_settings(rule))


@pytest.mark.parametrize("rule", [{}, None, {"subject_type": "PERSON", "scope": None}])
def test_project_calibration_rejects_empty_or_malformed_rule(rule):
    with pytest.raises(ProjectValidationError):
        PerformanceProjectService._validate_flow_settings(_calibration_rule_settings(rule))


def test_project_calibration_optional_project_all_fields():
    rule = {"subject_source": "RULE", "subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["E001"]}]}], "description": "备注"}
    normalized = PerformanceProjectService._validate_flow_settings(_calibration_rule_settings(rule))
    saved = normalized["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"][0]
    assert saved == {"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False, **rule}


def test_project_flow_settings_accepts_template_node_limit():
    node_settings = {str(index): {} for index in range(100)}
    node_times = {
        str(index): {"start_at": "2026-09-18T09:00", "end_at": "2026-09-18T18:00"}
        for index in range(100)
    }

    normalized = PerformanceProjectService._validate_flow_settings({
        "node_settings": node_settings,
        "node_times": node_times,
    })

    assert normalized["node_settings"] == node_settings
    assert normalized["node_times"] == node_times


@pytest.mark.parametrize(("field", "message"), [
    ("node_settings", "流程环节配置不能超过 100 个"),
    ("node_times", "节点时间设置不能超过 100 个"),
])
def test_project_flow_settings_rejects_more_than_template_node_limit(field, message):
    settings = {"node_settings": {}}
    settings[field] = {str(index): {} for index in range(101)}

    with pytest.raises(ProjectValidationError, match=message):
        PerformanceProjectService._validate_flow_settings(settings)


def test_self_summary_schema_preserves_content_sections_and_item_rules():
    from app.performance.self_summary_service import build_self_summary_schema, resolve_self_summary_content, sanitize_self_summary_answers, self_summary_field_requires_value, self_summary_value_empty

    resolved = resolve_self_summary_content(
        {"content_bindings": {"fill": ["summary"], "reference": ["reference"]}},
        [
            {"content_id": "summary", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "填写题名称"}]},
            {"content_id": "reference", "type": "custom", "name": "参考内容", "items": [{"id": "ref", "label": "参考"}]},
        ],
    )
    assert [content["content_slot"] for content in resolved["content"]] == ["fill", "reference"]
    assert [section["name"] for section in build_self_summary_schema(resolved)] == ["工作总结"]

    schema = build_self_summary_schema({
        "content": [
            {
                "content_id": "summary",
                "type": "work_summary",
                "name": "工作总结",
                "description": "描述",
                "items": [
                    {"id": "work", "label": "填写题名称", "hint": "提示", "settings": {"mode": "fill", "required": True}},
                    {"id": "hidden", "label": "隐藏题", "settings": {"mode": "hidden", "required": True}},
                ],
            },
            {
                "content_id": "value",
                "type": "custom",
                "questionType": "tag",
                "name": "标签型填写题",
                "description": "标签说明",
                "items": [{
                    "id": "contribution",
                    "label": "价值贡献",
                    "settings": {"mode": "fill", "required": True},
                    "options": [
                        {"id": "good", "label": "做得好的", "placeholder": "填写亮点", "required": True},
                        {"id": "improve", "label": "待改进的", "placeholder": "填写改进项"},
                    ],
                }],
            },
        ]
    })

    assert [section["name"] for section in schema] == ["工作总结", "标签型填写题"]
    assert schema[0]["fields"] == [{
        "id": "work", "type": "rich_text", "label": "填写题名称", "required": True,
        "placeholder": "提示", "options": [],
    }]
    assert [option["label"] for option in schema[1]["fields"][0]["options"]] == ["做得好的", "待改进的"]
    assert self_summary_value_empty(schema[0]["fields"][0], "<p><br></p>")
    assert self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "note": "<p>​</p>"})
    assert self_summary_field_requires_value(schema[1]["fields"][0], {"tags": ["good"], "notes": {}})
    assert self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "notes": {}})
    assert not self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "note": "完成重点项目"})
    assert not self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "notes": {"good": "完成重点项目"}})
    sanitized = sanitize_self_summary_answers(schema, {
        "work": '<script>alert(1)</script><b onclick="bad()">安全内容</b><a href="javascript:bad()">链接</a>',
        "contribution": {"tags": ["good"], "note": '<img src=x onerror="bad()"><p>说明</p>'},
    })
    assert sanitized["work"] == "<b>安全内容</b><a>链接</a>"
    assert sanitized["contribution"]["note"] == "<p>说明</p>"
    sanitized = sanitize_self_summary_answers(schema, {
        "contribution": {"tags": ["good", "improve"], "notes": {"good": "<p>亮点</p>", "improve": '<script>x</script><p>改进</p>'}},
    })
    assert sanitized["contribution"]["notes"] == {"good": "<p>亮点</p>", "improve": "<p>改进</p>"}


def test_readonly_schema_omits_item_description_for_text_tag_and_rating():
    from app.performance.self_summary_service import build_self_summary_schema

    schema = build_self_summary_schema({"content": [
        {"content_id": "text", "type": "work_summary", "name": "文本", "items": [
            {"id": "text-item", "label": "文本", "hint": "不可返回的题目描述", "settings": {"mode": "view"}},
        ]},
        {"content_id": "tag", "type": "custom", "questionType": "tag", "name": "标签", "items": [
            {"id": "tag-item", "label": "标签", "hint": "标签说明", "settings": {"mode": "view"}, "options": [{"id": "a", "label": "A"}]},
        ]},
        {"content_id": "rating", "type": "rating", "name": "评级", "items": [
            {"id": "rating-item", "label": "评级", "hint": "评级说明", "settings": {"mode": "view"}},
        ], "options": [{"id": "a", "code": "A", "label": "优秀", "color": "#3370ff"}]},
    ]})

    fields = [field for section in schema for field in section["fields"]]
    assert [field["type"] for field in fields] == ["rich_text", "tag_with_followup", "rating"]
    assert all(field["readonly"] is True and field["required"] is False for field in fields)
    assert all("description" not in field for field in fields)


@pytest.mark.parametrize("legacy_question_type", [None, "text", "tag"])
def test_self_summary_schema_maps_each_custom_item_independently(legacy_question_type):
    from copy import deepcopy
    from app.performance.self_summary_service import build_self_summary_schema
    content = {
        "type": "custom",
        "defaultAll": True,
        "options": [{"id": "legacy-option", "label": "旧选项"}],
        "items": [
            {"id": "text", "questionType": "text", "settings": {"hideName": True}},
            {"id": "tag", "questionType": "tag", "defaultAll": False,
             "options": [{"id": "item-option", "label": "题目选项"}]},
            {"id": "tag-fallback", "questionType": "tag"},
            {"id": "legacy"},
        ],
        "future_content": {"enabled": True},
    }
    if legacy_question_type is not None:
        content["questionType"] = legacy_question_type
    template = {"content": [content]}
    original = deepcopy(template)

    fields = build_self_summary_schema(template)[0]["fields"]

    assert [field["type"] for field in fields] == [
        "rich_text", "tag_with_followup", "tag_with_followup",
        "tag_with_followup" if legacy_question_type == "tag" else "rich_text",
    ]
    assert fields[0]["options"] == []
    assert fields[0]["hide_name"] is True
    assert fields[1]["hide_name"] is False
    assert fields[1]["hide_description"] is False
    assert fields[1]["default_all"] is False
    assert fields[2]["default_all"] is True
    assert fields[2]["hide_name"] is False
    assert fields[2]["description"] == ""
    assert "default_all" not in fields[0]
    assert [option["id"] for option in fields[2]["options"]] == ["legacy-option"]
    assert fields[3]["options"] == (fields[2]["options"] if legacy_question_type == "tag" else [])
    assert all("hideName" not in field and "defaultAll" not in field for field in fields)
    assert template == original


@pytest.mark.parametrize("hide_name,hide_description", [(False, False), (True, False), (False, True), (True, True)])
def test_self_summary_tag_display_flags_preserve_description_options_and_source(hide_name, hide_description):
    from copy import deepcopy
    from app.performance.self_summary_service import build_self_summary_schema

    template = {"content": [{"type": "custom", "questionType": "tag", "items": [
        {"id": "tag", "label": "标签题", "hint": "标签题描述", "settings": {"hideName": hide_name, "hideDescription": hide_description},
         "options": [{"id": "a", "label": "选项A", "placeholder": "补充提示"}]},
        {"id": "text", "questionType": "text", "hint": "文本提示"},
        {"id": "hidden", "settings": {"mode": "hidden"}},
    ]}]}
    original = deepcopy(template)
    fields = build_self_summary_schema(template)[0]["fields"]
    assert [field["id"] for field in fields] == ["tag", "text"]
    assert fields[0]["hide_name"] is hide_name
    assert fields[0]["hide_description"] is hide_description
    assert fields[0]["label"] == ("" if hide_name else "标签题")
    assert fields[0]["description"] == ("" if hide_description else "标签题描述")
    assert fields[0]["placeholder"] == ("" if hide_description else "请输入补充说明")
    assert fields[0]["options"][0]["placeholder"] == "补充提示"
    assert "hide_description" not in fields[1]
    assert template == original


def test_readonly_schema_crops_tag_description_and_preserves_existing_field_types():
    from copy import deepcopy
    from app.performance.self_summary_service import build_self_summary_schema

    template = {"content": [
        {"content_id": "summary", "type": "work_summary", "items": [
            {"id": "summary-text", "hint": "只读文本提示", "settings": {"mode": "view", "required": True}},
        ]},
        {"content_id": "custom", "type": "custom", "items": [
            {"id": "tag", "questionType": "tag", "hint": "不应返回的标签题描述", "settings": {"mode": "view", "required": True},
             "options": [{"id": "a", "label": "标签A", "placeholder": "选项补充提示"}]},
            {"id": "text", "questionType": "text", "hint": "只读自定义文本提示", "settings": {"mode": "view"}},
        ]},
        {"content_id": "rating", "type": "rating", "items": [
            {"id": "rating-item", "hint": "只读评级提示", "settings": {"mode": "view", "required": True}},
        ], "options": [{"id": "excellent", "label": "优秀"}]},
    ]}
    before = deepcopy(template)

    fields = {field["id"]: field for section in build_self_summary_schema(template) for field in section["fields"]}

    assert {key: field["type"] for key, field in fields.items()} == {
        "summary-text": "rich_text", "tag": "tag_with_followup", "text": "rich_text", "rating-item": "rating",
    }
    assert all(field["readonly"] is True and field["required"] is False for field in fields.values())
    assert "description" not in fields["tag"]
    assert "不应返回的标签题描述" not in str(fields)
    assert fields["tag"]["options"][0]["placeholder"] == "选项补充提示"
    assert fields["summary-text"]["placeholder"] == ""
    assert fields["text"]["placeholder"] == ""
    assert fields["rating-item"]["placeholder"] == ""
    assert template == before


def test_tag_schema_keeps_description_separate_from_empty_option_prompt():
    from copy import deepcopy
    from app.performance.self_summary_service import build_self_summary_schema

    template = {"content": [{"content_id": "tags", "type": "custom", "questionType": "tag", "items": [
        {"id": "tag", "label": "标签题", "hint": "可见题目描述", "options": [
            {"id": "missing", "label": "缺少提示"},
            {"id": "empty", "label": "显式空提示", "placeholder": ""},
            {"id": "prompt", "label": "独立提示", "placeholder": "专属标签提示"},
        ]},
    ]}]}
    before = deepcopy(template)
    field = build_self_summary_schema(template)[0]["fields"][0]
    assert field["description"] == "可见题目描述"
    assert field["placeholder"] == "请输入补充说明"
    assert [option["placeholder"] for option in field["options"]] == ["", "", "专属标签提示"]
    assert template == before


def test_self_summary_schema_defaults_display_and_tag_selection_flags():
    from app.performance.self_summary_service import build_self_summary_schema

    fields = build_self_summary_schema({"content": [{
        "type": "custom", "items": [{"id": "text"}, {"id": "tag", "questionType": "tag"}],
    }]})[0]["fields"]

    assert all(
        field.get("hide_name", False) is False and field.get("default_all", False) is False
        for field in fields
    )


def test_self_summary_content_completes_partial_inline_bindings_without_losing_unknown_fields():
    from copy import deepcopy
    from app.performance.self_summary_service import build_self_summary_schema, resolve_self_summary_content

    inline = {
        "id": "shared", "type": "custom", "name": "环节内填写内容",
        "items": [{"id": "inline", "future_item": {"value": 1}}],
        "future_content": {"value": 2},
    }
    template = {
        "content": [inline, {"id": "inline-only", "type": "reference", "content_slot": "reference"}],
        "content_bindings": {"reference": ["shared"], "fill": ["shared", "missing", "missing", "absent"]},
        "future_node": {"value": 3},
    }
    library = [
        {"content_id": "shared", "type": "custom", "name": "内容库版本", "items": [{"id": "library"}]},
        {"content_id": "missing", "type": "custom", "items": [{"id": "added"}], "future_library": {"value": 4}},
    ]
    original_template, original_library = deepcopy(template), deepcopy(library)

    resolved = resolve_self_summary_content(template, library)

    assert resolved["content"] == [
        inline, template["content"][1],
        {**library[1], "content_slot": "fill"},
    ]
    assert resolved["future_node"] == template["future_node"]
    assert resolved["content_bindings"] == template["content_bindings"]
    assert [section["fields"][0]["id"] for section in build_self_summary_schema(resolved)] == ["inline", "added"]
    assert resolve_self_summary_content(resolved, library) == resolved
    resolved["content"][0]["future_content"]["value"] = 99
    resolved["content"][2]["future_library"]["value"] = 99
    assert template == original_template
    assert library == original_library


@pytest.mark.asyncio
async def test_self_summary_template_expands_rating_rule_options():
    from app.performance.self_summary_service import hydrate_self_summary_template

    class Result:
        def all(self):
            question = SimpleNamespace(id=101, description="评级说明", display_mode="下拉样式")
            rule = SimpleNamespace(config={"levels": [
                {"id": "one", "name": "1星", "color": "#f54a45"},
                {"id": "five", "name": "5星", "color": "#3370ff"},
            ]})
            return [(question, rule)]

    class Db:
        async def execute(self, _statement):
            return Result()

    hydrated = await hydrate_self_summary_template({
        "content": [{
            "type": "rating", "name": "评分评级",
            "items": [{"id": "101", "label": "绩效评级"}],
        }]
    }, Db())

    content = hydrated["content"][0]
    assert content["description"] == "评级说明"
    assert content["ratingDisplayMode"] == "下拉样式"
    assert content["options"] == [
        {"id": "one", "name": "1星", "label": "1星", "color": "#f54a45", "placeholder": "", "required": False},
        {"id": "five", "name": "5星", "label": "5星", "color": "#3370ff", "placeholder": "", "required": False},
    ]


@pytest.mark.asyncio
async def test_self_summary_rating_hydration_preserves_inline_display_and_content_fields():
    from app.performance.self_summary_service import hydrate_self_summary_template

    class Result:
        def all(self):
            question = SimpleNamespace(id=101, description="全局说明", display_mode="下拉样式")
            rule = SimpleNamespace(config={"levels": [
                {"id": "one", "name": "全局名称", "color": "#f54a45", "code": "ONE"},
                {"id": "five", "name": "五星", "color": "#3370ff"},
            ]})
            return [(question, rule)]

    class Db:
        async def execute(self, _statement):
            return Result()

    template = {
        "content": [{
            "type": "rating", "ratingOptionId": "101", "ratingDisplayMode": "标签样式",
            "description": "局部说明", "settings": {"required": False},
            "items": [{"id": "101", "label": "局部评级名称", "hint": "局部提示", "settings": {"required": True}}],
            "options": [{"id": "one", "label": "局部名称", "placeholder": "局部提示", "required": True}, {"id": "five"}],
        }]
    }

    content = (await hydrate_self_summary_template(template, Db()))["content"][0]

    assert content["ratingDisplayMode"] == "标签样式"
    assert content["description"] == "局部说明"
    assert content["settings"] == {"required": False}
    assert content["items"] == [{"id": "101", "label": "局部评级名称", "hint": "局部提示", "settings": {"required": True}}]
    assert content["options"][0] == {"id": "one", "label": "局部名称", "name": "全局名称", "placeholder": "局部提示", "required": True, "code": "ONE", "color": "#f54a45"}
    assert content["options"][1]["label"] == "五星"
    assert content["options"][1]["color"] == "#3370ff"
    template["content"][0]["options"] = []
    template["content"][0]["description"] = ""
    empty = (await hydrate_self_summary_template(template, Db()))["content"][0]
    assert empty["options"] == []
    assert empty["description"] == ""


@pytest.mark.asyncio
async def test_self_summary_rating_hydration_backfills_by_code_without_overwriting_local_values():
    from app.performance.self_summary_service import hydrate_self_summary_template

    levels = [
        {"id": "one", "code": "ONE", "name": "全局名称", "description": "全局说明", "color": "#f54a45"},
        {"id": "five", "code": "FIVE", "name": "五星", "level_description": "旧字段说明", "color": "#3370ff"},
    ]

    class Db:
        async def execute(self, _statement):
            question = SimpleNamespace(id=101, description="", display_mode="标签样式")
            return SimpleNamespace(all=lambda: [(question, SimpleNamespace(config={"levels": levels}))])

    template = {"content": [{
        "type": "rating", "ratingOptionId": "101", "items": [{"id": "101"}],
        "options": [
            {"code": "ONE", "label": "", "name": "", "description": [], "color": "", "placeholder": ""},
            {"id": "five", "code": "历史编码", "level_description": "局部旧字段说明"},
        ],
    }]}

    options = (await hydrate_self_summary_template(template, Db()))["content"][0]["options"]

    assert options[0] == {
        "id": "one", "code": "ONE", "label": "", "name": "", "description": [],
        "color": "", "placeholder": "", "required": False,
    }
    assert options[1] == {
        "id": "five", "code": "历史编码", "name": "五星", "label": "五星",
        "level_description": "局部旧字段说明", "description": "局部旧字段说明",
        "color": "#3370ff", "placeholder": "", "required": False,
    }
    assert template["content"][0]["options"][0] == {
        "code": "ONE", "label": "", "name": "", "description": [], "color": "", "placeholder": "",
    }



def test_self_summary_legacy_rating_keeps_mixed_item_order():
    from app.performance.self_summary_service import build_self_summary_schema

    schema = build_self_summary_schema({"content": [{
        "content_id": "rating",
        "type": "rating",
        "name": "评分评级",
        "ratingOptionId": "new",
        "options": [{"id": "a", "label": "优秀", "color": "#3370ff"}],
        "items": [
            {"id": "old", "label": "旧评估项"},
            {"id": "new", "label": "新评估项"},
            {"id": "fill", "kind": "fill", "label": "自定义填写", "questionType": "text"},
            {"id": "notice", "kind": "prompt", "label": "提示", "prompt": {"title": "提示", "content": "说明", "color": "#3B82F6", "scope": "all"}},
        ],
    }]})

    assert [field["id"] for field in schema[0]["fields"]] == ["old", "new", "fill"]
    assert [field["type"] for field in schema[0]["fields"]] == ["rating", "rating", "rich_text"]
    assert schema[0]["fields"][1]["label"] == "新评估项"
    assert schema[0]["fields"][0]["options"] == [{"id": "a", "label": "优秀", "color": "#3370ff", "placeholder": "", "required": False}]


@pytest.mark.asyncio
async def test_mixed_content_hydration_and_answers_exclude_prompts():
    from copy import deepcopy
    from app.performance.self_summary_service import (
        build_self_summary_schema, hydrate_self_summary_template, project_self_summary_answers,
        sanitize_self_summary_answers, self_summary_field_requires_value,
    )

    prompt = {"title": "提醒", "content": "请如实填写", "color": "#3B82F6", "scope": "all"}
    template = {"content": [
        {"type": "prompt", "prompt": prompt, "items": [{"id": "bad", "settings": {"required": True}}]},
        {"content_id": "mixed", "type": "rating", "ratingOptionId": "101", "items": [
            {"id": "text", "kind": "fill", "questionType": "text", "settings": {"required": True}},
            {"id": "notice", "kind": "prompt", "prompt": prompt, "settings": {"required": True}},
            {"id": "local-rating", "kind": "rating", "ratingOptionId": "102"},
            {"id": "101", "label": "原评估项"},
            {"id": "tag", "kind": "fill", "questionType": "tag", "options": [{"id": "t", "label": "标签"}]},
        ]},
    ]}
    before = deepcopy(template)

    class Db:
        async def execute(self, _statement):
            return SimpleNamespace(all=lambda: [
                (SimpleNamespace(id=101, description="原题", display_mode="标签样式"), SimpleNamespace(config={"levels": [{"id": "a", "name": "原评级"}]})),
                (SimpleNamespace(id=102, description="新增题", display_mode="下拉样式"), SimpleNamespace(config={"levels": [{"id": "b", "name": "新评级"}]})),
            ])

    hydrated = await hydrate_self_summary_template(template, Db())
    items = hydrated["content"][1]["items"]
    assert [item["id"] for item in items] == ["text", "notice", "local-rating", "101", "tag"]
    assert items[0] == template["content"][1]["items"][0]
    assert items[1] == template["content"][1]["items"][1]
    assert items[-1] == template["content"][1]["items"][-1]
    assert items[2]["options"][0]["id"] == "b"
    schema = build_self_summary_schema(hydrated)
    fields = schema[0]["fields"]
    assert [field["id"] for field in fields] == ["text", "local-rating", "101", "tag"]
    assert [field["type"] for field in fields] == ["rich_text", "rating", "rating", "tag_with_followup"]
    assert fields[1]["display_mode"] == "下拉样式"
    assert [field["options"][0]["id"] for field in fields[1:]] == ["b", "a", "t"]
    assert self_summary_field_requires_value(fields[0], "")
    answers = {"notice": "must not persist", "bad": "must not persist", "text": "正文", "local-rating": "b", "101": "a", "tag": {"tags": ["t"]}}
    expected = {key: value for key, value in answers.items() if key not in {"notice", "bad"}}
    assert sanitize_self_summary_answers(schema, answers) == expected
    assert project_self_summary_answers(schema, answers) == expected
    assert template == before


def test_prompt_only_schema_has_no_answer_fields():
    from app.performance.self_summary_service import build_self_summary_schema

    assert build_self_summary_schema({"content": [
        {"type": "prompt", "items": [{"id": "fake", "kind": "rating"}]},
        {"type": "rating", "items": [{"id": "notice", "kind": "prompt", "settings": {"required": True}}]},
    ]}) == []


@pytest.mark.asyncio
async def test_reference_tabs_include_unsubmitted_node_and_manager_reminder(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    task = SimpleNamespace(
        id=10,
        project_id=3,
        member_snapshot_id=21,
        target_employee_no="E001",
        handler_ref="M001",
        task_kind="evaluation",
        submitted_at=None,
        answers={},
    )
    node = SimpleNamespace(
        id=31,
        project_id=3,
        node_id="manager-review",
        node_type="evaluation",
        name="上级评估",
        config={"template": {"executor_types": ["DIRECT_MANAGER"]}},
    )
    reference_node = SimpleNamespace(
        id=32,
        project_id=3,
        node_id="work-summary",
        node_type="work_summary",
        name="工作总结环节",
        config={"template": {}},
    )
    reference_task = SimpleNamespace(
        id=11,
        project_id=3,
        member_snapshot_id=21,
        node_snapshot_id=32,
        target_employee_no="E001",
        handler_ref="E001",
        available_at=None,
        due_at=None,
        submitted_at=None,
        answers={"work": "草稿"},
    )
    project = SimpleNamespace(id=3, settings={"template_id": 77})

    async def current_template(*_args):
        return {"content": [{"content_slot": "reference", "reference_kind": "node", "reference_value": "work-summary"}]}

    async def reference_template(*_args):
        return {"content": [{"content_slot": "fill", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "总结"}]}]}

    class Result:
        def __init__(self, values):
            self.values = values

        def scalars(self):
            return SimpleNamespace(all=lambda: self.values)

    class Db:
        async def get(self, model, _identity):
            return None

        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            if model is PerformanceProjectNodeSnapshot:
                return Result([reference_node])
            if model is PerformanceNodeTask:
                return Result([reference_task])
            raise AssertionError(model)

    monkeypatch.setattr(projects_router, "_self_summary_template", current_template)
    monkeypatch.setattr(projects_router, "_reference_template", reference_template)
    tabs = await projects_router._reference_tabs(task, node, project, "M001", Db())

    assert len(tabs) == 1
    assert tabs[0]["node_name"] == "工作总结环节"
    assert tabs[0]["status"] == "pending"
    assert tabs[0]["form_schema"] == []
    assert tabs[0]["answers"] == {}
    assert tabs[0]["can_remind"] is True


@pytest.mark.asyncio
async def test_self_summary_detail_keeps_template_title_and_returns_snapshot_person(monkeypatch):
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        task_kind="work_summary",
        member_snapshot_id=21,
        target_employee_no="E001",
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=3,
        answers={"work": "已完成"},
    )
    node = SimpleNamespace(node_id="summary", name="模板手动维护名称", config={"template": {
        "content": [{
            "content_id": "summary", "type": "work_summary", "name": "工作总结", "description": "描述",
            "items": [{"id": "work", "label": "填写题名称", "settings": {"required": True}}],
        }]
    }})
    member = SimpleNamespace(display_name="刘琦", company_org="产品中心", organization_ref="产品中心", direct_supervisor_employee_no="M001")

    async def fake_task(*_args):
        return task, node

    class Db:
        def __init__(self):
            self.values = [member, "刘芝萍"]

        async def scalar(self, _statement):
            return self.values.pop(0)

        async def get(self, _model, _id):
            return SimpleNamespace(settings={"flow_settings": {"node_times": {"summary": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    async def allow_overdue(*_args):
        return True
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow_overdue)
    result = await projects_router.get_self_summary(9, context(), Db())

    assert result["task_id"] == 9
    assert result["task_kind"] == "work_summary"
    assert result["entry_mode"] == "template_task"
    assert result["node_name"] == "模板手动维护名称"
    assert result["deadline_at"].isoformat() == "2026-09-30T00:00:00+00:00"
    assert {key: result["person"][key] for key in ("employee_no", "display_name", "department", "direct_supervisor_name")} == {
        "employee_no": "E001",
        "display_name": "刘琦",
        "department": "产品中心",
        "direct_supervisor_name": "刘芝萍",
    }
    assert result["person"]["visibility_role"] == "other"
    assert result["person"]["profile_fields"] == [
        {"key": "department", "label": "部门", "value": "产品中心"},
        {"key": "direct_supervisor", "label": "直属上级", "value": "刘芝萍"},
    ]
    assert result["form_schema"][0]["name"] == "工作总结"
    assert result["answers"] == {"work": "已完成"}

    task.task_kind = "evaluation"
    evaluation = await projects_router.get_template_task(9, context(), Db())
    assert evaluation["task_kind"] == "evaluation"
    assert evaluation["entry_mode"] == "template_task"
    assert evaluation["answers"] == {"work": "已完成"}


@pytest.mark.asyncio
async def test_self_summary_partial_draft_merges_existing_answers(monkeypatch):
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=1,
        answers={"work": "原内容", "other": "保留内容"},
        status="pending",
        completed_at=None,
    )
    node = SimpleNamespace(node_id="summary", config={"template": {"content": [{
        "content_id": "summary", "type": "work_summary", "name": "工作总结",
        "items": [{"id": "work", "label": "填写题名称", "settings": {"required": False}}],
    }]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        async def get(self, _model, _id):
            return None

        async def commit(self):
            return None

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    async def allow_overdue(*_args):
        return True
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow_overdue)
    result = await projects_router._save_self_summary(
        9,
        projects_router.SelfSummaryAnswersPayload(answers={"work": "新内容"}, version=1),
        False,
        context(),
        Db(),
    )

    assert task.answers == {"work": "新内容", "other": "保留内容"}
    assert result["version"] == 2


@pytest.mark.asyncio
async def test_self_summary_legacy_empty_snapshot_falls_back_to_matching_template_node():
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceTemplateWorkflow

    task = SimpleNamespace(project_id=3)
    node = SimpleNamespace(node_id="summary", config={"template": {"node_id": "summary", "content_bindings": {"fill": []}}})
    project = SimpleNamespace(settings={"template_id": 77})
    workflow = SimpleNamespace(
        nodes=[{"node_id": "summary", "content_bindings": {"fill": ["content-1"]}}],
        content_library=[{"content_id": "content-1", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "填写题名称"}]}],
    )

    class Db:
        async def get(self, model, identity):
            if model is PerformanceProject and identity == 3:
                return project
            if model is PerformanceTemplateWorkflow and identity == 77:
                return workflow
            return None

    template = await projects_router._self_summary_template(task, node, Db())
    assert template["content"][0]["content_id"] == "content-1"
    assert template["content"][0]["content_slot"] == "fill"


def test_self_summary_repeatable_section_uses_aligned_answer_arrays():
    from app.performance.self_summary_service import (
        build_self_summary_schema,
        iter_self_summary_field_instances,
        sanitize_self_summary_answers,
        self_summary_instance_count,
    )

    schema = build_self_summary_schema({"content": [{
        "content_id": "summary",
        "type": "work_summary",
        "name": "工作总结",
        "settings": {"allowMultiple": True},
        "items": [
            {"id": "work", "label": "总结", "settings": {"required": True}},
            {"id": "result", "label": "结果", "settings": {"required": False}},
        ],
    }]})
    section = schema[0]
    assert section["allow_multiple"] is True
    answers = {"work": ["<b>第一条</b>", "<script>x</script><p>第二条</p>"], "result": ["完成"]}
    sanitized = sanitize_self_summary_answers(schema, answers)

    assert sanitized["work"] == ["<b>第一条</b>", "<p>第二条</p>"]
    assert sanitized["result"] == ["完成"]
    assert self_summary_instance_count(section, sanitized) == 2
    instances = list(iter_self_summary_field_instances(schema, sanitized))
    assert [(field["id"], index, value) for _section, field, index, value in instances] == [
        ("work", 0, "<b>第一条</b>"),
        ("result", 0, "完成"),
        ("work", 1, "<p>第二条</p>"),
        ("result", 1, None),
    ]


@pytest.mark.parametrize("enabled", [False, True])
def test_rating_unknown_is_template_driven_and_not_a_real_grade(enabled):
    from copy import deepcopy
    from fastapi import HTTPException
    from app.performance.self_summary_service import build_self_summary_schema, sanitize_self_summary_answers, self_summary_instance_unknown

    template = {"content": [{"type": "rating", "content_id": "rating", "settings": {"allowUnknown": enabled, "allowMultiple": True},
        "items": [{"id": "grade", "label": "评级", "settings": {"required": True}}], "options": [{"id": "a", "label": "A"}]}]}
    original = deepcopy(template)
    schema = build_self_summary_schema(template)
    field = schema[0]["fields"][0]
    assert field["allow_unknown"] is enabled
    assert [option["id"] for option in field["options"]] == ["a"]
    answers = {"grade": ["__unknown__", "a"], "unrelated": "保留"}
    if enabled:
        assert sanitize_self_summary_answers(schema, answers) == {"grade": answers["grade"]}
        assert self_summary_instance_unknown(schema[0], answers, 0)
        assert not self_summary_instance_unknown(schema[0], answers, 1)
    else:
        with pytest.raises(HTTPException) as exc:
            sanitize_self_summary_answers(schema, answers)
        assert exc.value.status_code == 400
        assert exc.value.detail == {"code": "VALIDATION_FAILED", "field_id": "grade"}
    assert template == original


def test_unknown_skip_is_scoped_to_content_instance_and_keeps_other_answers():
    from app.performance.self_summary_service import self_summary_instance_unknown, sanitize_self_summary_answers

    section = {"allow_multiple": True, "fields": [
        {"id": "grade", "type": "rating", "allow_unknown": True},
        {"id": "note", "type": "rich_text", "required": True},
    ]}
    other = {"fields": [{"id": "other", "type": "rich_text", "required": True}]}
    answers = {"grade": ["__unknown__", "a"], "note": ["保留说明", ""], "other": ""}
    assert self_summary_instance_unknown(section, answers, 0)
    assert not self_summary_instance_unknown(section, answers, 1)
    assert not self_summary_instance_unknown(other, answers, 0)
    assert sanitize_self_summary_answers([section, other], answers) == answers
    assert not self_summary_instance_unknown({"fields": [{"id": "grade", "type": "rating"}]}, {"grade": "__unknown__"}, 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("other_value,success", [("", False), ("其他内容已填", True)])
async def test_submit_unknown_skips_only_its_content(monkeypatch, other_value, success):
    from fastapi import HTTPException
    from app.performance import projects_router

    task = SimpleNamespace(id=9, project_id=3, available_at=None, due_at=None, submitted_at=None, answer_version=1, answers={}, status="pending", completed_at=None)
    node = SimpleNamespace(node_id="summary", config={"template": {"content": [
        {"content_id": "rating", "type": "rating", "settings": {"allowUnknown": True}, "items": [{"id": "grade", "settings": {"required": True}}]},
        {"content_id": "other", "type": "work_summary", "items": [{"id": "other", "settings": {"required": True}}]},
    ]}})
    async def fake_task(*_args):
        return task, node
    async def allow_overdue(*_args):
        return True
    class Db:
        async def get(self, *_args):
            return None
        async def commit(self):
            return None
    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow_overdue)
    payload = projects_router.SelfSummaryAnswersPayload(answers={"grade": "__unknown__", "other": other_value}, version=1)
    if success:
        result = await projects_router._save_self_summary(9, payload, True, context(), Db())
        assert result["answers"] == payload.answers
        assert task.status == "completed"
    else:
        with pytest.raises(HTTPException) as exc:
            await projects_router._save_self_summary(9, payload, True, context(), Db())
        assert exc.value.detail == {"code": "VALIDATION_FAILED", "field_id": "other"}
        assert task.answer_version == 1


@pytest.mark.asyncio
async def test_self_summary_repeatable_required_field_validates_every_instance(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=1,
        answers={},
        status="pending",
        completed_at=None,
    )
    node = SimpleNamespace(node_id="summary", config={"template": {"content": [{
        "content_id": "summary",
        "type": "work_summary",
        "name": "工作总结",
        "settings": {"allowMultiple": True},
        "items": [{"id": "work", "label": "总结", "settings": {"required": True}}],
    }]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        async def get(self, _model, _id):
            return None

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    with pytest.raises(HTTPException) as exc:
        await projects_router._save_self_summary(
            9,
            projects_router.SelfSummaryAnswersPayload(answers={"work": ["第一条", ""]}, version=1),
            True,
            context(),
            Db(),
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == {"code": "VALIDATION_FAILED", "field_id": "work"}


@pytest.mark.asyncio
async def test_live_project_time_replaces_stale_snapshot_and_task_deadline():
    from datetime import UTC, datetime
    from app.performance.projects_router import _node_timing, _task_window

    old = {"start_at": "2026-09-20T00:00:00+08:00", "end_at": "2026-09-30T23:59:00+08:00"}
    updated = {"start_at": "2026-09-16T00:00:00+08:00", "end_at": old["end_at"]}
    node = SimpleNamespace(node_id="manager-review", config={"template": {"name": "上级评估"}, "time": old})
    task = SimpleNamespace(available_at=datetime(2026, 9, 19, 16, tzinfo=UTC), due_at=datetime(2026, 9, 30, 15, 59, tzinfo=UTC))
    target = SimpleNamespace(settings={"flow_settings": {"node_times": {"manager-review": updated}}})
    now = datetime(2026, 9, 17, 12, tzinfo=UTC)
    assert _review_node_status(**old, now=now) == "not_started"
    assert _review_node_status(**_node_timing(target, node), now=now) == "pending"
    assert _task_window(task, node, target) == (datetime(2026, 9, 15, 16, tzinfo=UTC), datetime(2026, 9, 30, 15, 59, tzinfo=UTC))
    assert node.config["time"] == old
    assert task.available_at == datetime(2026, 9, 19, 16, tzinfo=UTC)


def test_live_project_time_controls_task_opening_and_late_submission(monkeypatch):
    from datetime import UTC, datetime, timedelta
    from app.performance.projects_router import _self_summary_state, _task_window

    current = datetime(2026, 9, 17, 12, tzinfo=UTC)
    monkeypatch.setattr('app.performance.projects_router.datetime', SimpleNamespace(now=lambda _tz: current))
    task = SimpleNamespace(available_at=None, due_at=None, submitted_at=None)
    node = SimpleNamespace(node_id="summary", node_type="work_summary", config={"time": {"start_at": "2026-09-16T00:00:00Z"}})
    project = SimpleNamespace(settings={"flow_settings": {"node_times": {"summary": {"start_at": "2026-09-18T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})
    assert _self_summary_state(task, *_task_window(task, node, project)) == (False, False)
    project.settings["flow_settings"]["node_times"]["summary"]["start_at"] = "2026-09-16T00:00:00Z"
    assert _self_summary_state(task, *_task_window(task, node, project)) == (True, True)
    project.settings["flow_settings"]["node_times"]["summary"]["end_at"] = "2026-09-16T23:59:00Z"
    assert _self_summary_state(task, *_task_window(task, node, project), False) == (False, False)
    task.submitted_at = None
    assert _self_summary_state(task, *_task_window(task, node, project), True) == (True, True)
    task.submitted_at = current - timedelta(days=1)
    assert _self_summary_state(task, *_task_window(task, node, project)) == (False, False)


def test_missing_live_project_time_falls_back_to_historical_node_or_task():
    from datetime import UTC, datetime
    from app.performance.projects_router import _node_timing, _task_window

    task = SimpleNamespace(available_at=datetime(2026, 9, 16, tzinfo=UTC), due_at=datetime(2026, 9, 30, tzinfo=UTC))
    node = SimpleNamespace(node_id="summary", config={"time": {"start_at": "2026-09-18T00:00:00Z"}})
    project = SimpleNamespace(settings={"flow_settings": {"node_times": {}}})
    assert _node_timing(project, node) == node.config["time"]
    assert _task_window(task, node, project)[0] == datetime(2026, 9, 18, tzinfo=UTC)
    node.config = {}
    assert _task_window(task, node, project) == (task.available_at, task.due_at)
    project.settings["flow_settings"]["node_times"]["summary"] = {}
    assert _task_window(task, node, project) == (None, None)

@pytest.mark.asyncio
async def test_rescheduled_project_overview_and_timeline_read_current_settings(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 17, 12, tzinfo=tz)

    monkeypatch.setattr(projects_router, "datetime", Clock)
    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    target = project("STARTED")
    target.name = "绩效项目"
    target.settings = {"flow_settings": {"node_settings": {}, "node_times": {"manager-review": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}}
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="上级评估", config={"time": {"start_at": "2026-09-20T00:00:00Z"}, "template": {"executor_types": ["DIRECT_MANAGER"]}})
    cycle = SimpleNamespace(name="周期", start_at=Clock(2026, 9, 1, tzinfo=UTC), end_at=Clock(2026, 10, 1, tzinfo=UTC))
    task = SimpleNamespace(id=20, project_id=1, node_snapshot_id=10, handler_ref="E001", available_at=Clock(2026, 9, 20, tzinfo=UTC), due_at=Clock(2026, 9, 30, tzinfo=UTC))

    class Db:
        def __init__(self):
            self.calls = 0

        async def scalar(self, _query):
            return 20

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

        async def execute(self, _query):
            self.calls += 1
            values = [[(target, cycle)], [node], [], [task]]
            rows = values[self.calls - 1]
            return SimpleNamespace(all=lambda: rows, scalars=lambda: SimpleNamespace(all=lambda: rows))

        def add(self, _record):
            pass

        async def commit(self):
            pass

        async def refresh(self, _project):
            pass

    db = Db()
    old = await projects_router.review_overview(1, context("performance.cycles.manage"), db)
    assert old["categories"][2]["nodes"][0]["status"] == "not_started"
    await PerformanceProjectService(db).update_project(target, {"flow_settings": {"node_settings": {}, "node_times": {"manager-review": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}}, actor_type="PORTAL_USER", actor_id=1)
    db.calls = 0
    current = await projects_router.review_overview(1, context("performance.cycles.manage"), db)
    review_node = current["categories"][2]["nodes"][0]
    assert (review_node["status"], review_node["start_at"]) == ("pending", "2026-09-16T00:00:00Z")
    db.calls = 1
    timeline = await projects_router.workbench_timeline(1, context("performance.cycles.manage"), db)
    assert (timeline[0]["status"], timeline[0]["start_at"]) == ("pending", "2026-09-16T00:00:00Z")
    assert node.config["time"]["start_at"] == "2026-09-20T00:00:00Z"
    assert task.available_at == Clock(2026, 9, 20, tzinfo=UTC)

@pytest.mark.asyncio
async def test_self_summary_save_uses_live_project_window_not_frozen_task(monkeypatch):
    from datetime import UTC, datetime
    from fastapi import HTTPException
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 17, 12, tzinfo=tz)

    monkeypatch.setattr(projects_router, "datetime", Clock)
    target = SimpleNamespace(settings={"flow_settings": {"node_times": {"summary": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})
    task = SimpleNamespace(project_id=1, available_at=Clock(2026, 9, 20, tzinfo=UTC), due_at=Clock(2026, 9, 30, tzinfo=UTC), submitted_at=None, status="pending", completed_at=None, answers={}, answer_version=1)
    node = SimpleNamespace(node_id="summary", config={"time": {"start_at": "2026-09-20T00:00:00Z"}, "template": {"content": [{"content_id": "summary", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "总结", "settings": {"required": False}}]}]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        def __init__(self):
            self.commits = 0

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

        async def commit(self):
            self.commits += 1

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    async def allow_overdue(*_args):
        return True
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow_overdue)
    db = Db()
    payload = projects_router.SelfSummaryAnswersPayload(answers={"work": "完成"}, version=1)
    with pytest.raises(HTTPException) as exc:
        await projects_router._save_self_summary(1, payload, False, context(), db)
    assert exc.value.status_code == 409
    assert db.commits == 0
    target.settings["flow_settings"]["node_times"]["summary"]["start_at"] = "2026-09-16T00:00:00Z"
    result = await projects_router._save_self_summary(1, payload, False, context(), db)
    assert result["answers"]["work"] == "完成"
    assert result["editable"] and result["submit_allowed"]
    assert db.commits == 1
    assert task.available_at == Clock(2026, 9, 20, tzinfo=UTC)
    assert node.config["time"]["start_at"] == "2026-09-20T00:00:00Z"

@pytest.mark.asyncio
async def test_workbench_tasks_and_people_return_live_due_date(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject
    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    target = SimpleNamespace(id=1, settings={"flow_settings": {"node_times": {"manager-review": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-25T00:00:00Z"}}}})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="上级评估", config={"time": {"end_at": "2026-10-01T00:00:00Z"}})
    task = SimpleNamespace(id=20, project_id=1, target_employee_no="E001", status="pending", available_at=None, due_at=datetime(2026, 10, 1, tzinfo=UTC))
    member = SimpleNamespace(employee_no="E001", display_name="员工甲")

    class Db:
        async def execute(self, query):
            if "performance_project_members" in str(query):
                return SimpleNamespace(all=lambda: [(task, node, member)])
            return SimpleNamespace(all=lambda: [(node, task)])

        async def scalar(self, _query):
            return task

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

    db = Db()
    summary = await projects_router.workbench_tasks(1, 'pending', context('performance.cycles.manage'), db)
    people = await projects_router.workbench_task_people('manager-review', 1, 'pending', context(), db)
    assert summary[0]['available_at'] == datetime(2026, 9, 16, tzinfo=UTC)
    assert summary[0]['due_at'] == datetime(2026, 9, 25, tzinfo=UTC)
    assert people[0]['due_at'] == datetime(2026, 9, 25, tzinfo=UTC)
    assert task.due_at == datetime(2026, 10, 1, tzinfo=UTC)

@pytest.mark.asyncio
@pytest.mark.parametrize("admin_preview", [True, False])
async def test_task_people_preserves_project_node_and_target_scope(monkeypatch, admin_preview):
    from app.performance import projects_router

    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER-1")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    class Db:
        def __init__(self):
            self.queries = []

        async def scalar(self, query):
            self.queries.append(query)
            return None

        async def execute(self, query):
            self.queries.append(query)
            return SimpleNamespace(all=lambda: [])

        async def get(self, _model, _id):
            return None

    db = Db()
    account = context("performance.cycles.manage") if admin_preview else context()
    result = await projects_router.workbench_task_people("manager-review", 7, "pending", account, db, None)
    assert result == []
    for query in db.queries:
        sql = str(query.compile(compile_kwargs={"literal_binds": True}))
        where = sql.split("WHERE", 1)[1]
        assert "performance_node_tasks.project_id = 7" in where
        assert "performance_project_node_snapshots.project_id = 7" in where
        assert "performance_project_node_snapshots.node_id = 'manager-review'" in where
        assert "performance_node_tasks.status = 'pending'" in where
        assert ("performance_node_tasks.handler_ref = 'MANAGER-1'" in where) is not admin_preview
    member_sql = str(db.queries[0])
    assert "performance_project_members.snapshot_id = performance_node_tasks.member_snapshot_id" in member_sql
    assert "performance_project_members.employee_no = performance_node_tasks.target_employee_no" in member_sql


@pytest.mark.asyncio
async def test_workbench_projects_uses_employee_identity_and_member_visibility(monkeypatch):
    from app.performance import projects_router

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    rows = [(_pm_project(1, "项目一", 1), _pm_cycle(1, "周期一"))]

    class Db:
        statement = None

        async def scalar(self, statement):
            assert "performance_result_openings" in str(statement)
            return None

        async def execute(self, statement):
            self.statement = statement
            return SimpleNamespace(all=lambda: rows)

    db = Db()
    result = await projects_router.workbench_projects(None, 1, 20, context(), db)
    assert result[0]["project_id"] == 1
    sql = str(db.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "performance_projects.status = 'STARTED'" in sql
    assert "performance_node_tasks.handler_ref = 'E001'" in sql
    assert "performance_project_members.portal_user_id = 1" in sql
    assert "JOIN performance_node_tasks" not in sql


@pytest.mark.asyncio
async def test_workbench_pending_group_uses_current_handler_task(monkeypatch):
    from app.performance import projects_router

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    node = SimpleNamespace(id=10, project_id=1, node_id="summary", node_type="work_summary", node_order=1, name="工作总结", config={})
    task = SimpleNamespace(id=20, available_at=None, due_at=None)

    class Db:
        async def execute(self, query):
            assert "performance_node_tasks.handler_ref" in str(query)
            return SimpleNamespace(all=lambda: [(node, task)])

        async def get(self, _model, _id):
            return None

    result = await projects_router.workbench_tasks(1, 'pending', context(), Db())
    assert result[0]['task_id'] == 20


@pytest.mark.asyncio
async def test_workbench_pending_excludes_tasks_before_live_project_start(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 21, 6, tzinfo=tz)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "datetime", Clock)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    target = SimpleNamespace(id=1, settings={"flow_settings": {"node_times": {
        "open": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"},
        "future": {"start_at": "2026-09-22T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"},
    }}})
    open_node = SimpleNamespace(id=10, project_id=1, node_id="open", node_type="work_summary", node_order=1, name="已开始", config={})
    future_node = SimpleNamespace(id=11, project_id=1, node_id="future", node_type="evaluation", node_order=2, name="未开始", config={})
    open_task = SimpleNamespace(id=20, available_at=None, due_at=None)
    future_task = SimpleNamespace(id=21, available_at=None, due_at=None)

    class Db:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [(open_node, open_task), (future_node, future_task)])

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

    result = await projects_router.workbench_tasks(1, "pending", context(), Db())

    assert [item["node_id"] for item in result] == ["open"]
    assert result[0]["pending_count"] == 1


@pytest.mark.parametrize("start,end", [("not-a-date", "2026-09-30T00:00:00Z"), ("2026-09-20T00:00:00Z", "2026-09-16T00:00:00Z")])
def test_project_time_rejects_invalid_live_schedule(start, end):
    with pytest.raises(ProjectValidationError):
        PerformanceProjectService._validate_flow_settings({"node_settings": {}, "node_times": {"manager-review": {"start_at": start, "end_at": end}}})

@pytest.mark.asyncio
async def test_review_project_visibility_uses_semi_joins_for_admin_and_participant(monkeypatch):
    from app.performance import projects_router
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    class Db:
        statement = None

        async def execute(self, statement):
            self.statement = statement
            return SimpleNamespace(all=lambda: [])

    db = Db()
    await projects_router.review_overview(None, context("performance.cycles.manage"), db, None)
    admin_sql = str(db.statement)
    assert "EXISTS" in admin_sql
    assert "LEFT OUTER JOIN performance_node_tasks" not in admin_sql
    assert "DISTINCT" not in admin_sql
    assert "portal_user_id" not in admin_sql

    await projects_router.review_overview(None, context(), db, None)
    participant_sql = str(db.statement)
    assert "performance_project_members.portal_user_id" in participant_sql
    assert "performance_node_tasks.handler_ref" in participant_sql
    assert " OR " in participant_sql
    assert "LEFT OUTER JOIN performance_node_tasks" not in participant_sql


@pytest.mark.asyncio
async def test_project_matrix_uses_submitted_rating_from_final_result_node(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router

    project = SimpleNamespace(id=7, settings={"template_id": 11}, project_ref="project:matrix", cycle_ref="cycle:matrix")
    members = [
        SimpleNamespace(id=1, employee_no="E001", display_name="员工一", employment_status="在职", position_level="J6"),
        SimpleNamespace(id=2, employee_no="E002", display_name="员工二", employment_status="在职", position_level="J3"),
        SimpleNamespace(id=3, employee_no="E003", display_name="员工三", employment_status="离职", position_level=None),
    ]
    node = SimpleNamespace(
        id=31,
        node_id="manager-review",
        node_order=1,
        node_type="evaluation",
        config={"template": {
            "include_final_result": True,
            "content": [{
                "type": "rating",
                "name": "绩效评级",
                "items": [{"id": "rating-field", "label": "绩效评级"}],
                "options": [
                    {"id": "one", "label": "1星", "color": "#f54a45"},
                    {"id": "five", "label": "5星", "color": "#3370ff"},
                ],
            }],
        }},
    )
    submitted_rating = datetime(2026, 9, 20, tzinfo=UTC)
    tasks = [
        SimpleNamespace(node_snapshot_id=31, target_employee_no="E001", submitted_at=submitted_rating, id=101, answers={"rating-field": "five"}, status="completed"),
        SimpleNamespace(node_snapshot_id=31, target_employee_no="E002", submitted_at=submitted_rating, id=102, answers={}, status="completed"),
        SimpleNamespace(node_snapshot_id=31, target_employee_no="E003", submitted_at=None, id=103, answers={"rating-field": "one"}, status="completed"),
    ]

    class Result:
        def __init__(self, values):
            self.values = values

        def scalars(self):
            return SimpleNamespace(all=lambda: self.values)

    class Db:
        def __init__(self):
            self.calls = 0

        async def execute(self, _statement):
            self.calls += 1
            return Result([members, [node], tasks][self.calls - 1])

    async def value(result):
        return result

    monkeypatch.setattr(projects_router, "_get_project", lambda *_args: value(project))
    monkeypatch.setattr(projects_router, "_can_manage_project", lambda *_args: True)

    async def no_hrbp_visibility(*_args):
        return set()

    async def trusted_actor(*_args, **_kwargs):
        return SimpleNamespace(actor_ref="ADMIN")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", trusted_actor)
    monkeypatch.setattr(projects_router, "_person_hrbp_invisible_people", no_hrbp_visibility)
    result = await projects_router.project_matrix(7, context("performance.cycles.manage"), Db())

    assert (result.total, result.completed_count, result.pending_count) == (3, 1, 2)
    assert [rating.label for rating in result.ratings] == ["1星", "5星"]
    assert result.completed_rows[0].level == "J6"
    assert result.completed_rows[0].cells["five"].people[0].display_name == "员工一"
    assert [row.level for row in result.completed_rows] == ["J6", "J3", "--"]
    assert result.completed_rows[1].cells["five"].count == 0
    assert result.completed_rows[2].cells["five"].count == 0
    assert [row.level for row in result.pending_rows] == ["J3", "--"]
    assert result.pending_rows[1].cells["pending"].people[0].employment_status == "离职"


def _statistics_node(project_id=1, *, node_id=31, order=1, options=None, final=True):
    return SimpleNamespace(
        id=node_id, project_id=project_id, node_id=f"review-{node_id}", node_order=order,
        node_type="evaluation", config={"template": {
            "include_final_result": final,
            "content": [{
                "type": "rating", "name": "绩效评级",
                "items": [{"id": "rating-field", "label": "绩效评级"}],
                "options": options if options is not None else [
                    {"id": "one", "label": "1星", "color": "#f54a45"},
                    {"id": "five", "label": "5星", "color": "#3370ff"},
                ],
            }],
        }},
    )


def _statistics_member(employee_no, snapshot_id=21, *, position_level="J6", hire_date=None):
    return SimpleNamespace(
        employee_no=employee_no, snapshot_id=snapshot_id,
        display_name=f"员工{employee_no}", employment_status="在职",
        position_level=position_level, hire_date=hire_date,
    )


def _statistics_task(employee_no, value="five", *, task_id=101, node_id=31, snapshot_id=21, project_id=1, submitted=True):
    from datetime import UTC, datetime
    return SimpleNamespace(
        id=task_id, project_id=project_id, node_snapshot_id=node_id, member_snapshot_id=snapshot_id,
        target_employee_no=employee_no, answers={"rating-field": value}, status="completed",
        submitted_at=datetime(2026, 9, 20, tzinfo=UTC) if submitted else None,
    )


@pytest.fixture
def statistics_db(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceRole, PerformanceHrbpPermission

    monkeypatch.setattr(settings, "APP_ENV", "prod")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", False)

    class Db:
        def __init__(self):
            self.cycle = _pm_cycle(1)
            self.projects = [_pm_project(1, "项目一", 1, administrators=["管理员"])]
            self.snapshots = {1: 21}
            self.members = [_statistics_member("E001")]
            self.nodes = [_statistics_node()]
            self.tasks = [_statistics_task("E001")]
            self.queries = []
            self.roles = [SimpleNamespace(code=code, is_active=True, role_type="MANAGEMENT", function_permission_keys=["performance.frontend.progress", "performance.frontend.data-view"]) for code in ["performance.project_admin", "performance.hrbp"]]
            self.hrbp_permissions = []

        async def scalar(self, statement):
            self.queries.append(statement)
            params = statement.compile().params
            if "max(performance_project_member_snapshots.id)" in str(statement):
                return self.snapshots.get(params["project_id_1"])
            assert "performance_cycles.id" in str(statement)
            return self.cycle if self.cycle and self.cycle.id == params["id_1"] else None

        async def execute(self, statement):
            self.queries.append(statement)
            params = statement.compile().params
            model = statement.column_descriptions[0]["entity"]
            if model is PerformanceRole:
                rows = [item for item in self.roles if item.is_active and item.code in params["code_1"] and item.role_type == params["role_type_1"]]
            elif model is PerformanceHrbpPermission:
                rows = [item for item in self.hrbp_permissions if item.cycle_ref == params["cycle_ref_1"] and item.hrbp_employee_no == params["hrbp_employee_no_1"]]
            elif model is PerformanceProject:
                rows = [item for item in self.projects if item.cycle_ref == params["cycle_ref_1"] and item.status == params["status_1"]]
            elif model is PerformanceProjectMember:
                snapshot_id = params.get("snapshot_id_1", self.snapshots.get(params.get("project_id_1")))
                rows = [item for item in self.members if item.snapshot_id == snapshot_id]
            elif model is PerformanceProjectNodeSnapshot:
                rows = sorted([item for item in self.nodes if item.project_id == params["project_id_1"] and item.node_type == params["node_type_1"]], key=lambda item: item.node_order)
            elif model is PerformanceNodeTask:
                rows = [item for item in self.tasks if item.project_id == params.get("project_id_1") and item.node_snapshot_id in params.get("node_snapshot_id_1", [])]
                if "member_snapshot_id_1" in params:
                    rows = [item for item in rows if item.member_snapshot_id == params["member_snapshot_id_1"]]
                rows.sort(key=lambda item: item.id)
            else:
                raise AssertionError(str(statement))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

        async def get(self, model, identity):
            assert model is PerformanceProject
            return next((item for item in self.projects if item.id == identity), None)

    db = Db()

    async def actor(_db, _context, **kwargs):
        return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="MANAGER")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    return db


@pytest.mark.asyncio
async def test_level_statistics_uses_real_final_answers_and_flat_zero_rows(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.members += [
        _statistics_member("E002", position_level="J3"),
        _statistics_member("E003", position_level="   "),
        _statistics_member("E004", position_level="专家"),
        _statistics_member("E005", position_level=None),
    ]
    db.tasks += [
        _statistics_task("E002", None, task_id=102),
        _statistics_task("E003", "one", task_id=103, submitted=False),
        _statistics_task("E004", "invalid", task_id=104),
        _statistics_task("E005", "one", task_id=105),
    ]
    result = await project_management_statistics(1, "level", context("performance.projects.manage", refs=("project:x:1",)), db)
    assert result.model_dump() == {
        "source": "api", "dimension": "level", "rowLabel": "岗位职级", "showSummary": True,
        "totalParticipants": 5,
        "ratings": [{"key": "one", "label": "1星", "color": "#f54a45"}, {"key": "five", "label": "5星", "color": "#3370ff"}],
        "distribution": {"one": 1, "five": 1},
        "departments": [
            {"id": "level:J6", "name": "J6", "counts": {"one": 0, "five": 1}},
            {"id": "level:J3", "name": "J3", "counts": {"one": 0, "five": 0}},
            {"id": "level:专家", "name": "专家", "counts": {"one": 0, "five": 0}},
            {"id": "level:--", "name": "--", "counts": {"one": 1, "five": 0}},
        ],
    }
    assert sum(result.distribution.values()) == 2 < result.totalParticipants


@pytest.mark.asyncio
@pytest.mark.parametrize("account", [context(), context("performance.projects.manage"), context("performance.projects.manage", refs=("project:other",))])
async def test_level_statistics_unselected_project_admin_is_not_visible(statistics_db, account):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    statistics_db.projects[0].settings["data_managers"] = ["HRBP"]
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", account, statistics_db)
    assert error.value.status_code == 404
    assert not any("performance_project_members" in str(query) for query in statistics_db.queries)


@pytest.mark.asyncio
@pytest.mark.parametrize("preview", [False, True])
async def test_level_statistics_cycle_manager_keeps_overview_visibility(statistics_db, monkeypatch, preview):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    statistics_db.projects[0].administrators = ["其他人"]
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", preview)
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), statistics_db)
    assert result.totalParticipants == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle_id,visible", [(99, True), (1, False)])
async def test_level_statistics_missing_or_invisible_cycle_is_not_found(statistics_db, cycle_id, visible):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    if not visible:
        statistics_db.projects[0].administrators = ["其他人"]
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(cycle_id, "level", context("performance.projects.manage", refs=("project:x:1",)), statistics_db)
    assert (error.value.status_code, error.value.detail) == (404, "CYCLE_NOT_FOUND")


@pytest.mark.asyncio
async def test_level_statistics_only_reads_selected_source_started_projects(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.projects += [
        _pm_project(2, "可见但未授权", 1, administrators=["管理员"]),
        _pm_project(3, "授权但不可见", 1, administrators=["其他人"]),
        _pm_project(4, "草稿", 1, administrators=["管理员"], status="DRAFT"),
        _pm_project(5, "其他周期", 2, administrators=["管理员"]),
    ]
    db.projects[1].settings["data_managers"] = ["HRBP"]
    for project_id in [2, 3, 4, 5]:
        db.snapshots[project_id] = 20 + project_id
        db.members.append(_statistics_member("E001", 20 + project_id))
        db.nodes.append(_statistics_node(project_id, node_id=30 + project_id, options=[{"id": "conflict", "label": "冲突"}]))
    account = context("performance.projects.manage", refs=("project:x:1", "project:x:3", "project:x:4", "project:x:5"))
    result = await project_management_statistics(1, "level", account, db)
    assert result.totalParticipants == 1
    assert result.distribution == {"one": 0, "five": 1}
    snapshot_queries = [query for query in db.queries if "max(performance_project_member_snapshots.id)" in str(query)]
    assert [query.compile().params["project_id_1"] for query in snapshot_queries] == [1]


@pytest.mark.asyncio
async def test_level_statistics_empty_cycle_requires_cycle_management(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    statistics_db.projects = []
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), statistics_db)
    assert result.model_dump() == {
        "source": "api", "dimension": "level", "rowLabel": "岗位职级", "showSummary": True,
        "totalParticipants": 0, "ratings": [], "distribution": {}, "departments": [],
    }
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", context(), statistics_db)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_level_statistics_rejects_cross_project_employee_overlap(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.projects.append(_pm_project(2, "项目二", 1, administrators=["管理员"]))
    db.snapshots[2] = 22
    db.members.append(_statistics_member("E001", 22))
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert (error.value.status_code, error.value.detail) == (409, "CYCLE_MEMBER_OVERLAP_UNRESOLVED")


@pytest.mark.asyncio
@pytest.mark.parametrize("conflict", ["id", "label", "color", "code", "order", "empty_label"])
@pytest.mark.parametrize("same_project", [False, True])
async def test_level_statistics_compares_ordered_unmerged_rating_scales(statistics_db, conflict, same_project):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    options = [dict(item) for item in db.nodes[0].config["template"]["content"][0]["options"]]
    if conflict == "order":
        options.reverse()
    elif conflict == "empty_label":
        db.nodes[0].config["template"]["content"][0]["options"][0]["label"] = ""
        options[0]["label"] = options[0]["id"]
    else:
        options[0][conflict] = "different"
    if same_project:
        db.nodes.append(_statistics_node(node_id=32, order=2, options=options))
    else:
        db.projects.append(_pm_project(2, "项目二", 1, administrators=["管理员"]))
        db.snapshots[2] = 22
        db.members.append(_statistics_member("E002", 22))
        db.nodes.append(_statistics_node(2, node_id=32, options=options))
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert (error.value.status_code, error.value.detail) == (409, "RATING_SCALE_CONFLICT")


@pytest.mark.asyncio
async def test_rating_code_survives_hydration_and_schema_without_changing_form_label():
    from app.performance.self_summary_service import hydrate_self_summary_template, build_self_summary_schema

    levels = [{"id": "one", "code": "1星", "name": "不合格", "color": "rgb(251, 191, 188)"}]

    class Db:
        async def execute(self, _statement):
            return SimpleNamespace(all=lambda: [(SimpleNamespace(id=101, description="", display_mode="标签样式"), SimpleNamespace(config={"levels": levels}))])

    template = {"content": [{"type": "rating", "items": [{"id": "101", "label": "绩效评级"}]}]}
    hydrated = await hydrate_self_summary_template(template, Db())
    option = build_self_summary_schema(hydrated)[0]["fields"][0]["options"][0]
    assert option == {"id": "one", "code": "1星", "name": "不合格", "label": "不合格", "color": "rgb(251, 191, 188)", "placeholder": "", "required": False}
    assert "options" not in template["content"][0]
    assert levels[0]["name"] == "不合格"


@pytest.mark.asyncio
@pytest.mark.parametrize("answer", ["one", "不合格", {"label": "不合格"}, {"id": "one"}])
async def test_rating_headers_use_rule_code_color_without_changing_answer_counts(statistics_db, answer):
    from app.performance.projects_router import project_management_statistics, project_matrix

    options = [
        {"id": "one", "code": "1星", "name": "不合格", "color": "rgb(251, 191, 188)"},
        {"id": "five", "code": "5星", "name": "卓越", "color": "rgb(186, 206, 253)"},
    ]
    statistics_db.nodes[0] = _statistics_node(options=options)
    statistics_db.tasks[0].answers = {"rating-field": answer}
    account = context("performance.cycles.manage")
    report = await project_management_statistics(1, "level", account, statistics_db)
    matrix = await project_matrix(1, account, statistics_db)
    expected = [{"key": item["id"], "label": item["code"], "color": item["color"]} for item in options]
    assert [item.model_dump() for item in report.ratings] == expected
    assert [item.model_dump() for item in matrix.ratings] == expected
    assert report.distribution == {"one": 1, "five": 0}
    assert matrix.completed_rows[0].cells["one"].count == 1


@pytest.mark.asyncio
async def test_level_statistics_merges_equal_scales_and_ignores_empty_options(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.projects += [_pm_project(i, f"项目{i}", 1, administrators=["管理员"]) for i in [2, 3]]
    db.snapshots.update({2: 22, 3: 23})
    db.members += [_statistics_member("E002", 22), _statistics_member("E003", 23, position_level="P2")]
    db.nodes += [_statistics_node(2, node_id=32), _statistics_node(3, node_id=33, options=[])]
    db.tasks += [_statistics_task("E002", "one", project_id=2, node_id=32, snapshot_id=22)]
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert result.totalParticipants == 3
    assert result.distribution == {"one": 1, "five": 1}
    assert [row.counts for row in result.departments] == [{"one": 1, "five": 1}, {"one": 0, "five": 0}]


@pytest.mark.asyncio
async def test_level_statistics_pins_members_and_tasks_to_selected_latest_snapshot(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.members.append(_statistics_member("OLD_ONLY", 20))
    db.tasks.append(_statistics_task("E001", "one", task_id=999, snapshot_id=20))
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert result.totalParticipants == 1
    assert result.distribution == {"one": 0, "five": 1}
    sql = [str(query.compile(compile_kwargs={"literal_binds": True})) for query in db.queries]
    assert any("max(performance_project_member_snapshots.id)" in query and "performance_project_member_snapshots.project_id = 1" in query for query in sql)
    assert any("performance_project_members.snapshot_id = 21" in query for query in sql)
    task_sql = next(query for query in sql if "FROM performance_node_tasks" in query)
    assert "performance_node_tasks.project_id = 1" in task_sql
    assert "performance_node_tasks.member_snapshot_id = 21" in task_sql
    assert "performance_node_tasks.node_snapshot_id IN (31)" in task_sql


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["snapshot", "members", "nodes", "options"])
async def test_level_statistics_empty_data_keeps_zero_values(statistics_db, missing):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    if missing == "snapshot":
        db.snapshots = {}
    elif missing == "members":
        db.members = []
    elif missing == "nodes":
        db.nodes = []
    else:
        db.nodes[0].config["template"]["content"][0]["options"] = []
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert sum(result.distribution.values()) == 0
    assert result.totalParticipants == (0 if missing in {"snapshot", "members"} else 1)
    if missing in {"nodes", "options"}:
        assert result.ratings == []
        assert result.departments[0].counts == {}


@pytest.mark.asyncio
async def test_matrix_and_statistics_share_final_node_and_task_priority(statistics_db):
    from app.performance.projects_router import project_management_statistics, project_matrix

    db = statistics_db
    db.nodes += [_statistics_node(node_id=32, order=2), _statistics_node(node_id=33, order=3, final=False)]
    db.tasks += [
        _statistics_task("E001", "one", node_id=32, task_id=10),
        _statistics_task("E001", {"option_id": "five"}, node_id=32, task_id=11),
        _statistics_task("E001", "one", node_id=33, task_id=999),
        _statistics_task("NOT_A_MEMBER", "one", task_id=1000),
    ]
    account = context("performance.cycles.manage")
    report = await project_management_statistics(1, "level", account, db)
    matrix = await project_matrix(1, account, db)
    assert report.distribution == {"one": 0, "five": 1}
    assert (matrix.total, matrix.completed_count, matrix.pending_count) == (1, 1, 0)
    assert matrix.completed_rows[0].cells["five"].count == 1
    assert matrix.source == "template_final_result"
    assert matrix.display_modes == ["name", "count"]
    db.tasks = [task for task in db.tasks if task.id != 11]
    report = await project_management_statistics(1, "level", account, db)
    matrix = await project_matrix(1, account, db)
    assert report.distribution == {"one": 1, "five": 0}
    assert matrix.completed_rows[0].cells["one"].count == 1


@pytest.mark.asyncio
async def test_matrix_preserves_legacy_snapshot_and_scale_behavior(statistics_db):
    from app.performance.projects_router import project_matrix

    db = statistics_db
    db.nodes.append(_statistics_node(node_id=32, order=2, options=[{"id": "one", "label": "其他标签", "color": "#000000"}]))
    db.tasks.append(_statistics_task("E001", "one", task_id=999, node_id=32, snapshot_id=20))
    result = await project_matrix(1, context("performance.cycles.manage"), db)
    assert result.ratings[0].label == "1星"
    assert result.completed_rows[0].cells["one"].count == 1
    task_query = next(query for query in db.queries if "FROM performance_node_tasks" in str(query))
    assert "member_snapshot_id_1" not in task_query.compile().params


@pytest.mark.asyncio
async def test_matrix_refuses_unscoped_access(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import project_matrix

    statistics_db.projects[0].administrators = ["其他人"]
    with pytest.raises(HTTPException) as error:
        await project_matrix(1, context(), statistics_db)
    assert error.value.status_code == 403
    assert not any("FROM performance_project_members" in str(query) for query in statistics_db.queries)


def test_tenure_bucket_uses_completed_calendar_month_boundaries():
    from datetime import date
    from app.performance.projects_router import _tenure_bucket, _tenure_sort_key

    today = date(2026, 9, 21)
    assert _tenure_bucket(date(2026, 6, 21), today) == "3-6个月（不含6个月）"
    assert _tenure_bucket(date(2026, 3, 21), today) == "6个月-1年（不含1年）"
    assert _tenure_bucket(date(2025, 9, 21), today) == "1-3年内（不含3年）"
    assert _tenure_bucket(date(2023, 9, 20), today) == "3年以上"
    assert _tenure_bucket(date(2026, 8, 1), today) == "入职未满3个月"
    assert _tenure_bucket(None, today) == "入职日期缺失"
    assert sorted(["入职日期缺失", "3年以上", "入职未满3个月"], key=_tenure_sort_key) == ["入职未满3个月", "3年以上", "入职日期缺失"]


@pytest.mark.asyncio
async def test_tenure_statistics_returns_six_flat_rows_and_shared_rating_headers(statistics_db):
    from datetime import date
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.members[0].hire_date = date(2026, 6, 21)
    result = await project_management_statistics(1, "tenure", context("performance.cycles.manage"), db)
    assert result.source == "api"
    assert result.dimension == "tenure"
    assert result.rowLabel == "司龄"
    assert result.showSummary is True
    assert [row.name for row in result.departments] == [
        "入职未满3个月", "3-6个月（不含6个月）", "6个月-1年（不含1年）", "1-3年内（不含3年）", "3年以上", "入职日期缺失",
    ]
    assert all(not hasattr(row, "children") for row in result.departments)
    assert result.departments[1].counts["five"] == 1


    from app.performance.projects_router import _matrix_level_sort_key

    assert sorted(["--", "专家", "J3", "M10", "A", "P3", "J12"], key=_matrix_level_sort_key) == ["J12", "M10", "J3", "P3", "A", "专家", "--"]


@pytest.mark.asyncio
async def test_level_statistics_http_contract_and_dimension_validation(statistics_db):
    import httpx
    from fastapi import FastAPI
    from app.performance import projects_router

    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[projects_router.get_session] = lambda: statistics_db
    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        url = "/api/v1/performance/project-management/statistics"
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 200
        payload = response.json()
        assert payload["source"] == "api"
        assert payload["dimension"] == "level"
        assert payload["distribution"] == {"one": 0, "five": 1}
        assert "heatLevels" not in payload
        assert set(payload["departments"][0]) == {"id", "name", "counts"}
        for params in [{}, {"cycle_id": 0}, {"cycle_id": 1, "dimension": "department"}]:
            response = await client.get(url, params=params)
            assert response.status_code == 422
        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 200
        statistics_db.projects[0].settings["data_managers"] = []
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 404
        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
        statistics_db.projects.append(_pm_project(2, "项目二", 1, administrators=["管理员"]))
        statistics_db.snapshots[2] = 22
        statistics_db.members.append(_statistics_member("E001", 22))
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 409
        assert response.json()["detail"] == "CYCLE_MEMBER_OVERLAP_UNRESOLVED"


def test_review_evaluation_status_waits_for_every_direct_report():
    from datetime import UTC, datetime
    from app.performance.projects_router import _review_tasks_status

    now = datetime(2026, 9, 20, tzinfo=UTC)
    completed = SimpleNamespace(status="completed", submitted_at=now)
    pending = SimpleNamespace(status="pending", submitted_at=None)

    assert _review_tasks_status([completed, pending], "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z", now) == "pending"
    assert _review_tasks_status([completed, completed], "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z", now) == "completed"


@pytest.mark.asyncio
async def test_workbench_groups_mixed_direct_report_tasks_until_all_complete(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER-1")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    project = SimpleNamespace(id=1, status="STARTED", settings={})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="直接上级评估", config={})
    completed = SimpleNamespace(id=20, project_id=1, status="completed", submitted_at=datetime(2026, 9, 20, tzinfo=UTC), available_at=None, due_at=None)
    pending = SimpleNamespace(id=21, project_id=1, status="pending", submitted_at=None, available_at=None, due_at=None)

    class Db:
        def __init__(self):
            self.tasks = [completed, pending]

        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [(node, task) for task in self.tasks])

        async def get(self, model, identity):
            return project if model is PerformanceProject and identity == 1 else None

    db = Db()
    pending_groups = await projects_router.workbench_tasks(1, "pending", context(), db)
    completed_groups = await projects_router.workbench_tasks(1, "completed", context(), db)

    assert [(item["node_id"], item["pending_count"], item["completed_count"]) for item in pending_groups] == [("manager-review", 1, 1)]
    assert completed_groups == []

    pending.status = "completed"
    pending.submitted_at = datetime(2026, 9, 21, tzinfo=UTC)
    completed_groups = await projects_router.workbench_tasks(1, "completed", context(), db)
    assert [(item["node_id"], item["pending_count"], item["completed_count"]) for item in completed_groups] == [("manager-review", 0, 2)]


@pytest.mark.asyncio
async def test_evaluation_member_list_can_return_completed_and_pending_tasks(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER-1")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    project = SimpleNamespace(id=1, settings={})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", config={})
    completed = SimpleNamespace(id=20, project_id=1, status="completed", submitted_at=datetime(2026, 9, 20, tzinfo=UTC), available_at=None, due_at=None, target_employee_no="E001", member_snapshot_id=7)
    pending = SimpleNamespace(id=21, project_id=1, status="pending", submitted_at=None, available_at=None, due_at=None, target_employee_no="E002", member_snapshot_id=7)
    member_a = SimpleNamespace(employee_no="E001", display_name="员工一", job_family="技术", job_category="研发", position_level="P6", hire_date=datetime(2020, 1, 2).date(), company_org="研发中心", organization_ref="研发中心", employee_type="正式员工", employment_status="在职")
    member_b = SimpleNamespace(employee_no="E002", display_name="员工二", job_family="技术", job_category="研发", position_level="P6", hire_date=datetime(2020, 1, 2).date(), company_org="研发中心", organization_ref="研发中心", employee_type="正式员工", employment_status="在职")

    class Db:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [(completed, node, member_a), (pending, node, member_b)])

        async def get(self, model, identity):
            return project if model is PerformanceProject and identity == 1 else None

    result = await projects_router.workbench_task_people("manager-review", 1, "all", context(), Db())

    assert [(item["employee_no"], item["status"]) for item in result] == [("E001", "completed"), ("E002", "pending")]
    assert [(item["visibility_role"], item["visible_profile_fields"]) for item in result] == [
        ("metric_reviewer", ["department"]),
        ("metric_reviewer", ["department"]),
    ]
    assert [(item["job_sequence"], item["position_level"], item["hire_date"], item["department"]) for item in result] == [
        (None, None, None, "研发中心"),
        (None, None, None, "研发中心"),
    ]

def test_hrbp_scope_matches_snapshot_organization_and_nested_configured_scope():
    from app.performance.projects_router import _organization_in_scope

    assert not _organization_in_scope("集团", ["集团/研发中心"])
    assert _organization_in_scope("集团/研发中心/平台部", ["集团/研发中心"])
    assert not _organization_in_scope("集团/运营中心", ["集团/研发中心"])


@pytest.mark.asyncio
async def test_hrbp_invisible_people_are_loaded_from_cycle_permission():
    from app.performance import projects_router

    class Result:
        def scalars(self):
            return self

        def all(self):
            return [SimpleNamespace(invisible_people=["E002", "E003"])]

    class Db:
        async def execute(self, _statement):
            return Result()

    assert await projects_router._person_hrbp_invisible_people(Db(), "E001", "cycle:1") == {"E002", "E003"}


@pytest.mark.asyncio
async def test_remind_project_tasks_records_only_available_pending_tasks(monkeypatch):
    from app.performance import projects_router

    project = SimpleNamespace(id=3, status="STARTED", cycle_ref="cycle:1", settings={})
    pending = SimpleNamespace(id=11, project_id=3, status="pending", available_at=None, due_at=None, target_employee_no="E001")
    completed = SimpleNamespace(id=12, project_id=3, status="completed", available_at=None, due_at=None, target_employee_no="E002")
    node = SimpleNamespace(node_id="evaluation-1", config={})

    class Result:
        def all(self):
            return [(pending, node), (completed, node)]

    class Db:
        def __init__(self):
            self.events = []
            self.committed = False

        async def get(self, model, _value):
            return project

        async def execute(self, _statement):
            return Result()

        def add(self, value):
            self.events.append(value)

        async def commit(self):
            self.committed = True

    monkeypatch.setattr(projects_router, "_is_admin_preview", lambda _context: True)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", lambda *_args, **_kwargs: _actor())

    async def run_actor():
        return SimpleNamespace(actor_type="PORTAL_USER", actor_ref="E001")

    def _actor():
        return run_actor()

    db = Db()
    result = await projects_router.remind_project_tasks(
        3,
        projects_router.ReminderTasksPayload(node_id="evaluation-1", task_ids=[11, 11, 12, 99]),
        context(),
        db,
    )

    assert result == {"accepted_task_ids": [11], "skipped_task_ids": [12, 99], "delivery_status": "recorded"}
    assert db.committed
    assert len(db.events) == 1
    assert db.events[0].event_type == "PERFORMANCE_TASK_REMINDER_REQUESTED"


def test_hrbp_scope_only_includes_selected_path_and_descendants():
    from app.performance.projects_router import _organization_in_scope

    assert _organization_in_scope("集团/研发/平台", ["集团/研发"])
    assert _organization_in_scope("集团/研发", ["集团/研发"])
    assert not _organization_in_scope("集团", ["集团/研发"])
    assert not _organization_in_scope("集团/运营/平台", ["集团/研发/平台"])
    assert not _organization_in_scope("平台", ["集团/研发/平台"])


@pytest.mark.asyncio
@pytest.mark.parametrize("locked", [False, True])
async def test_evaluator_options_and_counts_use_existing_draft_or_locked_snapshot(monkeypatch, locked):
    from datetime import date
    from app.performance import project_service
    from app.performance.models import PerformanceAuthorizationSnapshotPerson

    rows = [dict(employee_no=f"E{i}", display_name=f"员工{i}", company_org="总部", department="研发",
                 department_2=None, department_3=None, department_4=None, department_5=None,
                 employee_type=kind, hire_date=hire, employment_status="在职", departure_date=None)
            for i, (kind, hire) in enumerate([
                ("正式员工", date(2026, 1, 1)), ("实习生", date(2026, 1, 31)),
                ("正式员工", date(2026, 2, 1)), (None, None),
            ])]
    live_calls = []

    async def roster(_db):
        raise AssertionError("所有周期筛选不得读取实时花名册")

    monkeypatch.setattr(project_service, "_canonical_roster_rows", roster)

    class Db:
        async def scalar(self, _statement):
            return SimpleNamespace(id=7, status="LOCKED" if locked else "DRAFT")

        async def execute(self, statement):
            assert statement.column_descriptions[0]["entity"] is PerformanceAuthorizationSnapshotPerson
            assert statement.compile().params["snapshot_id_1"] == 7
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [SimpleNamespace(**row) for row in rows]))

    service = PerformanceProjectService(Db())
    cycle = SimpleNamespace(cycle_ref="cycle:one", leaver_enabled=False)
    options = await service.evaluator_options(cycle)
    assert {item["value"] for item in options["employee_types"]} == {"正式员工", "实习生"}
    assert options["hire_date_range"] == {"min": "2026-01-01", "max": "2026-02-01"}
    condition = {"field": "hire_date", "operator": "include", "values": ["2026-01-01", "2026-01-31"]}
    assert await service.evaluator_count(cycle, {"groups": [{"conditions": [condition]}]}) == 2
    assert await service.evaluator_count(cycle, {"groups": [{"conditions": [{**condition, "operator": "exclude"}]}]}) == 1
    for operator, expected in [("before", 1), ("not_before", 2), ("after", 1), ("not_after", 2)]:
        single = {"field": "hire_date", "operator": operator, "values": ["2026-01-31"]}
        assert await service.evaluator_count(cycle, {"groups": [{"conditions": [single]}]}) == expected
    for row in rows:
        row["hire_date"] = None
    assert (await service.evaluator_options(cycle))["hire_date_range"] == {"min": None, "max": None}
    assert live_calls == []




@pytest.mark.asyncio
async def test_evaluator_preview_separates_tasks_report_only_people_and_group_counts(monkeypatch):
    from datetime import date
    from app.performance import projects_router, project_service

    people = [
        SimpleNamespace(employee_no="E1", display_name="员工一", company_org="集团", department="研发", department_2="平台", department_3="后端", department_4=None, department_5=None, direct_supervisor_employee_no="M1", direct_supervisor_source_value="经理", direct_supervisor="经理", hrbp_employee_no=None, employee_type="正式员工", employment_status="在职", job_family="技术", job_category="研发", standard_position="软件工程师", position_level="P6", hire_date=date(2020, 1, 1), departure_date=None),
        SimpleNamespace(employee_no="E2", display_name="员工二", company_org="集团", department="研发", department_2="平台", department_3="前端", department_4=None, department_5=None, direct_supervisor_employee_no="M1", direct_supervisor_source_value="经理", direct_supervisor="经理", hrbp_employee_no=None, employee_type="正式员工", employment_status="离职", job_family="技术", job_category="研发", standard_position="前端工程师", position_level="P5", hire_date=date(2021, 1, 1), departure_date=date(2026, 10, 1)),
        SimpleNamespace(employee_no="E3", display_name="员工三", company_org="集团", department="销售", department_2=None, department_3=None, department_4=None, department_5=None, direct_supervisor_employee_no=None, direct_supervisor_source_value=None, hrbp_employee_no=None, employee_type="正式员工", employment_status="在职", job_family="营销", job_category="销售", standard_position="销售经理", position_level="M3", hire_date=date(2022, 1, 1), departure_date=None),
    ]
    cycle = SimpleNamespace(cycle_ref="cycle:one", leaver_enabled=True, leaver_start_date=date(2026, 9, 1), leaver_end_date=date(2026, 10, 31), leaver_participation_mode="REPORT_ONLY")

    async def get_cycle(*_args):
        return cycle

    async def roster(_db):
        return [vars(person) for person in people]

    monkeypatch.setattr(projects_router, "_get_cycle", get_cycle)
    monkeypatch.setattr(projects_router, "_assert_cycle_project_view", lambda *_args: _resolved(None))
    monkeypatch.setattr(project_service, "_canonical_roster_rows", roster)

    class Db:
        async def scalar(self, _statement):
            return SimpleNamespace(id=7, status="DRAFT")

        async def execute(self, statement):
            from app.performance.models import PerformanceAuthorizationSnapshotPerson
            result = people if statement.column_descriptions[0]["entity"] is PerformanceAuthorizationSnapshotPerson else []
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: result))

    rules = {"groups": [
        {"conditions": [{"field": "department", "operator": "include", "values": ["集团/研发"]}, {"field": "employee_type", "operator": "include", "values": ["正式员工"]}]},
        {"conditions": [{"field": "employee", "operator": "include", "values": ["E3"]}]},
    ]}
    payload = projects_router.EvaluatorPreviewPayload(evaluator_rules=rules)
    summary = await projects_router.evaluator_preview(1, payload, context("performance.cycles.manage"), Db())
    assert summary.model_dump() == {"matched_count": 3, "task_generation_count": 2, "report_count": 3, "report_only_count": 1, "group_counts": [2, 1]}

    page = await projects_router.evaluator_preview_people(1, projects_router.EvaluatorPreviewPayload(evaluator_rules=rules, list_kind="report_only"), 1, 50, None, context("performance.cycles.manage"), Db())
    assert page.total == 1
    assert page.items[0].model_dump() == {
        "employee_no": "E2", "display_name": "员工二", "direct_supervisor": "经理",
        "company_org": "集团", "department": "研发", "department_2": "平台", "department_3": "前端",
        "job_family": "技术", "job_category": "研发", "standard_position": "前端工程师",
        "employment_status": "离职", "live_employment_status": "离职",
        "status": "report_only", "report_only": True,
    }


def test_report_only_leaver_does_not_create_tasks_but_stays_in_member_snapshot():
    from datetime import date
    cycle = SimpleNamespace(leaver_enabled=True, leaver_start_date=date(2026, 10, 1), leaver_end_date=date(2026, 10, 31), leaver_participation_mode="REPORT_ONLY")
    active = SimpleNamespace(employee_no="E1", display_name="员工一", employment_status="在职", departure_date=None, company_org="集团", department="研发", department_2=None, department_3=None, department_4=None, department_5=None, employee_type="正式员工", hire_date=date(2020, 1, 1))
    leaver = SimpleNamespace(employee_no="E2", display_name="员工二", employment_status="离职", departure_date=date(2026, 10, 1), company_org="集团", department="研发", department_2=None, department_3=None, department_4=None, department_5=None, employee_type="正式员工", hire_date=date(2020, 1, 1))
    settings = {"evaluator_rules": {"groups": [{"conditions": [{"field": "department", "operator": "include", "values": ["集团/研发"]}]}]}, "scope_rules": {"groups": []}}
    task_people, report_only = PerformanceProjectService._classify_people([active, leaver], settings, cycle)
    assert [person.employee_no for person in task_people] == ["E1"]
    assert [person.employee_no for person in report_only] == ["E2"]


@pytest.mark.asyncio
async def test_project_hire_date_http_validation_precedes_count_and_denies_permissions(monkeypatch):
    import httpx
    from fastapi import FastAPI
    from app.performance import projects_router

    target = project()
    cycle = SimpleNamespace(cycle_ref="cycle:one")

    async def get_cycle(*_args):
        return cycle

    async def get_project(*_args):
        return target

    async def must_not_count(*_args):
        raise AssertionError("非法日期必须在计数之前返回 422")

    monkeypatch.setattr(projects_router, "_get_cycle", get_cycle)
    monkeypatch.setattr(projects_router, "_get_project", get_project)
    monkeypatch.setattr(PerformanceProjectService, "evaluator_count", must_not_count)
    db = SimpleNamespace(scalar=get_cycle)
    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[projects_router.get_session] = lambda: db
    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for values in [[], [""], ["2026-02-30"], ["2026-1-01"], ["2026-01-01T00:00:00"], ["2026-01-01", "2026-02-01"]]:
            payload = {"name": "日期筛选", "evaluator_rules": {"groups": [{"conditions": [{"field": "hire_date", "operator": "not_before", "values": values}]}]}}
            for method, url in [(client.post, "/api/v1/performance/cycles/1/projects"), (client.patch, "/api/v1/performance/projects/1")]:
                response = await method(url, json=payload)
                assert response.status_code == 422
                assert response.json()["detail"] == "入职日期条件不合法"
        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
        assert (await client.get("/api/v1/performance/cycles/1/evaluator-options")).status_code == 403
        assert (await client.post("/api/v1/performance/cycles/1/projects", json=payload)).status_code == 403
        assert (await client.patch("/api/v1/performance/projects/1", json=payload)).status_code == 403


@pytest.mark.parametrize("operator,expected", [
    ("before", [True, False, False]), ("not_before", [False, True, True]),
    ("after", [False, False, True]), ("not_after", [True, True, False]),
])
def test_hire_date_comparisons_share_boundaries_and_round_trip(operator, expected):
    from datetime import date
    from app.performance.project_service import _matches_scope_condition, _matches_start_project_condition

    condition = {"field": "hire_date", "operator": operator, "values": ["2026-01-15"]}
    rules = {"groups": [{"conditions": [condition]}]}
    assert PerformanceProjectService._validate_rules(rules) == rules
    _, _, _, saved = PerformanceProjectService._validate_payload({"name": "日期比较", "evaluator_rules": rules})
    target = project()
    target.settings = saved
    assert PerformanceProjectService.serialize(target)["evaluator_rules"] == rules
    for matcher in [_matches_scope_condition, _matches_start_project_condition]:
        assert [matcher({"hire_date": date(2026, 1, day)}, condition) for day in [14, 15, 16]] == expected
        assert matcher({"hire_date": "2026-01-15T00:00:00"}, condition) is expected[1]
        assert not matcher({"hire_date": None}, condition)
        assert not matcher({"hire_date": "invalid"}, condition)
    for values in [[], [""], ["2026-02-30"], ["2026-1-15"], ["2026-01-15T00:00:00"], ["2026-01-01", "2026-02-01"]]:
        with pytest.raises(ProjectValidationError):
            PerformanceProjectService._validate_rules({"groups": [{"conditions": [{**condition, "values": values}]}]})
    with pytest.raises(ProjectValidationError):
        PerformanceProjectService._validate_rules({"groups": [{"conditions": [{**condition, "field": "employee_type"}]}]})


def test_start_project_evaluator_hire_date_condition_uses_inclusive_snapshot_date():
    from datetime import date
    from app.performance.project_service import _matches_start_project_condition

    condition = {"field": "hire_date", "operator": "include", "values": ["2026-01-01", "2026-01-31"]}
    assert _matches_start_project_condition({"hire_date": date(2026, 1, 1)}, condition)
    assert _matches_start_project_condition({"hire_date": date(2026, 1, 31)}, condition)
    assert not _matches_start_project_condition({"hire_date": None}, condition)
    assert not _matches_start_project_condition({"hire_date": date(2026, 2, 1)}, condition)


def test_evaluator_rules_validate_hire_date_ranges_and_match_boundaries():
    from datetime import date
    from app.performance.project_service import _matches_scope_condition

    condition = {"field": "hire_date", "operator": "include", "values": ["2026-01-01", "2026-01-31"]}
    assert _matches_scope_condition({"hire_date": date(2026, 1, 1)}, condition)
    assert _matches_scope_condition({"hire_date": date(2026, 1, 31)}, condition)
    assert not _matches_scope_condition({"hire_date": None}, condition)
    assert not _matches_scope_condition({"hire_date": date(2026, 2, 1)}, condition)
    exclude = {**condition, "operator": "exclude"}
    assert not _matches_scope_condition({"hire_date": date(2026, 1, 15)}, exclude)
    assert _matches_scope_condition({"hire_date": date(2026, 2, 1)}, exclude)


def test_evaluator_rules_reject_invalid_hire_date_values():
    invalid = [
        ["2026-01-01"],
        ["2026-02-01", "2026-01-01"],
        ["2026/01/01", "2026-01-31"],
        ["2026-01-01T00:00:00", "2026-01-31"],
    ]
    for values in invalid:
        with pytest.raises(ProjectValidationError, match="入职日期条件不合法"):
            PerformanceProjectService._validate_rules({"groups": [{"conditions": [{"field": "hire_date", "operator": "include", "values": values}]}]})




@pytest.mark.asyncio
async def test_start_project_filters_locked_snapshot_by_hire_date_before_workflow_validation():
    from datetime import date
    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceCycleProjectManager
    from app.performance.project_service import PerformanceProjectService

    person = SimpleNamespace(
        employee_no="E001", employee_type="正式员工", hire_date=date(2026, 1, 15),
        employment_status="在职", departure_date=None, company_org="总部", department="研发",
        department_2=None, department_3=None, department_4=None, department_5=None,
    )
    cycle = SimpleNamespace(cycle_ref="cycle:one", leaver_enabled=False)
    snapshot = SimpleNamespace(id=7, status="LOCKED")
    project = SimpleNamespace(
        id=1, project_ref="project:one", cycle_ref="cycle:one", status="DRAFT", settings={
            "evaluator_rules": {"groups": [{"conditions": [{
                "field": "hire_date", "operator": "include", "values": ["2026-01-01", "2026-01-31"]
            }]}]}
        },
    )

    class Result:
        def __init__(self, values):
            self.values = values
        def scalars(self):
            return SimpleNamespace(all=lambda: self.values)

    class Db:
        def __init__(self):
            self.scalar_calls = 0
        async def scalar(self, _query):
            self.scalar_calls += 1
            return [cycle, snapshot, None][self.scalar_calls - 1]
        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            if model is PerformanceAuthorizationSnapshotPerson:
                return Result([person])
            if model is PerformanceCycleProjectManager:
                return Result([])
            raise AssertionError(model)

    with pytest.raises(ProjectValidationError, match="项目未配置流程节点"):
        await PerformanceProjectService(Db()).start_project(project, actor_type="PORTAL_USER", actor_id=1)


def _employee_secret_template():
    return {"content": [{
        "content_id": "content", "type": "custom", "name": "Visible section", "description": "secret-root-description",
        "settings": {"hideDescription": True}, "items": [
            {"id": "visible", "label": "secret-name", "hint": "secret-description", "questionType": "tag",
             "settings": {"hideName": True, "hideDescription": True}, "options": [{"id": "a", "label": "Allowed option"}]},
            {"id": "hidden", "label": "secret-question", "questionType": "tag", "settings": {"mode": "hidden", "required": True},
             "options": [{"id": "secret-option", "label": "secret-option"}]},
            {"id": "readonly", "label": "Readonly", "settings": {"mode": "view", "required": True}},
        ],
    }, {"content_id": "hidden-section", "type": "custom", "name": "secret-section", "items": [
        {"id": "whole-hidden", "label": "secret-whole", "settings": {"mode": "hidden"}},
    ]}]}


@pytest.mark.asyncio
@pytest.mark.parametrize("submit", [False, True])
async def test_employee_hidden_and_readonly_forgery_is_not_written_or_echoed(monkeypatch, submit):
    from copy import deepcopy
    from app.performance import projects_router

    template = _employee_secret_template()
    original_template = deepcopy(template)
    original_hidden = {"tags": ["secret-legacy"], "notes": {"secret-legacy": "secret-historical-answer"}}
    task = SimpleNamespace(id=9, project_id=3, available_at=None, due_at=None, submitted_at=None, answer_version=1,
                           answers={"hidden": deepcopy(original_hidden), "readonly": "secret-old-readonly", "visible": {"tags": ["a"], "notes": {"a": "Previous"}}}, status="pending", completed_at=None)
    node = SimpleNamespace(node_id="summary", config={"template": template})
    async def fake_task(*_args):
        return task, node
    async def allow_overdue(*_args):
        return True
    class Db:
        async def get(self, *_args):
            return None
        async def commit(self):
            return None
    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow_overdue)
    payload = projects_router.SelfSummaryAnswersPayload(answers={
        "visible": {"tags": ["a"], "notes": {"a": "Allowed answer"}}, "hidden": "forged", "readonly": "forged", "unknown": "forged",
    }, version=1)
    result = await projects_router._save_self_summary(9, payload, submit, context(), Db())
    assert result["answers"] == {"visible": payload.answers["visible"]}
    assert task.answers["hidden"] == original_hidden
    assert task.answers["readonly"] == "secret-old-readonly"
    assert "unknown" not in task.answers
    assert template == original_template


@pytest.mark.asyncio
@pytest.mark.parametrize("submitted,ambiguous", [(True, False), (False, False), (True, True)])
@pytest.mark.parametrize("repeatable", [False, True])
async def test_evaluation_view_reads_only_unique_submitted_same_snapshot_source(submitted, ambiguous, repeatable):
    from copy import deepcopy
    from datetime import datetime, timezone
    from app.performance import projects_router

    content = {"content_id": "shared", "type": "custom", "name": "Work", "settings": {"allowMultiple": repeatable}, "items": [{"id": "text", "label": "Text"}]}
    source_node = SimpleNamespace(id=11, node_type="work_summary", config={"template": {"content": [deepcopy(content)]}})
    current = deepcopy(content)
    current["items"][0]["settings"] = {"mode": "view", "required": True}
    node = SimpleNamespace(node_type="evaluation", config={"template": {"content": [current]}})
    task = SimpleNamespace(id=19, project_id=3, cycle_ref="cycle:one", member_snapshot_id=7, target_employee_no="E001", answers={"text": "secret-forged"})
    expected_value = ["Submitted answer", "Second answer"] if repeatable else "Submitted answer"
    source_task = SimpleNamespace(answers={"text": expected_value}, status="completed" if submitted else "pending",
                                  submitted_at=datetime.now(timezone.utc) if submitted else None)
    before = deepcopy(task.answers)
    class Db:
        def __init__(self):
            self.calls = []
        async def execute(self, query):
            self.calls.append(query)
            values = [source_node] if len(self.calls) == 1 else [source_task] * (2 if ambiguous else 1)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
    db = Db()
    schema, answers = await projects_router._task_visible_content(task, node, db)
    assert schema[0]["fields"][0]["readonly"] is True
    assert schema[0]["fields"][0]["required"] is False
    assert answers == ({"text": expected_value} if submitted and not ambiguous else {})
    query = str(db.calls[1].compile(compile_kwargs={"literal_binds": True}))
    assert "project_id = 3" in query and "cycle_ref = 'cycle:one'" in query
    assert "member_snapshot_id = 7" in query and "target_employee_no = 'E001'" in query
    assert task.answers == before


def test_employee_projection_omits_hidden_schema_answers_and_preserves_repeatable_shapes():
    from copy import deepcopy
    import json
    from app.performance.self_summary_service import build_self_summary_schema, project_self_summary_answers, sanitize_self_summary_answers
    template = _employee_secret_template()
    template["content"][0]["settings"]["allowMultiple"] = True
    before = deepcopy(template)
    schema = build_self_summary_schema(template)
    raw = {"visible": [{"tags": ["a"], "notes": {"a": "Allowed", "secret-option": "secret-note"}, "secret-extra": "secret-extra"}], "hidden": "secret-answer", "readonly": "secret-forged", "unknown": "secret-unknown"}
    answers = project_self_summary_answers(schema, raw)
    assert "secret" not in json.dumps({"form_schema": schema, "answers": answers})
    assert answers == {"visible": [{"tags": ["a"], "notes": {"a": "Allowed"}}]}
    assert [section["id"] for section in schema] == ["content"]
    assert sanitize_self_summary_answers(schema, {"hidden": "forged", "readonly": "forged"}) == {}
    assert template == before


@pytest.mark.parametrize("endpoint", ["detail", "reference", "overview"])
def test_employee_http_responses_do_not_serialize_hidden_secrets(monkeypatch, endpoint):
    from copy import deepcopy
    from datetime import datetime, timezone
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.core.db import get_session
    from app.performance.auth_context import get_performance_access_context
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    template = _employee_secret_template()
    original = deepcopy(template)
    submitted = datetime(2026, 10, 1, tzinfo=timezone.utc)
    task = SimpleNamespace(id=9, project_id=3, task_kind="work_summary", member_snapshot_id=7, node_snapshot_id=11,
        target_employee_no="E001", handler_ref="E001", available_at=None, due_at=None, submitted_at=submitted,
        answer_version=1, status="completed", answers={"visible": {"tags": ["a", "secret-option"], "notes": {"a": "Allowed", "secret-option": "secret-note"}, "extra": "secret-extra"}, "hidden": "secret-answer", "readonly": "secret-forged"})
    node = SimpleNamespace(id=11, project_id=3, node_id="summary", node_type="work_summary", node_order=1,
                           name="Summary", config={"template": template})
    target_project = SimpleNamespace(id=3, name="Project", settings={})
    cycle = SimpleNamespace(name="Cycle", start_at=None, end_at=None)
    current_task = SimpleNamespace(**{**vars(task), "id": 10, "task_kind": "evaluation"})
    current_node = SimpleNamespace(id=12, node_id="review", node_type="evaluation", name="Review", config={"template": {"content": [
        {"content_slot": "reference", "reference_kind": "node", "reference_value": "summary"},
    ]}})
    async def fake_task(*_args):
        return (current_task, current_node) if endpoint == "reference" else (task, node)
    async def actor(*_args, **_kwargs):
        return SimpleNamespace(actor_ref="E001", actor_type="EMPLOYEE")
    async def fields(*_args):
        return {"other": set()}
    async def role(*_args):
        return "other"
    async def allow(*_args):
        return True
    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "resolve_subject_visibility_role", role)
    monkeypatch.setattr(projects_router, "load_subject_visibility_rules", fields)
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow)
    class Db:
        def __init__(self):
            self.calls = 0
        async def get(self, model, _identity):
            return target_project if model is PerformanceProject else None
        async def scalar(self, _query):
            return None
        async def execute(self, _query):
            self.calls += 1
            values = [[(target_project, cycle)], [node], [], [task]] if endpoint == "overview" else [[node], [task]]
            rows = values[self.calls - 1]
            return SimpleNamespace(all=lambda: rows, scalars=lambda: SimpleNamespace(all=lambda: rows))
    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: Db()
    app.dependency_overrides[get_performance_access_context] = lambda: context()
    path = "/api/v1/performance/review/overview?project_id=3" if endpoint == "overview" else f"/api/v1/performance/tasks/{10 if endpoint == 'reference' else 9}/self-summary"
    response = TestClient(app).get(path)
    assert response.status_code == 200, response.text
    assert "secret" not in response.text
    assert "Allowed" in response.text
    assert template == original
    assert task.answers["hidden"] == "secret-answer"


@pytest.mark.parametrize("endpoint", ["detail", "reference", "overview"])
@pytest.mark.parametrize("source_submitted", [False, True])
def test_readonly_source_is_projected_through_employee_http_routes(monkeypatch, endpoint, source_submitted):
    from datetime import datetime, timezone
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.core.db import get_session
    from app.performance.auth_context import get_performance_access_context
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProject, PerformanceProjectMember, PerformanceProjectNodeSnapshot

    now = datetime.now(timezone.utc)
    content = {"content_id": "shared", "type": "custom", "name": "Work", "questionType": "tag", "settings": {"allowMultiple": True}, "items": [
        {"id": "tag", "label": "Tag", "hint": "readonly-tag-description", "settings": {"mode": "fill"}, "options": [{"id": "a", "label": "Allowed", "placeholder": "选项提示"}]},
    ]}
    from copy import deepcopy
    view_content = deepcopy(content)
    view_content["items"][0]["settings"] = {"mode": "view", "required": True}
    view_node = SimpleNamespace(id=12, project_id=3, node_id="evaluation", node_type="evaluation", node_order=2, name="Evaluation", config={"template": {"executor_types": ["SUBJECT"], "content": [view_content]}})
    source_node = SimpleNamespace(id=11, project_id=3, node_id="summary", node_type="work_summary", config={"template": {"content": [content]}})
    source_task = SimpleNamespace(id=8, status="completed" if source_submitted else "pending", submitted_at=now if source_submitted else None,
        answers={"tag": [{"tags": ["a", "secret-option"], "notes": {"a": "Actual submitted source", "secret-option": "secret-note"}}, {"tags": ["a"], "notes": {"a": "Second source instance"}}]})
    task = SimpleNamespace(id=9, project_id=3, cycle_ref="cycle:one", task_kind="evaluation", member_snapshot_id=7, node_snapshot_id=12,
        target_employee_no="E001", handler_ref="E001", available_at=None, due_at=None, submitted_at=now,
        answer_version=1, status="completed", answers={"tag": {"tags": ["a"], "notes": {"a": "secret-forged-view-answer"}}})
    outer_node = SimpleNamespace(id=13, node_id="outer", node_type="evaluation", name="Outer", config={"template": {"content": [
        {"content_slot": "reference", "reference_kind": "node", "reference_value": "evaluation"},
    ]}})
    outer_task = SimpleNamespace(**{**vars(task), "id": 10, "node_snapshot_id": 13, "answers": {}})
    target = SimpleNamespace(id=3, name="Project", settings={})
    cycle = SimpleNamespace(name="Cycle", start_at=None, end_at=None)
    async def fake_task(*_args):
        return (outer_task, outer_node) if endpoint == "reference" else (task, view_node)
    async def actor(*_args, **_kwargs):
        return SimpleNamespace(actor_ref="E001", actor_type="EMPLOYEE")
    async def role(*_args):
        return "other"
    async def fields(*_args):
        return {"other": set()}
    async def allow(*_args):
        return True
    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "resolve_subject_visibility_role", role)
    monkeypatch.setattr(projects_router, "load_subject_visibility_rules", fields)
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow)
    class Db:
        async def get(self, model, _identity):
            return target if model is PerformanceProject else None
        async def scalar(self, _query):
            return None
        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            params = query.compile().params
            if model is PerformanceProject:
                rows = [(target, cycle)]
            elif model is PerformanceProjectMember:
                rows = []
            elif model is PerformanceProjectNodeSnapshot:
                if "work_summary" in params.values():
                    rows = [source_node]
                else:
                    rows = [view_node]
            elif model is PerformanceNodeTask:
                rows = [source_task] if "work_summary" in params.values() else [task]
            else:
                raise AssertionError(model)
            return SimpleNamespace(all=lambda: rows, scalars=lambda: SimpleNamespace(all=lambda: rows))
    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: Db()
    app.dependency_overrides[get_performance_access_context] = lambda: context()
    path = "/api/v1/performance/review/overview?project_id=3" if endpoint == "overview" else "/api/v1/performance/tasks/9/template-task"
    response = TestClient(app).get(path)
    assert response.status_code == 200, response.text
    assert "secret" not in response.text
    assert ('"readonly":true' in response.text)
    assert ("Actual submitted source" in response.text) is source_submitted
    assert ("Second source instance" in response.text) is source_submitted
    assert source_task.answers["tag"][0]["notes"]["secret-option"] == "secret-note"


def test_result_view_flags_override_source_before_sensitive_projection():
    from copy import deepcopy
    from app.performance.self_summary_service import _project_result_view_schema

    source = {"content_id": "shared", "type": "custom", "questionType": "tag", "name": "Source title", "description": "Source description",
        "settings": {"hideName": True, "hideDescription": True}, "items": [
            {"id": "allowed", "label": "Source question", "hint": "Source hint", "settings": {"hideName": True, "hideDescription": True}, "options": [{"id": "a", "label": "Allowed"}]},
            {"id": "denied", "label": "secret-hidden", "settings": {"allowView": True}},
        ]}
    view = {"content_id": "shared", "content_slot": "view", "settings": {"hideName": False, "hideDescription": False}, "items": [
        {"id": "allowed", "settings": {"hideName": False, "hideDescription": False}},
        {"id": "denied", "settings": {"mode": "hidden", "allowView": True}},
    ]}
    before = deepcopy(source)
    schema = _project_result_view_schema({"content": [source]}, [view])
    assert schema[0]["name"] == "Source title"
    assert schema[0]["description"] == "Source description"
    assert [field["id"] for field in schema[0]["fields"]] == ["allowed"]
    assert schema[0]["fields"][0]["label"] == "Source question"
    assert "description" not in schema[0]["fields"][0]
    assert schema[0]["fields"][0]["placeholder"] == "请输入补充说明"
    assert source == before


def test_result_view_projection_uses_final_snapshot_whitelist_and_sanitizes_answers():
    from datetime import datetime, timezone
    from app.performance.self_summary_service import project_result_view_contents

    source = {
        "content_id": "final-content", "type": "custom", "questionType": "tag",
        "name": "内部内容名称", "description": "内部描述", "content_slot": "fill",
        "items": [
            {"id": "visible", "label": "可见标签", "hint": "填写说明", "questionType": "tag",
             "settings": {"mode": "fill", "allowView": True},
             "options": [{"id": "good", "label": "做得好", "placeholder": "亮点"}, {"id": "bad", "label": "待改进", "placeholder": "改进"}]},
            {"id": "hidden", "label": "不应返回", "settings": {"mode": "fill", "allowView": False}},
        ],
    }
    view = {"content": [{
        **source, "content_slot": "view", "name": "结果名称",
        "settings": {"hideName": True, "hideDescription": True},
        "items": [{**source["items"][0], "settings": {"mode": "fill", "allowView": True, "hideName": True, "hideDescription": True}}, source["items"][1]],
    }]}
    task = SimpleNamespace(
        id=11, target_employee_no="E001", status="completed",
        submitted_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        answers={"visible": {"tags": ["good", "unknown"], "notes": {"good": "<b>安全</b>", "unknown": "不应泄漏"}}, "hidden": {"tags": ["bad"]}, "other": "不在源 schema"},
    )

    contents = project_result_view_contents(view, {"content": [source]}, [task], employee_no="E001")

    assert len(contents) == 1
    assert contents[0]["task_id"] == 11
    schema = contents[0]["form_schema"]
    assert schema[0]["name"] == ""
    assert schema[0]["description"] == ""
    assert schema[0]["hide_name"] is True
    assert schema[0]["hide_description"] is True
    fields = schema[0]["fields"]
    assert [field["id"] for field in fields] == ["visible"]
    assert fields[0]["label"] == ""
    assert "description" not in fields[0]
    assert fields[0]["hide_name"] is True
    assert fields[0]["hide_description"] is True
    assert fields[0]["options"][0]["placeholder"] == "亮点"
    assert contents[0]["answers"] == {"visible": {"tags": ["good"], "notes": {"good": "<b>安全</b>"}}}


def test_result_view_projection_supports_rich_text_tag_and_rating_metadata():
    from datetime import UTC, datetime
    from app.performance.self_summary_service import project_result_view_contents

    sources = [
        {
            "content_id": "summary", "type": "work_summary", "content_slot": "fill",
            "name": "工作总结", "description": "总结根描述",
            "items": [{"id": "summary-text", "label": "总结", "hint": "总结提示", "settings": {"allowView": True}}],
        },
        {
            "content_id": "custom-text", "type": "custom", "content_slot": "fill",
            "name": "自定义文本", "description": "文本根描述",
            "items": [{"id": "custom-text-item", "label": "文本题", "questionType": "text", "hint": "文本提示", "settings": {"allowView": True}}],
        },
        {
            "content_id": "tags", "type": "custom", "questionType": "tag", "content_slot": "fill",
            "name": "标签", "description": "标签根描述",
            "items": [{"id": "tag", "label": "标签题", "questionType": "tag", "settings": {"allowView": True},
                       "options": [{"id": "good", "label": "做得好", "placeholder": "亮点"}]}],
        },
        {
            "content_id": "rating", "type": "rating", "content_slot": "fill",
            "name": "评级", "description": "评级根描述",
            "items": [{"id": "rating-item", "label": "评级题", "settings": {"allowView": True}}],
            "options": [{"id": "a", "code": "A", "label": "优秀", "color": "#3370ff"}],
        },
    ]
    view = {"content": [{**source, "content_slot": "view"} for source in sources]}
    task = SimpleNamespace(
        id=12, target_employee_no="E001", status="completed",
        submitted_at=datetime(2026, 10, 1, tzinfo=UTC),
        answers={
            "summary-text": "<p>总结内容</p>",
            "custom-text-item": "<b>自定义内容</b>",
            "tag": {"tags": ["good", "unknown"], "notes": {"good": "<p>标签说明</p>", "unknown": "不应泄漏"}},
            "rating-item": "a",
        },
    )

    contents = project_result_view_contents(view, {"content": sources}, [task], employee_no="E001")

    assert [section["id"] for section in contents[0]["form_schema"]] == ["summary", "custom-text", "tags", "rating"]
    schema_by_id = {section["id"]: section for section in contents[0]["form_schema"]}
    assert schema_by_id["summary"]["description"] == "总结根描述"
    assert schema_by_id["custom-text"]["description"] == "文本根描述"
    assert schema_by_id["tags"]["description"] == "标签根描述"
    assert schema_by_id["rating"]["description"] == "评级根描述"
    assert all("description" not in field for section in contents[0]["form_schema"] for field in section["fields"])
    assert schema_by_id["rating"]["fields"][0]["options"] == [
        {"id": "a", "code": "A", "label": "优秀", "color": "#3370ff", "placeholder": "", "required": False},
    ]
    assert contents[0]["answers"] == {
        "summary-text": "<p>总结内容</p>",
        "custom-text-item": "<b>自定义内容</b>",
        "tag": {"tags": ["good"], "notes": {"good": "<p>标签说明</p>"}},
        "rating-item": "a",
    }


def test_result_view_projection_keeps_view_hidden_and_allow_view_rules_for_all_types():
    from datetime import UTC, datetime
    from app.performance.self_summary_service import project_result_view_contents

    source = {"content_id": "content", "type": "work_summary", "content_slot": "fill", "name": "根", "items": [
        {"id": "visible", "settings": {"allowView": True}},
        {"id": "denied", "settings": {"allowView": False}},
        {"id": "hidden", "settings": {"mode": "hidden", "allowView": True}},
    ]}
    view = {"content": [{**source, "content_slot": "view", "items": [
        {"id": "visible", "settings": {"allowView": True, "hideName": True}},
        {"id": "denied", "settings": {"allowView": False}},
        {"id": "hidden", "settings": {"mode": "hidden", "allowView": True}},
    ]}]}
    task = SimpleNamespace(id=1, status="completed", submitted_at=datetime.now(UTC), target_employee_no="E001", answers={
        "visible": "可见", "denied": "不应返回", "hidden": "不应返回",
    })

    result = project_result_view_contents(view, {"content": [source]}, [task], employee_no="E001")

    assert [field["id"] for field in result[0]["form_schema"][0]["fields"]] == ["visible"]
    assert result[0]["form_schema"][0]["fields"][0]["hide_name"] is True
    assert result[0]["answers"] == {"visible": "可见"}


@pytest.mark.asyncio
async def test_project_results_route_keeps_rating_results_and_adds_projected_contents(monkeypatch):
    from datetime import datetime, timezone
    from app.performance import projects_router

    project = SimpleNamespace(id=7, cycle_ref="cycle:7")
    tags = {"content_id": "tags", "type": "custom", "name": "标签", "items": [{"id": "tag", "label": "标签题", "questionType": "tag", "options": [{"id": "a", "label": "协作"}]}]}
    view = SimpleNamespace(config={"template": {"content": [{**tags, "content_slot": "view"}]}})
    final = SimpleNamespace(id=31, config={"template": {"content": [
        {**tags, "content_slot": "fill"},
        {"content_id": "rating", "type": "rating", "content_slot": "fill", "name": "评级", "items": [{"id": "rating", "label": "评级"}], "options": [{"id": "A", "label": "优秀"}]},
    ]}})
    task = SimpleNamespace(id=101, target_employee_no="E001", node_snapshot_id=31, status="completed", submitted_at=datetime(2026, 10, 1, tzinfo=timezone.utc), answers={"rating": "A", "tag": {"tags": ["a"], "notes": {"a": "<script>x</script><p>完成</p>"}}, "work": "不应返回"})
    member = SimpleNamespace(employee_no="E001")

    async def actor(*_args, **_kwargs):
        return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E001")

    async def opening_state(*_args, **_kwargs):
        return view, final, None, [member], [task], projects_router.build_self_summary_schema(final.config["template"])

    monkeypatch.setattr(projects_router, "_get_project", lambda *_args: _resolved(project))
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "_opening_state", opening_state)

    class Db:
        async def scalar(self, _statement):
            return SimpleNamespace(id=1)

    result = await projects_router.read_my_project_results(7, context(), Db())

    assert result["results"] == [{"task_id": 101, "field_id": "rating", "option_id": "A", "label": "优秀"}]
    assert result["contents"][0]["task_id"] == 101
    assert result["contents"][0]["answers"] == {"tag": {"tags": ["a"], "notes": {"a": "<p>完成</p>"}}}


@pytest.mark.parametrize("allow_view", [None, True, False])
@pytest.mark.parametrize("hide_name,hide_description", [(False, False), (True, False), (False, True), (True, True)])
def test_result_tag_projection_defaults_visibility_and_keeps_display_flags_independent(allow_view, hide_name, hide_description):
    from copy import deepcopy
    from datetime import UTC, datetime
    from app.performance.self_summary_service import project_result_view_contents

    tag = {"id": "tag", "label": "标签题", "hint": "题目描述", "questionType": "tag", "options": [{"id": "a", "label": "协作", "placeholder": "标签提示"}]}
    source = {"content_id": "tags", "content_slot": "fill", "type": "custom", "questionType": "text", "name": "模块", "description": "模块描述", "items": [tag, {"id": "text", "label": "内部文本", "questionType": "text", "settings": {"mode": "hidden"}}]}
    settings = {"hideName": hide_name, "hideDescription": hide_description}
    if allow_view is not None:
        settings["allowView"] = allow_view
    view = {"content": [{**source, "content_slot": "view", "items": [{**tag, "settings": settings}]}]}
    original = deepcopy((source, view))
    task = SimpleNamespace(id=1, status="completed", submitted_at=datetime.now(UTC), target_employee_no="E001", answers={"tag": {"tags": ["a", "forged"], "notes": {"a": "<script>secret</script><p>反馈</p>", "forged": "秘密"}, "unknown": "秘密"}, "text": "内部答案", "unknown": "秘密"})
    result = project_result_view_contents(view, {"content": [source]}, [task], employee_no="E001")
    if allow_view is False:
        assert result == []
    else:
        section = result[0]["form_schema"][0]
        assert section["name"] == "模块"
        assert section["description"] == "模块描述"
        assert len(section["fields"]) == 1
        field = section["fields"][0]
        assert field["hide_name"] is hide_name
        assert field["hide_description"] is hide_description
        assert field["label"] == ("" if hide_name else "标签题")
        assert "description" not in field
        assert field["options"][0]["placeholder"] == "标签提示"
        assert result[0]["answers"] == {"tag": {"tags": ["a"], "notes": {"a": "<p>反馈</p>"}}}
    assert (source, view) == original


def test_result_tag_projection_rejects_unbound_sources_and_unsubmitted_or_other_person_tasks():
    from datetime import UTC, datetime
    from app.performance.self_summary_service import project_result_view_contents

    source = {"content_id": "tags", "type": "custom", "questionType": "tag", "content_slot": "fill", "name": "标签", "items": [{"id": "tag", "label": "旧标签题", "options": [{"id": "a", "label": "协作"}]}]}
    final = {"content": [source]}
    task = {"id": 1, "status": "completed", "submitted_at": datetime.now(UTC), "target_employee_no": "E001", "answers": {"tag": ["a"]}}
    assert project_result_view_contents({"content_bindings": {"view": ["tags"]}}, final, [task], employee_no="E001")[0]["answers"] == {"tag": {"tags": ["a"]}}
    for view in ({}, {"content_bindings": {"view": ["other"]}}, {"content": [{**source, "content_slot": "reference"}]}):
        assert project_result_view_contents(view, final, [task], employee_no="E001") == []
    invalid_tasks = [{**task, "status": "pending"}, {**task, "submitted_at": None}, {**task, "target_employee_no": "E002"}]
    assert project_result_view_contents({"content_bindings": {"view": ["tags"]}}, final, invalid_tasks, employee_no="E001") == []


@pytest.mark.asyncio
@pytest.mark.parametrize("denied", ["identity", "actor", "opening", "member"])
async def test_result_tag_route_preserves_result_access_denials(monkeypatch, denied):
    from fastapi import HTTPException
    from app.performance import projects_router
    from app.performance.auth_context import PerformanceIdentityMappingNotFound

    async def actor(*_args, **_kwargs):
        if denied == "identity":
            raise PerformanceIdentityMappingNotFound()
        return SimpleNamespace(actor_type="PORTAL_USER" if denied == "actor" else "EMPLOYEE", actor_ref="E001")

    async def opening_state(*_args, **_kwargs):
        return SimpleNamespace(config={}), SimpleNamespace(id=31, config={}), None, [], [], []

    monkeypatch.setattr(projects_router, "_get_project", lambda *_args: _resolved(SimpleNamespace(id=7, cycle_ref="cycle:7")))
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "_opening_state", opening_state)

    class Db:
        async def scalar(self, _statement):
            return None if denied == "opening" else SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as error:
        await projects_router.read_my_project_results(7, context(), Db())
    assert error.value.status_code == 404
    assert error.value.detail == "RESULT_NOT_FOUND"


async def _resolved(value):
    return value


def calibration_phase_time_settings():
    return {
        "node_settings": {"calibration-1": {"calibration": {"phases": [
            {"phase_id": "first", "rules": []}, {"phase_id": "second", "rules": []},
        ]}}},
        "node_times": {"calibration-1": {"phase_times": {
            "first": {"start_at": "2026-10-01T09:00+08:00", "end_at": "2026-10-05T18:00+08:00"},
            "second": {"start_at": "2026-10-06T09:00+08:00", "end_at": "2026-10-10T18:00+08:00"},
        }}},
    }


def test_calibration_phase_times_round_trip_through_payload_and_response():
    from copy import deepcopy
    original = calibration_phase_time_settings()
    payload = deepcopy(original)
    normalized = PerformanceProjectService._validate_flow_settings(payload)
    timing = normalized["node_times"]["calibration-1"]
    assert timing["start_at"] == original["node_times"]["calibration-1"]["phase_times"]["first"]["start_at"]
    assert timing["end_at"] == original["node_times"]["calibration-1"]["phase_times"]["second"]["end_at"]
    assert timing["phase_times"] == original["node_times"]["calibration-1"]["phase_times"]
    assert payload == original
    assert PerformanceProjectService._validate_flow_settings(normalized) == normalized
    _, _, _, saved = PerformanceProjectService._validate_payload({"name": "校准项目", "flow_settings": normalized})
    target = project()
    target.settings = saved
    assert PerformanceProjectService.serialize(target)["flow_settings"] == normalized


@pytest.mark.parametrize("change,message", [
    (lambda flow: flow["node_times"]["calibration-1"]["phase_times"]["second"].update(end_at="2026-10-06T08:00+08:00"), "第 2 阶段"),
    (lambda flow: flow["node_times"]["calibration-1"]["phase_times"]["second"].update(start_at="invalid"), "时间格式"),
    (lambda flow: flow["node_times"]["calibration-1"]["phase_times"].update(unknown={}), "不一致"),
    (lambda flow: flow["node_times"]["calibration-1"].update(phase_times=[]), "格式不正确"),
    (lambda flow: flow["node_times"]["calibration-1"]["phase_times"]["first"].update(unexpected="value"), "格式不正确"),
    (lambda flow: flow["node_settings"]["calibration-1"]["calibration"]["phases"][1].update(phase_id="first"), "标识"),
    (lambda flow: flow["node_settings"]["calibration-1"]["calibration"]["phases"][1].update(phase_id=""), "标识"),
])
def test_calibration_phase_times_reject_invalid_values(change, message):
    flow = calibration_phase_time_settings()
    change(flow)
    with pytest.raises(ProjectValidationError, match=message):
        PerformanceProjectService._validate_flow_settings(flow)


def test_calibration_phase_times_allow_partial_drafts_without_inventing_an_envelope():
    flow = calibration_phase_time_settings()
    flow["node_times"]["calibration-1"]["phase_times"].pop("second")
    timing = PerformanceProjectService._validate_flow_settings(flow)["node_times"]["calibration-1"]
    assert timing["phase_times"]["second"] == {"start_at": "", "end_at": ""}
    assert timing["start_at"] == timing["end_at"] == ""


def test_calibration_phase_times_preserve_omitted_map_and_prune_deleted_phase_by_id():
    saved = PerformanceProjectService._validate_flow_settings(calibration_phase_time_settings())
    flow = calibration_phase_time_settings()
    flow["node_times"]["calibration-1"] = {"start_at": "", "end_at": ""}
    flow["node_settings"]["calibration-1"]["calibration"]["phases"].pop(0)
    _, _, _, result = PerformanceProjectService._validate_payload({"name": "校准项目", "flow_settings": flow}, {"flow_settings": saved})
    timing = result["flow_settings"]["node_times"]["calibration-1"]
    assert list(timing["phase_times"]) == ["second"]
    assert timing["start_at"] == saved["node_times"]["calibration-1"]["phase_times"]["second"]["start_at"]
    assert list(saved["node_times"]["calibration-1"]["phase_times"]) == ["first", "second"]


def test_calibration_phase_times_reject_legacy_client_dropping_stable_phase_ids():
    saved = PerformanceProjectService._validate_flow_settings(calibration_phase_time_settings())
    flow = calibration_phase_time_settings()
    for phase in flow["node_settings"]["calibration-1"]["calibration"]["phases"]:
        phase.pop("phase_id")
    flow["node_times"]["calibration-1"].pop("phase_times")
    with pytest.raises(ProjectValidationError, match="刷新项目"):
        PerformanceProjectService._validate_payload({"name": "校准项目", "flow_settings": flow}, {"flow_settings": saved})


def test_calibration_phase_times_use_actual_instants_for_aggregate_range():
    flow = calibration_phase_time_settings()
    times = flow["node_times"]["calibration-1"]["phase_times"]
    times["second"] = {"start_at": "2026-10-01T01:30Z", "end_at": "2026-10-05T11:00Z"}
    timing = PerformanceProjectService._validate_flow_settings(flow)["node_times"]["calibration-1"]
    assert timing["start_at"] == times["first"]["start_at"]
    assert timing["end_at"] == times["second"]["end_at"]


@pytest.mark.asyncio
async def test_calibration_phase_times_real_database_api_round_trip():
    import os
    if os.getenv("RUN_PERFORMANCE_DB_TEST") != "1":
        pytest.skip("显式 RUN_PERFORMANCE_DB_TEST=1 才运行本地数据库回滚验收")
    from datetime import UTC, datetime
    from uuid import uuid4
    import httpx
    from fastapi import FastAPI
    from sqlalchemy import select
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool
    from app.performance import projects_router
    from app.performance.models import PerformanceAuditEvent, PerformanceCycle, PerformanceProject

    assert make_url(settings.db_url_async).host in {"localhost", "127.0.0.1"}, "只允许本地开发数据库"
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
    reference = f"test:phase-times:{uuid4().hex}"
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
            try:
                cycle = PerformanceCycle(cycle_ref=reference, name="阶段日期回滚验收", period_year=2026, period_type="CUSTOM", start_at=datetime(2026, 10, 1, tzinfo=UTC), end_at=datetime(2026, 11, 1, tzinfo=UTC), lock_rule="IMMEDIATE", created_by_type="PORTAL_USER", created_by_ref="1")
                target = PerformanceProject(project_ref=reference, cycle_ref=reference, name="阶段日期回滚验收", status="DRAFT", administrators=[], settings={})
                session.add(cycle)
                await session.flush()
                session.add(target)
                await session.commit()
                project_id = target.id
                app = FastAPI()
                app.include_router(projects_router.router, prefix="/api/v1")
                app.dependency_overrides[projects_router.get_session] = lambda: session
                app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    url = f"/api/v1/performance/projects/{project_id}"
                    response = await client.patch(url, json={"name": target.name, "flow_settings": calibration_phase_time_settings()})
                    assert response.status_code == 200, response.text
                    saved = response.json()["flow_settings"]
                    session.expunge_all()
                    persisted = await session.scalar(select(PerformanceProject.settings).where(PerformanceProject.id == project_id))
                    assert persisted["flow_settings"] == saved
                    audit = await session.scalar(select(PerformanceAuditEvent).where(PerformanceAuditEvent.subject_ref == reference))
                    assert audit.event_type == "PERFORMANCE_PROJECT_UPDATED"
                    assert audit.after_state["flow_settings"] == saved
                    reopened = await client.get(url)
                    assert reopened.status_code == 200
                    assert reopened.json()["flow_settings"] == saved
                    saved["node_settings"]["calibration-1"]["calibration"]["phases"].pop(0)
                    saved["node_times"]["calibration-1"]["phase_times"].pop("first")
                    response = await client.patch(url, json={"name": "阶段日期回滚验收", "flow_settings": saved})
                    assert response.status_code == 200, response.text
                    remaining = response.json()["flow_settings"]["node_times"]["calibration-1"]
                    assert list(remaining["phase_times"]) == ["second"]
                    assert remaining["start_at"] == remaining["phase_times"]["second"]["start_at"]
                    invalid = calibration_phase_time_settings()
                    invalid["node_times"]["calibration-1"]["phase_times"]["second"]["end_at"] = "2026-10-01T00:00"
                    assert (await client.patch(url, json={"name": "阶段日期回滚验收", "flow_settings": invalid})).status_code == 422
                    assert (await client.get(url)).json()["flow_settings"]["node_times"]["calibration-1"] == remaining
                    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
                    assert (await client.get(url)).status_code == 403
                    assert (await client.patch(url, json={"name": "无权", "flow_settings": saved})).status_code == 403
            finally:
                await session.close()
                await transaction.rollback()
        async with engine.connect() as connection:
            assert await connection.scalar(select(PerformanceProject.id).where(PerformanceProject.project_ref == reference)) is None
            assert await connection.scalar(select(PerformanceCycle.id).where(PerformanceCycle.cycle_ref == reference)) is None
    finally:
        await engine.dispose()


def _snapshot_filter_people():
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people
    return [SimpleNamespace(**vars(person)) for person in build_snapshot_people([
        RosterAuthorizationInput(employee_no="E1", display_name="员工一", company_org="集团", department="研发", employee_type="正式员工", employment_status="在职", job_family="技术", job_category="研发", position_level="P6", standard_position="软件工程师", hire_date=date(2020, 1, 1)),
        RosterAuthorizationInput(employee_no="E2", display_name="员工二", company_org="集团", department="研发", employee_type="正式员工", employment_status="离职", job_family="技术", job_category="研发", position_level="P6", standard_position="软件工程师", hire_date=date(2021, 1, 1), departure_date=date(2026, 10, 1)),
        RosterAuthorizationInput(employee_no="E3", display_name="员工三", company_org="集团", department="销售", employment_status="离职", job_family="营销", departure_date=date(2026, 10, 31)),
        RosterAuthorizationInput(employee_no="E4", display_name="区间外", employment_status="离职", job_family="区间外", departure_date=date(2026, 9, 30)),
        RosterAuthorizationInput(employee_no="E5", display_name="空离职日期", employment_status="离职", job_family="无日期"),
    ])]


def _snapshot_filter_cycle(mode="REPORT_ONLY"):
    return SimpleNamespace(cycle_ref="cycle:one", leaver_enabled=True, leaver_start_date=date(2026, 10, 1), leaver_end_date=date(2026, 10, 31), leaver_participation_mode=mode)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["DRAFT", "LOCKED"])
async def test_six_field_options_use_cycle_snapshot_and_keep_allowed_leavers(monkeypatch, status):
    from app.performance import project_service
    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson

    people = _snapshot_filter_people()
    people[0].live_employment_status = "离职"

    async def forbidden_roster(*_args):
        raise AssertionError("候选和预览禁止回查实时花名册")
    monkeypatch.setattr(project_service, "_canonical_roster_rows", forbidden_roster)

    class Db:
        async def scalar(self, statement):
            assert statement.column_descriptions[0]["entity"] is PerformanceAuthorizationSnapshot
            assert "status" not in statement.compile().params
            return SimpleNamespace(id=7, status=status)
        async def execute(self, statement):
            assert statement.column_descriptions[0]["entity"] is PerformanceAuthorizationSnapshotPerson
            assert statement.compile().params["snapshot_id_1"] == 7
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: people))

    service = PerformanceProjectService(Db())
    cycle = _snapshot_filter_cycle()
    options = await service.evaluator_options(cycle)
    assert set(options) == {"organization_tree", "people", "employee_types", "hire_date_range", "employment_statuses", "job_families", "job_categories", "position_levels", "standard_positions", "departure_date_range"}
    assert [item["value"] for item in options["people"]] == ["E1", "E2", "E3"]
    for key, values in {"employment_statuses": ["在职", "离职"], "job_families": sorted(["技术", "营销"]), "job_categories": ["研发"], "position_levels": ["P6"], "standard_positions": ["软件工程师"]}.items():
        assert options[key] == [{"value": value, "label": value} for value in values]
    assert options["departure_date_range"] == {"min": "2026-10-01", "max": "2026-10-31"}
    rules = {"groups": [{"conditions": [{"field": "employment_status", "operator": "include", "values": ["在职"]}]}]}
    assert await service.evaluator_count(cycle, rules) == 1
    cycle.leaver_enabled = False
    options = await service.evaluator_options(cycle)
    assert [item["value"] for item in options["people"]] == ["E1"]
    assert options["departure_date_range"] == {"min": None, "max": None}


@pytest.mark.parametrize("field,value", [("employment_status", "离职"), ("job_family", "技术"), ("job_category", "研发"), ("position_level", "P6"), ("standard_position", "软件工程师")])
@pytest.mark.parametrize("operator", ["include", "exclude"])
def test_six_field_text_filters_match_and_round_trip(field, value, operator):
    condition = {"field": field, "operator": operator, "values": [value, " 另一个值 ", value]}
    rules = PerformanceProjectService._validate_rules({"groups": [{"conditions": [condition]}]})
    assert rules["groups"][0]["conditions"][0]["values"] == [value, "另一个值"]
    target = project()
    _, _, _, target.settings = PerformanceProjectService._validate_payload({"name": target.name, "evaluator_rules": rules})
    assert PerformanceProjectService.serialize(target)["evaluator_rules"] == rules
    people = [SimpleNamespace(employee_no="match", **{field: value}), SimpleNamespace(employee_no="other", **{field: "其他"})]
    assert [person.employee_no for person in PerformanceProjectService._select_people(people, target.settings)] == (["match"] if operator == "include" else ["other"])


@pytest.mark.parametrize("operator,expected", [("before", [True, False, False]), ("not_before", [False, True, True]), ("after", [False, False, True]), ("not_after", [True, True, False])])
def test_departure_date_uses_same_comparisons_as_hire_date(operator, expected):
    from app.performance.project_service import _matches_scope_condition, _matches_start_project_condition
    condition = {"field": "departure_date", "operator": operator, "values": ["2026-10-15"]}
    rules = {"groups": [{"conditions": [condition]}]}
    assert PerformanceProjectService._validate_rules(rules) == rules
    for matcher in [_matches_scope_condition, _matches_start_project_condition]:
        assert [matcher({"departure_date": date(2026, 10, day)}, condition) for day in [14, 15, 16]] == expected
        assert not matcher({"departure_date": None}, condition)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,expected_tasks", [("REPORT_ONLY", {"E1"}), ("CREATE_TASK", {"E1", "E2"})])
async def test_preview_and_actual_start_share_six_field_snapshot_filters(monkeypatch, mode, expected_tasks):
    from app.performance import project_service, models
    from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService
    people = _snapshot_filter_people()
    cycle = _snapshot_filter_cycle(mode)
    snapshot = SimpleNamespace(id=7, status="LOCKED")
    target = project()
    target.settings = {
        "template_id": 11,
        "evaluator_rules": {"groups": [
            {"conditions": [{"field": field, "operator": "include", "values": [value]} for field, value in [("employment_status", "离职"), ("job_family", "技术"), ("job_category", "研发"), ("position_level", "P6"), ("standard_position", "软件工程师")]] + [{"field": "departure_date", "operator": "not_before", "values": ["2026-10-01"]}]},
            {"conditions": [{"field": "employment_status", "operator": "include", "values": ["在职"]}]},
        ]},
        "scope_rules": {"groups": [{"conditions": [{"field": "department", "operator": "include", "values": ["集团/研发"]}]}]},
        "flow_settings": {"node_settings": {"view": {"result_view": {"automatic_enabled": True}}}},
    }
    workflow = SimpleNamespace(content_library=[], nodes=[
        {"node_id": "summary", "node_type": "work_summary", "name": "总结", "include_final_result": True, "executor_types": ["SUBJECT"]},
        {"node_id": "view", "node_type": "result_view", "name": "结果"},
    ])

    class Db:
        def __init__(self):
            self.added = []
        async def scalar(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            return cycle if entity is models.PerformanceCycle else snapshot if entity is models.PerformanceAuthorizationSnapshot else None
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is models.PerformanceAuthorizationSnapshot:
                return SimpleNamespace(scalar_one_or_none=lambda: snapshot)
            values = people if entity is models.PerformanceAuthorizationSnapshotPerson else []
            if entity is models.PerformanceRole:
                values = [SimpleNamespace(code="assessment.reviewee", role_type="ASSESSMENT", is_system=True, is_active=True)]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
        async def get(self, entity, key):
            assert entity is models.PerformanceTemplateWorkflow and key == 11
            return workflow
        def add(self, obj):
            self.added.append(obj)
            if hasattr(obj, "id") and obj.id is None:
                obj.id = len(self.added)
        async def flush(self):
            pass
        async def commit(self):
            pass
        async def refresh(self, _obj):
            pass

    async def forbidden_roster(*_args):
        raise AssertionError("启动和预览禁止读取实时花名册")
    monkeypatch.setattr(project_service, "_canonical_roster_rows", forbidden_roster)
    db = Db()
    service = PerformanceProjectService(db)
    matched, tasks, reports = await service.preview_people(cycle, target.settings)
    assert {person.employee_no for person in matched} == {"E1", "E2"}
    assert {person.employee_no for person in tasks} == expected_tasks
    await PerformanceAuthorizationSnapshotService(db).sync_employment_statuses(cycle.cycle_ref, {"E1": "离职", "E2": "在职"})
    after, after_tasks, _ = await service.preview_people(cycle, target.settings)
    assert after == matched and after_tasks == tasks
    snapshot.status = "DRAFT"
    with pytest.raises(ProjectValidationError, match="尚未锁定"):
        await service.start_project(target, actor_type="PORTAL_USER", actor_id=1)
    assert db.added == []
    snapshot.status = "LOCKED"
    await service.start_project(target, actor_type="PORTAL_USER", actor_id=1)
    members = [obj for obj in db.added if isinstance(obj, models.PerformanceProjectMember)]
    generated = [obj for obj in db.added if isinstance(obj, models.PerformanceNodeTask)]
    assert {person.employee_no for person in members} == {person.employee_no for person in matched}
    assert {person.employee_no: person.employment_status for person in members} == {"E1": "在职", "E2": "离职"}
    assert {task.target_employee_no for task in generated} == expected_tasks
    assert target.status == "STARTED"


@pytest.mark.asyncio
async def test_six_field_rules_post_patch_get_and_live_status_reopen(monkeypatch):
    import httpx
    from fastapi import FastAPI
    from app.performance import projects_router, models
    from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService
    cycle = _snapshot_filter_cycle()
    people = _snapshot_filter_people()
    snapshot = SimpleNamespace(id=7, status="DRAFT")

    class Db:
        def __init__(self):
            self.project = None
        async def scalar(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            return snapshot if entity is models.PerformanceAuthorizationSnapshot else cycle if entity is models.PerformanceCycle else None
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is models.PerformanceAuthorizationSnapshot:
                return SimpleNamespace(scalar_one_or_none=lambda: snapshot)
            values = people if entity is models.PerformanceAuthorizationSnapshotPerson else []
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
        async def get(self, _entity, _key):
            return None
        def add(self, obj):
            if isinstance(obj, models.PerformanceProject):
                obj.id = 41
                self.project = obj
        async def flush(self):
            pass
        async def commit(self):
            pass
        async def refresh(self, _obj):
            pass
    db = Db()
    async def get_cycle(*_args):
        return cycle
    async def get_project(*_args):
        return db.project
    monkeypatch.setattr(projects_router, "_get_cycle", get_cycle)
    monkeypatch.setattr(projects_router, "_get_project", get_project)
    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[projects_router.get_session] = lambda: db
    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
    conditions = [{"field": field, "operator": "include", "values": [value]} for field, value in [("employment_status", "离职"), ("job_family", "技术"), ("job_category", "研发"), ("position_level", "P6"), ("standard_position", "软件工程师")]]
    rules = {"groups": [{"conditions": [*conditions, {"field": "departure_date", "operator": "not_after", "values": ["2026-10-31"]}]}]}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post("/api/v1/performance/cycles/1/projects", json={"name": "六字段筛选", "evaluator_rules": rules})
        assert created.status_code == 201, created.text
        assert created.json()["evaluator_rules"] == rules and created.json()["evaluated_count"] == 0
        url = "/api/v1/performance/projects/41"
        assert (await client.get(url)).json()["evaluator_rules"] == rules
        await PerformanceAuthorizationSnapshotService(db).sync_employment_statuses(cycle.cycle_ref, {"E2": "在职"})
        preview = await client.post("/api/v1/performance/cycles/1/evaluator-preview/people", json={"evaluator_rules": rules})
        assert preview.status_code == 200 and preview.json()["total"] == 1
        assert preview.json()["items"][0]["employment_status"] == "离职"
        assert preview.json()["items"][0]["live_employment_status"] == "在职"
        changed = {"groups": [{"conditions": [{"field": "employment_status", "operator": "include", "values": ["在职"]}]}]}
        updated = await client.patch(url, json={"name": "六字段筛选", "evaluator_rules": changed})
        assert updated.status_code == 200, updated.text
        assert updated.json()["evaluated_count"] == 1
        assert (await client.get(url)).json()["evaluator_rules"] == changed
        assert db.project.settings["evaluator_rules"] == changed


@pytest.mark.asyncio
async def test_snapshot_filter_http_rejections_permissions_and_missing_snapshot(monkeypatch):
    import httpx
    from fastapi import FastAPI
    from app.performance import projects_router
    cycle = _snapshot_filter_cycle()
    target = project()

    class Db:
        async def scalar(self, statement):
            from app.performance.models import PerformanceCycle
            return cycle if statement.column_descriptions[0]["entity"] is PerformanceCycle else None
        async def execute(self, _statement):
            raise AssertionError("缺失快照或非法条件不能查询人员")
    async def get_cycle(*_args):
        return cycle
    async def get_project(*_args):
        return target
    monkeypatch.setattr(projects_router, "_get_cycle", get_cycle)
    monkeypatch.setattr(projects_router, "_get_project", get_project)
    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[projects_router.get_session] = lambda: Db()
    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
    base = "/api/v1/performance/cycles/1"
    valid_rules = {"groups": [{"conditions": [{"field": "standard_position", "operator": "include", "values": ["工程师"]}]}]}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for url in [base + "/evaluator-preview", base + "/evaluator-preview/people"]:
            response = await client.post(url, json={"evaluator_rules": valid_rules})
            assert response.status_code == 422 and "快照不存在" in response.json()["detail"]
        response = await client.get(base + "/evaluator-options")
        assert response.status_code == 422 and "快照不存在" in response.json()["detail"]
        with pytest.raises(ProjectValidationError, match="快照不存在"):
            await PerformanceProjectService(Db()).start_project(target, actor_type="PORTAL_USER", actor_id=1)
        invalid = [
            {"field": [], "operator": "include", "values": ["在职"]},
            {"field": "employment_status", "operator": [], "values": ["在职"]},
            {"field": "live_employment_status", "operator": "include", "values": ["在职"]},
            *[{"field": field, "operator": "before", "values": ["2026-10-01"]} for field in ["employment_status", "job_family", "job_category", "position_level", "standard_position"]],
            *[{"field": "departure_date", "operator": "not_before", "values": values} for values in [[], ["2026-02-30"], ["2026-1-01"], ["2026-10-01", "2026-10-31"], None]],
            {"field": "departure_date", "operator": "include", "values": ["2026-10-01", "2026-10-31"]},
            *[{"field": "job_family", "operator": "include", "values": values} for values in [None, "技术", [], [None]]],
        ]
        for condition in invalid:
            rules = {"groups": [{"conditions": [condition]}]}
            for url in [base + "/evaluator-preview", base + "/evaluator-preview/people"]:
                assert (await client.post(url, json={"evaluator_rules": rules})).status_code == 422
            for method, url in [(client.post, base + "/projects"), (client.patch, "/api/v1/performance/projects/1")]:
                assert (await method(url, json={"name": "筛选", "evaluator_rules": rules})).status_code == 422
        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
        assert (await client.get(base + "/evaluator-options")).status_code == 403
        for url in [base + "/evaluator-preview", base + "/evaluator-preview/people"]:
            assert (await client.post(url, json={"evaluator_rules": valid_rules})).status_code == 403
        assert (await client.post(base + "/projects", json={"name": "筛选", "evaluator_rules": valid_rules})).status_code == 403
        assert (await client.patch("/api/v1/performance/projects/1", json={"name": "筛选", "evaluator_rules": valid_rules})).status_code == 403

@pytest.mark.parametrize("phase_id", ["__proto__", "constructor", "prototype", "with space", "x" * 97])
def test_calibration_phase_times_reject_unsafe_phase_ids(phase_id):
    flow = calibration_phase_time_settings()
    flow["node_settings"]["calibration-1"]["calibration"]["phases"][0]["phase_id"] = phase_id
    with pytest.raises(ProjectValidationError, match="标识"):
        PerformanceProjectService._validate_flow_settings(flow)


def test_calibration_phase_times_derive_window_instead_of_trusting_stale_node_dates():
    flow = calibration_phase_time_settings()
    flow["node_times"]["calibration-1"].update(start_at="2026-11-30T00:00", end_at="2026-01-01T00:00")
    normalized = PerformanceProjectService._validate_flow_settings(flow)["node_times"]["calibration-1"]
    assert normalized["start_at"] == flow["node_times"]["calibration-1"]["phase_times"]["first"]["start_at"]
    assert normalized["end_at"] == flow["node_times"]["calibration-1"]["phase_times"]["second"]["end_at"]


def _calibration_people():
    return {
        key: SimpleNamespace(
            employee_no=key,
            direct_supervisor_employee_no=manager,
            company_org="集团",
            department="新疆事业部" if key in {"E1", "E2"} else "华东事业部",
            department_2="研发部" if key == "E1" else "销售部",
            department_3=None,
            department_4=None,
            department_5=None,
            hire_date={"E1": date(2026, 2, 1), "E2": date(2025, 12, 1)}.get(key),
        )
        for key, manager in [("C1", None), ("M1", "C1"), ("E1", "M1"), ("E2", "C1"), ("E3", None)]
    }


def _calibration_rules(scope="RULE", values=None):
    return {"node_settings": {"calibration-1": {"calibration": {"phases": [{"phase_id": "first", "rules": [{"subject_groups": [{"conditions": [{"field": "employee", "operator": "INCLUDE", "values": ["C1"]}]}], "scope": scope, "scope_groups": [{"conditions": [{"field": "calibrator_relation", "operator": "INCLUDE", "values": values or ["ALL_SUBORDINATES"]}]}], "allow_authorize": False}]}]}}}}


@pytest.mark.parametrize(("relations", "expected"), [(["ALL_SUBORDINATES"], {"E1", "E2"}), (["DIRECT_SUBORDINATES"], {"E2"}), (["INDIRECT_SUBORDINATES"], {"E1"})])
def test_calibration_scope_uses_selected_project_members_and_snapshot_relationships(relations, expected):
    from app.performance.calibration_service import resolve_calibration
    result = resolve_calibration({"node_id": "calibration-1"}, _calibration_rules(values=relations), _calibration_people(), ["E1", "E2", "E3"])
    assert result["role_code"] == "assessment.calibrator"
    assert {item["employee_no"] for item in result["phases"][0]["assignments"]} == expected
    assert result["assigned_count"] == len(expected)
    assert result["unassigned_count"] == 3 - len(expected)


def test_calibration_scope_supports_department_employee_and_hire_date_snapshot_filters():
    from app.performance.calibration_service import resolve_calibration
    config = _calibration_rules()
    config["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"][0]["scope_groups"] = [{"conditions": [
        {"field": "department", "operator": "INCLUDE", "values": ["集团/新疆事业部"]},
        {"field": "employee", "operator": "EXCLUDE", "values": ["E2"]},
        {"field": "hire_date", "operator": "not_before", "values": ["2026-01-01"]},
    ]}]
    result = resolve_calibration({"node_id": "calibration-1"}, config, _calibration_people(), ["E1", "E2", "E3"])
    assert {item["employee_no"] for item in result["phases"][0]["assignments"]} == {"E1"}


def test_calibration_project_all_deduplicates_overlapping_rules_and_phases():
    from copy import deepcopy
    from app.performance.calibration_service import resolve_calibration
    config = _calibration_rules("PROJECT_ALL")
    phases = config["node_settings"]["calibration-1"]["calibration"]["phases"]
    phases[0]["rules"].append(deepcopy(phases[0]["rules"][0]))
    phases.append({**deepcopy(phases[0]), "phase_id": "second"})
    result = resolve_calibration({"node_id": "calibration-1"}, config, _calibration_people(), ["E1", "E3"])
    assert [len(phase["assignments"]) for phase in result["phases"]] == [2, 2]
    assert result["assigned_count"] == 2


def test_calibration_empty_default_is_unassigned_and_cannot_start():
    from app.performance.calibration_service import resolve_calibration
    config = _calibration_rules()
    config["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"][0].pop("subject_groups")
    result = resolve_calibration({"node_id": "calibration-1"}, config, _calibration_people(), ["E1"])
    assert result["assigned_count"] == 0
    with pytest.raises(ValueError, match="明确指定校准人"):
        resolve_calibration({"node_id": "calibration-1"}, config, _calibration_people(), ["E1"], require_complete=True)


def test_calibration_rejects_unknown_employee_and_cycles_do_not_expand_scope():
    from app.performance.calibration_service import resolve_calibration
    people = _calibration_people()
    people["C1"].direct_supervisor_employee_no = "M1"
    result = resolve_calibration({"node_id": "calibration-1"}, _calibration_rules(), people, ["E3"])
    assert result["assigned_count"] == 0
    del people["C1"]
    with pytest.raises(ValueError, match="周期人员快照"):
        resolve_calibration({"node_id": "calibration-1"}, _calibration_rules(), people, ["E1"])


def test_calibration_task_creation_preserves_each_phase_and_frozen_scope():
    from datetime import UTC, datetime
    from app.performance.calibration_service import resolve_calibration, calibration_task_scope
    from app.performance.models import PerformanceNodeTask
    from copy import deepcopy
    config = _calibration_rules("PROJECT_ALL")
    phases = config["node_settings"]["calibration-1"]["calibration"]["phases"]
    phases.append({**deepcopy(phases[0]), "phase_id": "second"})
    resolved = resolve_calibration({"node_id": "calibration-1"}, config, _calibration_people(), ["E1"])
    added = []
    node = SimpleNamespace(id=12, project_id=1, node_type="calibration", config={"calibration": resolved})
    timing = {"phase_times": {phase: {"start_at": "2026-10-01T00:00:00Z", "end_at": "2026-10-05T00:00:00Z"} for phase in ("first", "second")}}
    PerformanceProjectService(SimpleNamespace(add=added.append))._add_calibration_tasks(project(), SimpleNamespace(id=4), node, resolved, timing)
    assert len(added) == 2
    assert all(isinstance(task, PerformanceNodeTask) and calibration_task_scope(task, node) for task in added)
    assert {task.phase_id for task in added} == {"first", "second"}
    assert added[0].due_at == datetime(2026, 10, 5, tzinfo=UTC)
    added[0].project_id = 2
    assert not calibration_task_scope(added[0], node)
    added[0].project_id = 1
    added[0].phase_id = "forged"
    assert not calibration_task_scope(added[0], node)
    added[0].phase_id = "first"
    added[0].target_employee_no = "E3"
    assert not calibration_task_scope(added[0], node)


@pytest.mark.asyncio
async def test_started_calibration_rules_cannot_be_changed(monkeypatch):
    target = project("STARTED")
    target.settings = {"flow_settings": _calibration_rules()}
    async def allow(*args):
        return None
    service = PerformanceProjectService(object())
    monkeypatch.setattr(service, "_validate_manual_opening_policy", allow)
    with pytest.raises(ProjectValidationError, match="不能修改校准规则"):
        await service.update_project(target, {"flow_settings": {"node_settings": {}}}, actor_type="PORTAL_USER", actor_id=1)


@pytest.mark.asyncio
async def test_calibration_preview_denies_other_project(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router
    async def get_project(*args):
        return project()
    monkeypatch.setattr(projects_router, "_get_project", get_project)
    with pytest.raises(HTTPException) as error:
        await projects_router.calibration_preview(1, ProjectPayload(name="项目一"), context(refs=("project:other",)), object())
    assert error.value.status_code == 403


def test_calibration_window_never_uses_other_phase_envelope():
    from datetime import UTC, datetime
    from app.performance.projects_router import _task_window, _self_summary_state
    task = SimpleNamespace(task_kind="calibration", phase_id="first", available_at=datetime(2026, 10, 1, tzinfo=UTC), due_at=datetime(2026, 10, 2, tzinfo=UTC))
    target = project("STARTED")
    target.settings = {"flow_settings": {"node_times": {"calibration-1": {"start_at": "2026-01-01T00:00:00Z", "end_at": "2026-12-31T00:00:00Z"}}}}
    node = SimpleNamespace(node_id="calibration-1", config={})
    assert _task_window(task, node, target) == (task.available_at, task.due_at)
    task.submitted_at = None
    assert _self_summary_state(task, task.available_at, task.due_at, False) == (False, False)


def test_calibration_template_inherits_final_content_and_respects_readonly_fields():
    from app.performance.calibration_service import calibration_template
    from app.performance.self_summary_service import build_self_summary_schema, sanitize_self_summary_answers
    final = {"content": [{"content_id": "notice", "type": "prompt", "prompt": {"title": "终评提示", "content": "请补充事实依据", "color": "#3B82F6", "scope": "all"}, "items": []}, {"content_id": "content", "type": "custom", "items": [{"id": "readonly", "kind": "fill", "questionType": "text", "label": "只读"}, {"id": "editable", "kind": "fill", "questionType": "text", "label": "可改"}]}]}
    node = {"node_id": "calibration-1", "calibration_settings": {"content": {"items": {"readonly": {"allowModify": False}}}}}
    resolved = calibration_template(node, final, [])
    assert resolved["content"][0]["type"] == "prompt"
    assert resolved["content"][0]["prompt"]["content"] == "请补充事实依据"
    schema = build_self_summary_schema(resolved)
    assert schema[0]["fields"][0]["readonly"]
    assert sanitize_self_summary_answers(schema, {"readonly": "forged", "editable": "allowed"}) == {"editable": "allowed"}
    assert "settings" not in final["content"][1]["items"][0]


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_calibration_postgres_preview_start_scope_and_reopen(monkeypatch):
    import os
    from copy import deepcopy
    from datetime import UTC, datetime, timedelta
    from uuid import uuid4
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from app.performance import models, projects_router
    from app.performance.assessment_roles import ASSESSMENT_ROLES
    from app.performance.calibration_service import calibration_task_scope
    from app.core.config import settings

    if not settings.DB_NAME.startswith("pm_calibration_acceptance_"):
        pytest.skip("isolated calibration acceptance database required")
    engine = create_async_engine(settings.db_url_async)
    async with engine.connect() as conn:
        outer = await conn.begin()
        async with AsyncSession(bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            suffix = uuid4().hex[:10]
            now = datetime.now(UTC)
            cycle = models.PerformanceCycle(cycle_ref=f"cal:{suffix}", name="校准验收", period_year=2026, period_type="YEAR", start_at=now-timedelta(days=5), end_at=now+timedelta(days=5), lock_rule="IMMEDIATE", status="LOCKED", created_by_type="PORTAL_USER", created_by_ref="1")
            template = models.PerformanceTemplate(name=f"cal-template:{suffix}", created_by_type="PORTAL_USER", created_by_ref="1")
            snapshot = models.PerformanceAuthorizationSnapshot(cycle_ref=cycle.cycle_ref, status="DRAFT")
            db.add_all([cycle, template, snapshot])
            for code, name, source, _ in ASSESSMENT_ROLES:
                if await db.scalar(select(models.PerformanceRole.id).where(models.PerformanceRole.code == code)) is None:
                    db.add(models.PerformanceRole(code=code, name=name, role_type="ASSESSMENT", is_system=True, is_active=True, member_source=source))
            await db.flush()
            for employee, manager in [("C1", None), ("E1", "C1"), ("E2", None)]:
                db.add(models.PerformanceAuthorizationSnapshotPerson(snapshot_id=snapshot.id, employee_no=employee, display_name=employee, direct_supervisor_employee_no=manager))
            await db.flush()
            snapshot.status = "LOCKED"
            await db.flush()
            nodes = [
                {"node_id": "eval", "node_type": "evaluation", "name": "终评", "order": 1, "executor_label": "实线上级", "executor_types": ["DIRECT_MANAGER"], "include_final_result": True, "content": [{"content_id": "summary", "type": "custom", "items": [{"id": "assessment-text", "kind": "fill", "questionType": "text", "label": "评价"}]}]},
                {"node_id": "calibration-1", "node_type": "calibration", "name": "校准", "order": 2},
                {"node_id": "view", "node_type": "result_view", "name": "结果", "order": 3},
            ]
            db.add(models.PerformanceTemplateWorkflow(template_id=template.id, nodes=nodes))
            flow = _calibration_rules()
            phases = flow["node_settings"]["calibration-1"]["calibration"]["phases"]
            phases.append({**deepcopy(phases[0]), "phase_id": "second"})
            flow["node_settings"]["view"] = {"result_view": {"automatic_enabled": True, "manual_enabled": False, "automatic_rule": "PREVIOUS_AND_START"}}
            flow["node_times"] = {"calibration-1": {"phase_times": {key: {"start_at": (now-timedelta(hours=1)).isoformat(), "end_at": (now+timedelta(hours=1)).isoformat()} for key in ("first", "second")}}}
            target = models.PerformanceProject(project_ref=f"cal-project:{suffix}", cycle_ref=cycle.cycle_ref, name="校准项目", settings={"template_id": template.id, "flow_settings": flow, "evaluator_rules": {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1", "E2"]}]}]}})
            db.add(target)
            await db.flush()
            service = PerformanceProjectService(db)
            preview = await service.calibration_preview(target, {})
            assert preview["calibration-1"]["assigned_count"] == 1
            assert preview["calibration-1"]["unassigned_count"] == 1
            await service.start_project(target, actor_type="PORTAL_USER", actor_id=1)
            tasks = list((await db.execute(select(models.PerformanceNodeTask).where(models.PerformanceNodeTask.project_id == target.id, models.PerformanceNodeTask.task_kind == "calibration"))).scalars().all())
            assert len(tasks) == 2
            assert {task.phase_id for task in tasks} == {"first", "second"}
            node = await db.get(models.PerformanceProjectNodeSnapshot, tasks[0].node_snapshot_id)
            assert all(calibration_task_scope(task, node) for task in tasks)
            assert all(task.target_employee_no == "E1" and task.handler_ref == "C1" for task in tasks)
            from alembic.migration import MigrationContext
            from alembic.operations import Operations
            from importlib.util import spec_from_file_location, module_from_spec
            from pathlib import Path
            spec = spec_from_file_location("calibration_phase_migration", Path(__file__).parents[1] / "alembic/versions/0274_performance_calibration_task_phase.py")
            migration = module_from_spec(spec)
            spec.loader.exec_module(migration)
            def downgrade_with_existing_phases(connection):
                with Operations.context(MigrationContext.configure(connection.connection())):
                    migration.downgrade()
            with pytest.raises(RuntimeError, match="禁止降级"):
                await db.run_sync(downgrade_with_existing_phases)
            assert await service.calibration_preview(target, {}) == preview
            async def trusted(*args, **kwargs):
                return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="C1")
            monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", trusted)
            own, _ = await projects_router._self_summary_task(tasks[0].id, context(), db, "evaluation")
            assert own.id == tasks[0].id
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as cross_employee:
                await projects_router._self_summary_task(tasks[0].id, context(), db, "evaluation", "E2")
            assert cross_employee.value.status_code == 404
            async def outsider(*args, **kwargs):
                return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="OTHER")
            monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", outsider)
            with pytest.raises(HTTPException) as denied:
                await projects_router._self_summary_task(tasks[0].id, context(), db, "evaluation")
            assert denied.value.status_code == 404
            count = await db.scalar(select(models.PerformanceAuditEvent.id).where(models.PerformanceAuditEvent.event_type == "PERFORMANCE_PROJECT_STARTED", models.PerformanceAuditEvent.subject_ref == target.project_ref))
            assert count is not None
            from fastapi import FastAPI
            from httpx import ASGITransport, AsyncClient
            from app.core.db import get_session
            from app.performance.auth_context import get_performance_access_context
            app = FastAPI()
            app.include_router(projects_router.router, prefix="/api/v1")
            app.dependency_overrides[get_session] = lambda: db
            app.dependency_overrides[get_performance_access_context] = lambda: context("performance.cycles.manage")
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://calibration.test") as client:
                response = await client.post(f"/api/v1/performance/projects/{target.id}/calibration-preview", json={"name": target.name})
                assert response.status_code == 200, response.text
                assert response.json()["calibration-1"]["assigned_count"] == 1
                response = await client.get(f"/api/v1/performance/projects/{target.id}")
                assert response.status_code == 200, response.text
                assert response.json()["flow_settings"]["node_settings"]["calibration-1"]["calibration"]["phases"][1]["phase_id"] == "second"
                response = await client.get(f"/api/v1/performance/tasks/{tasks[0].id}/template-task")
                assert response.status_code == 404
                monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", trusted)
                response = await client.get(f"/api/v1/performance/tasks/{tasks[0].id}/template-task")
                assert response.status_code == 200, response.text
                assert response.json()["task_kind"] == "calibration"
                response = await client.patch(f"/api/v1/performance/tasks/{tasks[0].id}/template-task/draft", json={"answers": {"assessment-text": "校准调整内容"}, "version": tasks[0].answer_version})
                assert response.status_code == 200, response.text
                stored = await db.get(models.PerformanceNodeTask, tasks[0].id)
                assert stored.answers["assessment-text"] == "校准调整内容"
                audit = await db.scalar(select(models.PerformanceAuditEvent.id).where(models.PerformanceAuditEvent.event_type == "CALIBRATION_DRAFT_SAVED", models.PerformanceAuditEvent.subject_ref == str(stored.id)))
                assert audit is not None
                app.dependency_overrides[get_performance_access_context] = lambda: context(refs=("project:other",))
                response = await client.post(f"/api/v1/performance/projects/{target.id}/calibration-preview", json={"name": target.name})
                assert response.status_code == 403
        await outer.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_project_calibration_authorization_never_falls_back_to_cycle_scope():
    from app.performance.authorization_service import ObjectAuthorizationRequest, PerformanceObjectAuthorizationService, PerformanceObjectAuthorizationDenied
    request = ObjectAuthorizationRequest(cycle_ref="cycle:one", employee_no="E1", actor_type="EMPLOYEE", actor_ref="C1", action="CALIBRATE", cycle_status="ACTIVE", node_status="OPEN", record_status="DRAFT", project_id=1, node_id="calibration-1")
    with pytest.raises(PerformanceObjectAuthorizationDenied, match="阶段范围"):
        await PerformanceObjectAuthorizationService(object())._authorize_project_calibration(request)
    from app.performance.feature_authorization import _with_action
    from dataclasses import replace
    request = replace(request, phase_id="first")
    forwarded = _with_action(request, "CALIBRATE")
    assert (forwarded.project_id, forwarded.node_id, forwarded.phase_id) == (1, "calibration-1", "first")


@pytest.mark.asyncio
async def test_project_template_requires_cycle_membership_and_active_status():
    class Db:
        async def scalar(self, _statement):
            return SimpleNamespace(template_ids=[11, 12])

        async def get(self, _model, key):
            return SimpleNamespace(template_kind="performance", status="active" if key == 11 else "inactive")

    service = PerformanceProjectService(Db())
    await service.validate_template("cycle:one", 11)
    with pytest.raises(ProjectValidationError, match="当前绩效周期"):
        await service.validate_template("cycle:one", 99)
    with pytest.raises(ProjectValidationError, match="已启用"):
        await service.validate_template("cycle:one", 12)


@pytest.mark.asyncio
async def test_project_template_candidates_scope_and_order(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router
    cycle = SimpleNamespace(cycle_ref="cycle:one", template_ids=[12, 11])
    async def get_cycle(*_args):
        return cycle
    monkeypatch.setattr(projects_router, "_get_cycle", get_cycle)

    class Db:
        async def scalar(self, _statement):
            return 1

        async def execute(self, _statement):
            rows = [SimpleNamespace(id=key, name=f"模板{key}", description="描述", status="active") for key in [11, 12]]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

    allowed = await projects_router.project_templates(1, context("performance.cycles.manage"), Db())
    assert [row["template_id"] for row in allowed] == [12, 11]
    allowed = await projects_router.project_templates(1, context("performance.projects.manage", refs=("project:one",)), Db())
    assert len(allowed) == 2
    for actor in [context(), context("performance.projects.manage")]:
        with pytest.raises(HTTPException) as error:
            await projects_router.project_templates(1, actor, Db())
        assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_project_template_workflow_returns_distribution_assessment_options(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceTemplate, PerformanceTemplateWorkflow
    cycle = SimpleNamespace(cycle_ref="cycle:one", template_ids=[11])
    nodes = [{"node_id": "final", "node_type": "evaluation", "include_final_result": True, "content_bindings": {"fill": ["rating"]}}]
    workflow = SimpleNamespace(nodes=nodes, content_library=[{
        "content_id": "rating", "type": "rating", "name": "评级内容", "description": "最终等级",
        "items": [{"id": "grade", "label": "绩效等级"}], "options": [{"id": "level-a", "code": "A", "label": "优秀"}, {"id": "level-b", "code": "B", "label": "良好"}],
    }])
    async def get_cycle(*_args): return cycle
    async def get_nodes(*_args): return nodes, 0, 0
    monkeypatch.setattr(projects_router, "_get_cycle", get_cycle)
    monkeypatch.setattr("app.performance.template_workflow_service.PerformanceTemplateWorkflowService.get_nodes", get_nodes)
    class Db:
        async def get(self, model, _key):
            if model is PerformanceTemplate: return SimpleNamespace(template_kind="performance")
            if model is PerformanceTemplateWorkflow: return workflow
            return None
    result = await projects_router.project_template_workflow(1, 11, context("performance.cycles.manage"), Db())
    assert result["distribution_assessment_options"] == [{"id": "grade", "label": "绩效等级", "description": "最终等级", "grade_options": [{"value": "A", "label": "A", "legacy_value": "level-a"}, {"value": "B", "label": "B", "legacy_value": "level-b"}]}]


@pytest.mark.asyncio
async def test_started_project_cannot_change_template():
    target = project(status="STARTED")
    target.settings["template_id"] = 11
    with pytest.raises(ProjectValidationError, match="已启动项目不能更换"):
        await PerformanceProjectService(SimpleNamespace()).update_project(target, {"name": target.name, "template_id": 12}, actor_type="PORTAL_USER", actor_id=1)


@pytest.mark.asyncio
async def test_cycle_templates_isolated_postgres_migration_api_round_trip():
    import os
    if os.getenv("RUN_PERFORMANCE_DB_TEST") != "1":
        pytest.skip("需显式启用本地隔离数据库验收")
    from uuid import uuid4
    import importlib.util
    from pathlib import Path
    import httpx
    from fastapi import FastAPI
    from sqlalchemy import text, select
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.performance import projects_router, cycles_router
    from app.performance.models import PerformanceAuditEvent, PerformanceProject, PerformanceTemplate

    assert make_url(settings.db_url_async).host in {"localhost", "127.0.0.1"}
    schema = f"pm_template_{uuid4().hex}"
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
    migration_path = Path(__file__).resolve().parents[1] / "alembic/versions/0275_performance_cycle_templates.py"
    spec = importlib.util.spec_from_file_location("cycle_templates_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            tables = (await connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'performance_%'"))).scalars().all()
            for table in tables:
                await connection.execute(text(f'CREATE TABLE "{schema}"."{table}" (LIKE public."{table}" INCLUDING ALL)'))
            serial_columns = (await connection.execute(text("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=:schema AND column_default LIKE 'nextval(%'"), {"schema": schema})).all()
            for index, (table, column) in enumerate(serial_columns):
                sequence = f'"{schema}"."fixture_seq_{index}"'
                await connection.execute(text(f'CREATE SEQUENCE {sequence}'))
                await connection.execute(text(f"ALTER TABLE \"{schema}\".\"{table}\" ALTER COLUMN \"{column}\" SET DEFAULT nextval('{sequence}')"))
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
            existing = (await connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_schema=:schema AND table_name='performance_cycles'"), {"schema": schema})).scalars().all()
            if "template_ids" in existing:
                await connection.execute(text("ALTER TABLE performance_cycles DROP COLUMN template_ids"))
            def apply(sync, method):
                with Operations.context(MigrationContext.configure(sync)):
                    getattr(migration, method)()
            await connection.run_sync(lambda sync: apply(sync, "upgrade"))
            await connection.run_sync(lambda sync: apply(sync, "downgrade"))
            await connection.execute(text("INSERT INTO performance_cycles (id,cycle_ref,name,language,period_year,period_type,template_id,start_at,end_at,lock_rule,pre_lock_sync_mode,leaver_enabled,leaver_participation_mode,status,created_by_type,created_by_ref) VALUES (910001,'cycle:templates','模板验收','zh-CN',2026,'CUSTOM',910011,'2026-01-01T00:00:00Z','2026-12-31T00:00:00Z','IMMEDIATE','MANUAL',false,'CREATE_TASK','DRAFT','PORTAL_USER','1')"))
            await connection.run_sync(lambda sync: apply(sync, "upgrade"))
            assert (await connection.execute(text("SELECT template_ids FROM performance_cycles WHERE id=910001"))).scalar_one() == [910011]
            await connection.execute(text("UPDATE performance_cycles SET template_ids='[910011,910012]'::jsonb"))
            with pytest.raises(RuntimeError, match="多模板"):
                await connection.run_sync(lambda sync: apply(sync, "downgrade"))
            await connection.execute(text("UPDATE performance_cycles SET template_ids='[910011]'::jsonb"))
            await connection.run_sync(lambda sync: apply(sync, "downgrade"))
            await connection.run_sync(lambda sync: apply(sync, "upgrade"))
            session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
            try:
                for key in [910011, 910012, 910099]:
                    session.add(PerformanceTemplate(id=key, name=f"模板{key}", description="验收描述", template_kind="performance", status="active", created_by_type="PORTAL_USER", created_by_ref="1"))
                target = PerformanceProject(id=910002, project_ref="project:templates", cycle_ref="cycle:templates", name="新疆项目", status="DRAFT", administrators=[], settings={"template_id": 910011})
                session.add(target)
                await session.commit()
                app = FastAPI()
                app.include_router(cycles_router.router, prefix="/api/v1")
                app.include_router(projects_router.router, prefix="/api/v1")
                app.dependency_overrides[projects_router.get_session] = lambda: session
                app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    response = await client.patch("/api/v1/performance/cycles/910001", json={"template_ids": [910011, 910012, 910011]})
                    assert response.status_code == 200, response.text
                    assert response.json()["template_ids"] == [910011, 910012]
                    assert (await client.get("/api/v1/performance/cycles/910001")).json()["template_ids"] == [910011, 910012]
                    url = "/api/v1/performance/cycles/910001/project-templates"
                    assert [row["template_id"] for row in (await client.get(url)).json()] == [910011, 910012]
                    assert (await client.get(url + "/910011/workflow")).status_code == 200
                    assert (await client.get(url + "/910099/workflow")).status_code == 422
                    project_url = "/api/v1/performance/projects/910002"
                    assert (await client.patch(project_url, json={"name": "新疆项目", "template_id": 910012})).status_code == 200
                    session.expunge_all()
                    assert (await session.scalar(select(PerformanceProject.settings).where(PerformanceProject.id == 910002)))["template_id"] == 910012
                    assert (await client.get(project_url)).json()["template_id"] == 910012
                    assert (await client.patch(project_url, json={"name": "新疆项目", "template_id": 910099})).status_code == 422
                    assert (await client.patch("/api/v1/performance/cycles/910001", json={"template_ids": [910011]})).status_code == 422
                    assert (await client.get(project_url)).json()["template_id"] == 910012
                    audit = (await session.execute(select(PerformanceAuditEvent).where(PerformanceAuditEvent.event_type == "PERFORMANCE_CYCLE_UPDATED"))).scalars().first()
                    assert audit.after_state["template_ids"] == [910011, 910012]
                    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.projects.manage", refs=("project:templates",))
                    assert (await client.get(url)).status_code == 200
                    assert (await client.get(url + "/910012/workflow")).status_code == 200
                    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.projects.manage", refs=("project:elsewhere",))
                    assert (await client.get(url)).status_code == 403
                    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
                    assert (await client.get(url)).status_code == 403
                    assert (await client.get(url + "/910012/workflow")).status_code == 403
                    assert (await client.patch(project_url, json={"name": "拒绝"})).status_code == 403
            finally:
                await session.close()
        finally:
            await transaction.rollback()
        assert (await connection.execute(text("SELECT 1 FROM pg_namespace WHERE nspname=:schema"), {"schema": schema})).first() is None
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("selected,expected", [(["PROJECT_ADMIN"], True), (["PROJECT_ADMIN", "HRBP"], True), (["HRBP"], False), ([], False)])
async def test_project_data_manager_selection_uses_project_administrators(statistics_db, selected, expected):
    from fastapi import HTTPException
    from app.performance.projects_router import _project_data_scope

    target = statistics_db.projects[0]
    target.settings["data_managers"] = selected
    if expected:
        assert await _project_data_scope(context(), target, statistics_db, "performance.frontend.data-view") is None
        target.administrators = []
    with pytest.raises(HTTPException) as error:
        await _project_data_scope(context("performance.projects.manage", refs=(target.project_ref,)), target, statistics_db, "performance.frontend.data-view")
    assert error.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["inactive", "function", "custom"])
async def test_project_data_manager_role_config_is_enforced_per_request(statistics_db, change):
    from fastapi import HTTPException
    from app.performance.projects_router import _project_data_scope

    target = statistics_db.projects[0]
    assert await _project_data_scope(context(), target, statistics_db, "performance.frontend.data-view") is None
    if change == "inactive":
        statistics_db.roles[0].is_active = False
    elif change == "function":
        statistics_db.roles[0].function_permission_keys = ["performance.frontend.progress"]
        assert await _project_data_scope(context(), target, statistics_db, "performance.frontend.progress") is None
    else:
        statistics_db.roles[0].code = "custom.same-name"
    with pytest.raises(HTTPException) as error:
        await _project_data_scope(context(), target, statistics_db, "performance.frontend.data-view")
    assert error.value.status_code == 403


def _configure_data_manager_hrbp(db):
    db.projects[0].administrators = []
    db.projects[0].settings["data_managers"] = ["HRBP"]
    db.hrbp_permissions = [SimpleNamespace(cycle_ref="cycle:1", hrbp_employee_no="MANAGER", scope=["集团/研发"], invisible_people=["HIDDEN"])]
    db.members = [_statistics_member(no) for no in ["VISIBLE", "CHILD", "HIDDEN", "SIBLING", "PARENT"]]
    for member, org in zip(db.members, ["集团/研发", "集团/研发/平台", "集团/研发", "集团/研发二部", "集团"]):
        member.organization_ref = org
    db.tasks = [_statistics_task(member.employee_no, task_id=100+i) for i, member in enumerate(db.members)]


@pytest.mark.asyncio
async def test_project_data_manager_hrbp_uses_cycle_scope_and_hidden_people(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import _project_data_scope

    db = statistics_db
    _configure_data_manager_hrbp(db)
    target = db.projects[0]
    target.settings.pop("data_managers")
    db.members.append(SimpleNamespace(employee_no="OLD", snapshot_id=20, organization_ref="集团/研发"))
    assert await _project_data_scope(context(), target, db, "performance.frontend.data-view") == {"VISIBLE", "CHILD"}
    target.settings["data_managers"] = ["PROJECT_ADMIN"]
    with pytest.raises(HTTPException):
        await _project_data_scope(context(), target, db, "performance.frontend.data-view")
    target.settings["data_managers"] = ["HRBP"]
    db.hrbp_permissions[0].cycle_ref = "cycle:other"
    with pytest.raises(HTTPException):
        await _project_data_scope(context(), target, db, "performance.frontend.data-view")
    db.hrbp_permissions[0].cycle_ref = "cycle:1"
    db.hrbp_permissions[0].invisible_people += ["VISIBLE", "CHILD"]
    with pytest.raises(HTTPException):
        await _project_data_scope(context(), target, db, "performance.frontend.data-view")


@pytest.mark.asyncio
async def test_project_data_manager_hrbp_does_not_accept_unmapped_portal_id(statistics_db, monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    _configure_data_manager_hrbp(statistics_db)
    async def actor(*args, **kwargs):
        return SimpleNamespace(actor_type="PORTAL_USER", actor_ref="MANAGER")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    with pytest.raises(HTTPException):
        await projects_router._project_data_scope(context(), statistics_db.projects[0], statistics_db, "performance.frontend.data-view")


@pytest.mark.asyncio
async def test_project_data_manager_dual_identity_combines_eligible_sources(statistics_db):
    from app.performance.projects_router import _project_data_scope

    _configure_data_manager_hrbp(statistics_db)
    target = statistics_db.projects[0]
    target.settings["data_managers"] = ["HRBP", "PROJECT_ADMIN"]
    target.administrators = ["管理员"]
    assert await _project_data_scope(context(), target, statistics_db, "performance.frontend.data-view") is None
    statistics_db.roles[0].is_active = False
    assert await _project_data_scope(context(), target, statistics_db, "performance.frontend.data-view") == {"VISIBLE", "CHILD"}


@pytest.mark.asyncio
async def test_project_data_manager_hrbp_statistics_and_matrix_share_visible_counts(statistics_db):
    from app.performance.projects_router import project_management_statistics, project_matrix

    _configure_data_manager_hrbp(statistics_db)
    report = await project_management_statistics(1, "level", context(), statistics_db)
    matrix = await project_matrix(1, context(), statistics_db)
    assert report.totalParticipants == matrix.total == 2
    assert report.distribution == {"one": 0, "five": 2}
    names = [person.employee_no for row in matrix.completed_rows for cell in row.cells.values() for person in cell.people]
    assert set(names) == {"VISIBLE", "CHILD"}


@pytest.mark.asyncio
async def test_project_data_manager_scope_filters_progress_before_counting(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceResultOpening

    node = SimpleNamespace(id=31, node_id="review", node_type="evaluation", config={"template": {"executor_types": ["SUBJECT"]}})
    values = {
        PerformanceProjectMember: [SimpleNamespace(employee_no=no) for no in ["VISIBLE", "HIDDEN"]],
        PerformanceProjectNodeSnapshot: [node],
        PerformanceNodeTask: [SimpleNamespace(node_snapshot_id=31, target_employee_no="VISIBLE", status="pending", submitted_at=None), SimpleNamespace(node_snapshot_id=31, target_employee_no="HIDDEN", status="completed", submitted_at=True)],
        PerformanceResultOpening: [],
    }
    class Db:
        async def scalar(self, query):
            return 21
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values[query.column_descriptions[0]["entity"]]))
    result = await projects_router._project_completion_nodes([_pm_project(1, "项目", 1)], Db(), scopes={1: {"VISIBLE"}})
    review = next(item for item in result if item["key"] == "self-review")
    assert (review["total_count"], review["completed_count"], review["completion_rate"]) == (1, 0, 0)


@pytest.mark.asyncio
async def test_project_data_managers_isolated_postgres_api_scope_and_revocation(monkeypatch):
    import os
    if os.getenv("RUN_PERFORMANCE_DB_TEST") != "1":
        pytest.skip("需显式启用本地隔离数据库验收")
    from datetime import UTC, datetime
    from uuid import uuid4
    import httpx
    from fastapi import FastAPI
    from sqlalchemy import text, select
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool
    from app.performance import projects_router
    from app.performance.models import PerformanceRole, PerformanceProject, PerformanceCycle, PerformanceHrbpPermission, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceProjectMemberSnapshot, PerformanceProjectMember

    assert make_url(settings.db_url_async).host in {"localhost", "127.0.0.1"}
    monkeypatch.setattr(settings, "APP_ENV", "prod")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", False)
    schema = f"pm_data_managers_{uuid4().hex}"
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                tables = (await connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'performance_%'"))).scalars().all()
                for table in tables:
                    await connection.execute(text(f'CREATE TABLE "{schema}"."{table}" (LIKE public."{table}" INCLUDING ALL)'))
                serial_columns = (await connection.execute(text("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=:schema AND column_default LIKE 'nextval(%'"), {"schema": schema})).all()
                for index, (table, column) in enumerate(serial_columns):
                    sequence = f'"{schema}"."fixture_seq_{index}"'
                    await connection.execute(text(f'CREATE SEQUENCE {sequence}'))
                    await connection.execute(text(f"ALTER TABLE \"{schema}\".\"{table}\" ALTER COLUMN \"{column}\" SET DEFAULT nextval('{sequence}')"))
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                await connection.execute(text("ALTER TABLE performance_cycles ADD COLUMN IF NOT EXISTS template_ids JSONB NOT NULL DEFAULT '[]'"))
                await connection.execute(text("ALTER TABLE performance_node_tasks ADD COLUMN IF NOT EXISTS phase_id VARCHAR(96) NOT NULL DEFAULT ''"))
                session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
                try:
                    session.add(PerformanceCycle(id=901, cycle_ref="cycle:data", name="权限隔离验收", period_year=2026, period_type="CUSTOM", start_at=datetime(2026,1,1,tzinfo=UTC), end_at=datetime(2026,12,31,tzinfo=UTC), lock_rule="IMMEDIATE", created_by_type="PORTAL_USER", created_by_ref="1"))
                    session.add(PerformanceAuthorizationSnapshot(id=902, cycle_ref="cycle:data", status="LOCKED"))
                    session.add(PerformanceAuthorizationSnapshotPerson(id=903, snapshot_id=902, employee_no="HRBP1", portal_user_id=1, display_name="HRBP本人"))
                    for i, code in enumerate(["performance.project_admin", "performance.hrbp"]):
                        session.add(PerformanceRole(id=910+i, code=code, name="项目管理员" if i == 0 else "HRBP", role_type="MANAGEMENT", is_active=True, is_system=True, function_permission_keys=["performance.frontend.progress", "performance.frontend.data-view"]))
                    session.add(PerformanceProject(id=920, project_ref="project:data", cycle_ref="cycle:data", name="权限测试项目", status="STARTED", administrators=["管理员"], settings={"data_managers": ["PROJECT_ADMIN", "HRBP"]}))
                    session.add(PerformanceProjectMemberSnapshot(id=930, project_id=920, cycle_ref="cycle:data", snapshot_version=1, source_snapshot_id=902))
                    session.add(PerformanceProjectMember(id=940, snapshot_id=930, employee_no="OLD", display_name="旧快照", organization_ref="集团/研发"))
                    session.add(PerformanceProjectMemberSnapshot(id=931, project_id=920, cycle_ref="cycle:data", snapshot_version=2, source_snapshot_id=902))
                    for i, (no, org) in enumerate([("VISIBLE", "集团/研发"), ("CHILD", "集团/研发/平台"), ("HIDDEN", "集团/研发"), ("OUTSIDE", "集团/研发二部")]):
                        session.add(PerformanceProjectMember(id=950+i, snapshot_id=931, employee_no=no, display_name=no, organization_ref=org, position_level="J6", hire_date=datetime(2020,1,1).date()))
                    session.add(PerformanceHrbpPermission(id=960, cycle_ref="cycle:data", hrbp_employee_no="HRBP1", scope=["集团/研发"], invisible_people=["HIDDEN"]))
                    await session.commit()
                    app = FastAPI()
                    app.include_router(projects_router.router, prefix="/api/v1")
                    app.dependency_overrides[projects_router.get_session] = lambda: session
                    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                        members_url = "/api/v1/performance/projects/920/members"
                        matrix_url = "/api/v1/performance/projects/920/matrix"
                        report_url = "/api/v1/performance/project-management/statistics?cycle_id=901"
                        overview_url = "/api/v1/performance/project-management/overview"
                        response = await client.get(members_url)
                        assert response.status_code == 200, response.text
                        assert response.json()["total"] == 4
                        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
                        response = await client.get(members_url)
                        assert "direct_supervisor" in response.json()["items"][0]["visible_profile_fields"]
                        assert response.json()["items"][0]["hire_date"] == "2020-01-01"
                        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
                        assert (await client.get(matrix_url)).json()["total"] == 4
                        assert (await client.get(report_url)).json()["totalParticipants"] == 4
                        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
                        response = await client.patch("/api/v1/performance/projects/920", json={"name": "权限测试项目", "data_managers": ["HRBP"]})
                        assert response.status_code == 200, response.text
                        session.expunge_all()
                        assert (await session.scalar(select(PerformanceProject.settings).where(PerformanceProject.id == 920)))["data_managers"] == ["HRBP"]
                        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
                        response = await client.get(members_url + "?page_size=1")
                        assert response.status_code == 200, response.text
                        assert response.json()["total"] == 2
                        assert len(response.json()["items"]) == 1
                        assert (await client.get(matrix_url)).json()["total"] == 2
                        assert (await client.get(report_url)).json()["totalParticipants"] == 2
                        assert (await client.get(overview_url)).json()["projects"][0]["project_id"] == 920
                        role = await session.get(PerformanceRole, 911)
                        role.function_permission_keys = ["performance.frontend.progress"]
                        await session.commit()
                        assert (await client.get(members_url)).status_code == 403
                        assert (await client.get(matrix_url)).status_code == 403
                        assert (await client.get(report_url)).status_code == 404
                        assert (await client.get(overview_url)).json()["projects"]
                        role.function_permission_keys = ["performance.frontend.data-view"]
                        await session.commit()
                        overview = (await client.get(overview_url)).json()
                        assert overview["projects"][0]["project_id"] == 920
                        assert overview["completion_nodes"] == []
                        assert (await client.get(members_url)).json()["total"] == 2
                        role.is_active = False
                        await session.commit()
                        assert (await client.get(overview_url)).json()["projects"] == []
                        role.is_active = True
                        role.function_permission_keys = ["performance.frontend.progress", "performance.frontend.data-view"]
                        permission = await session.get(PerformanceHrbpPermission, 960)
                        permission.scope = ["其他部门"]
                        await session.commit()
                        assert (await client.get(members_url)).status_code == 403
                        assert (await client.get(overview_url)).json()["projects"] == []
                        permission.scope = ["集团/研发"]
                        await session.commit()
                        assert (await client.get(members_url)).json()["total"] == 2
                        await session.delete(permission)
                        await session.commit()
                        assert (await client.get(members_url)).status_code == 403
                finally:
                    await session.close()
            finally:
                await transaction.rollback()
            assert (await connection.execute(text("SELECT 1 FROM pg_namespace WHERE nspname=:schema"), {"schema": schema})).first() is None
    finally:
        await engine.dispose()
