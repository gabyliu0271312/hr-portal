from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.performance.projects_router import ProjectPayload, _can_manage_project, _review_node_category, _review_node_status
from app.performance.models import PerformanceOtherPermissionSetting
from app.performance.auth_context import PerformanceAccessContext, PerformanceRoleGrant, performance_admin_preview_enabled
from app.performance.project_service import PerformanceProjectService, ProjectValidationError, _parse_time


def test_reconsideration_handlers_merge_roles_without_duplicate_tasks():
    from app.performance.reconsideration_service import resolve_handlers
    member = SimpleNamespace(employee_no="E1", direct_supervisor_employee_no="M1", hrbp_employee_no="H1")
    manager = SimpleNamespace(employee_no="M1", direct_supervisor_employee_no=None)
    template = {"executor_config": {"mode": "MULTI_ROLE", "roles": [
        {"type": "HRBP"}, {"type": "REAL_LINE_MANAGER", "levels": ["DIRECT_MANAGER"]},
        {"type": "SPECIFIED_PERSON", "people": [{"employee_no": "H1", "display_name": "HR"}, {"employee_no": "P1", "display_name": "指定处理人"}]},
    ]}}
    assert resolve_handlers(template, member, {"M1": manager}) == ["H1", "M1", "P1"]
    missing_hrbp = {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}}
    assert resolve_handlers(missing_hrbp, SimpleNamespace(employee_no="E1", direct_supervisor_employee_no=None, hrbp_employee_no=None), {"F1": SimpleNamespace(employee_no="F1")}, ["F1"]) == ["F1"]
    partial = {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}, {"type": "REAL_LINE_MANAGER", "levels": ["DIRECT_MANAGER"]}]}}
    assert resolve_handlers(partial, SimpleNamespace(employee_no="E1", direct_supervisor_employee_no="M1", hrbp_employee_no=None), {"M1": manager}, ["F1"]) == ["M1"]


def test_reconsideration_fallback_people_round_trip_and_legacy_handler_compatibility():
    flow = {"node_settings": {"reconsideration-1": {"result_reconsideration": {"handler_employee_nos": ["E1", "E1", "E2"]}}}}
    normalized = PerformanceProjectService._validate_flow_settings(flow)
    assert normalized["node_settings"]["reconsideration-1"]["result_reconsideration"] == {"handler_employee_nos": ["E1", "E2"]}
    legacy = {"node_settings": {"reconsideration-1": {"result_reconsideration": {"handler": "E1"}}}}
    assert PerformanceProjectService._validate_flow_settings(legacy)["node_settings"]["reconsideration-1"]["result_reconsideration"] == {"handler_employee_nos": ["E1"]}


@pytest.mark.asyncio
async def test_reconsideration_submission_creates_tasks_and_durable_notifications_once(monkeypatch):
    from datetime import UTC, datetime, timedelta
    from fastapi import HTTPException
    from app.performance import reconsideration_service as service
    from app.performance.models import PerformanceNodeTask, PerformanceReconsiderationNotification, PerformanceResultReconsideration
    project_row = SimpleNamespace(id=1, cycle_ref="cycle:one", settings={"flow_settings": {"node_settings": {"appeal": {"result_reconsideration": {"handler_employee_nos": ["P1", "P2"]}}}}})
    node = SimpleNamespace(id=4, node_id="appeal", config={"time": {"appeal_deadline": (datetime.now(UTC) + timedelta(days=1)).isoformat()}, "template": {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}}})
    values = [project_row, SimpleNamespace(id=2, source_snapshot_id=3), SimpleNamespace(employee_no="E1"), SimpleNamespace(result_version={"v": 2}), node, None]
    async def submission(*args, **kwargs):
        assert kwargs.get("lock") is True
        return values
    async def tasks(*args):
        return []
    monkeypatch.setattr(service, "submission_context", submission)
    from unittest.mock import AsyncMock
    monkeypatch.setattr(service, "freeze_published_result", AsyncMock(return_value=({"task_versions": {"v": 2}}, 2)))
    monkeypatch.setattr(service, "reconsideration_tasks", tasks)
    class Db:
        def __init__(self):
            self.rows = []
            self.commits = 0
            self.people = [SimpleNamespace(employee_no="P1"), SimpleNamespace(employee_no="P2")]
        def add(self, row):
            row.id = len(self.rows) + 1
            self.rows.append(row)
        async def flush(self):
            pass
        async def execute(self, statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self.people))
        async def commit(self):
            self.commits += 1
    db = Db()
    actor = SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1")
    result = await service.submit_reconsideration(db, 1, "E1", "核对事实", actor)
    assert result["task_count"] == 2
    assert db.commits == 1
    assert len([row for row in db.rows if isinstance(row, PerformanceNodeTask)]) == 2
    assert len([row for row in db.rows if isinstance(row, PerformanceReconsiderationNotification)]) == 2
    appeal = next(row for row in db.rows if isinstance(row, PerformanceResultReconsideration))
    assert appeal.reason == "核对事实" and appeal.result_version == {"v": 2}
    values[-1] = appeal
    with pytest.raises(HTTPException) as error:
        await service.submit_reconsideration(db, 1, "E1", "重复", actor)
    assert error.value.detail == "RECONSIDERATION_ALREADY_SUBMITTED"
    assert db.commits == 1
    values[-1] = None
    node.config["time"]["appeal_deadline"] = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    with pytest.raises(HTTPException) as error:
        await service.submit_reconsideration(db, 1, "E1", "过期", actor)
    assert error.value.detail == "RECONSIDERATION_WINDOW_CLOSED"


@pytest.mark.asyncio
async def test_reconsideration_notification_failure_retries_same_task(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import reconsideration_service as service
    from app.performance.models import PerformanceNodeTask, PerformanceProject
    from app.integrations.feishu import notification_service
    row = SimpleNamespace(id=1, task_id=5, status="pending", attempts=0, last_error=None, next_retry_at=datetime.now(UTC))
    task = SimpleNamespace(id=5, project_id=1, handler_ref="P1", status="pending", revoked_at=None)
    class Savepoint:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return False
    class Db:
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [row]))
        def begin_nested(self):
            return Savepoint()
        async def get(self, model, key):
            if model is PerformanceNodeTask:
                return task
            if model is PerformanceProject:
                return SimpleNamespace(id=1, name="项目", status="STARTED")
            return None
        async def refresh(self, row):
            pass
        async def scalar(self, query):
            if "performance_projects" in str(query):
                return SimpleNamespace(id=1, name="项目", status="STARTED")
            return SimpleNamespace(id=9, feishu_user_id="ou_1")
    async def appeal(*args):
        return SimpleNamespace(id=2)
    deliveries = []
    async def send(*args, **kwargs):
        deliveries.append(kwargs["biz_id"])
        if len(deliveries) == 1:
            raise RuntimeError("飞书暂时不可用")
        return SimpleNamespace(status="success", success_count=1, errors=[])
    monkeypatch.setattr(service, "reconsideration_for_task", appeal)
    monkeypatch.setattr(notification_service, "send_notification", send)
    await service.dispatch_notifications(Db())
    assert row.status == "retrying" and row.attempts == 1
    assert row.next_retry_at > datetime.now(UTC)
    row.next_retry_at = datetime.now(UTC)
    await service.dispatch_notifications(Db())
    assert row.status == "sent" and row.last_error is None
    assert deliveries == ["5", "5"]


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


def test_audience_adjustment_uses_union_and_excludes_every_branch():
    rules = {"groups": [{"conditions": [{"field": "department", "operator": "include", "values": ["研发"]}]}, {"conditions": [{"field": "employee", "operator": "include", "values": ["E2"]}]}]}
    people = [SimpleNamespace(employee_no=no, department=department) for no, department in [("E1", "研发"), ("E2", "销售"), ("E3", "销售"), ("E4", "其他")]]
    added = PerformanceProjectService.adjust_evaluator_rules(rules, include=["E3"])
    removed = PerformanceProjectService.adjust_evaluator_rules(added, exclude=["E1", "E3"])
    assert len(rules["groups"]) == 2
    assert {p.employee_no for p in PerformanceProjectService._matching_people(people, {"evaluator_rules": added})} == {"E1", "E2", "E3"}
    assert {p.employee_no for p in PerformanceProjectService._matching_people(people, {"evaluator_rules": removed})} == {"E2"}


@pytest.mark.parametrize("state", ["STARTED", "ARCHIVED"])
@pytest.mark.parametrize("field,value", [("evaluator_rules", {"groups": []}), ("scope_rules", {"groups": [{"conditions": []}]}), ("scope_limited", True), ("scope_employee_nos", ["E2"])])
def test_started_audience_patch_locked(state, field, value):
    from app.performance.calibration_service import CalibrationConflict
    target = project(state)
    target.settings["evaluator_rules"] = {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]}
    with pytest.raises(CalibrationConflict) as exc:
        PerformanceProjectService.validate_audience_change(target, {field: value})
    assert exc.value.code == "PROJECT_AUDIENCE_LOCKED"
    PerformanceProjectService.validate_audience_change(target, {"evaluator_rules": target.settings["evaluator_rules"]})
    PerformanceProjectService.validate_audience_change(target, {"name": "新名称"})


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["STARTED", "ARCHIVED"])
async def test_started_preview_uses_actual_members_not_posted_rules(monkeypatch, state):
    from app.performance import projects_router as routes
    target = project(state)
    target.settings["evaluator_rules"] = {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]}
    person = SimpleNamespace(employee_no="E1", display_name="员工一", direct_supervisor_source_value=None, company_org=None, department=None, department_2=None, department_3=None, job_family=None, job_category=None, standard_position=None, employment_status="在职")
    async def audience(self, project, *, group_index=None): return [person], [person], []
    async def unexpected(*args, **kwargs): raise AssertionError("启动后不得按客户端规则重算成员")
    monkeypatch.setattr(routes, "_get_cycle", lambda *args: _resolved(SimpleNamespace(cycle_ref=target.cycle_ref)))
    monkeypatch.setattr(routes, "_get_project", lambda *args: _resolved(target))
    monkeypatch.setattr(routes, "_assert_cycle_project_view", lambda *args: _resolved(None))
    monkeypatch.setattr(PerformanceProjectService, "project_audience", audience)
    monkeypatch.setattr(PerformanceProjectService, "preview_people", unexpected)
    payload = routes.EvaluatorPreviewPayload(project_id=1)
    result = await routes.evaluator_preview(1, payload, context("performance.cycles.manage"), object())
    assert result.task_generation_count == 1 and result.group_counts == [1]
    page = await routes.evaluator_preview_people(1, payload, 1, 50, None, context("performance.cycles.manage"), object())
    assert page.total == 1 and page.items[0].employee_no == "E1"


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["active", "report_only", "outside_scope", "ineligible", "duplicate", "other_project", "missing_manager", "denied", "archived", "calibration_legacy", "calibration_override", "calibration_missing", "calibration_explicit_empty"])
async def test_reviewee_add_syncs_rules_members_tasks_and_classification(monkeypatch, scenario):
    from app.performance import projects_router as routes
    from app.performance.models import PerformanceCycle, PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask
    report_only = scenario == "report_only"
    target = project("STARTED")
    target.evaluated_count = 1
    target.settings["evaluator_rules"] = {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]}
    if scenario == "outside_scope":
        target.settings["scope_rules"] = {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]}
    cycle = SimpleNamespace(cycle_ref=target.cycle_ref, leaver_enabled=scenario != "ineligible", leaver_start_date=date(2026, 1, 1), leaver_end_date=date(2026, 12, 31), leaver_participation_mode="REPORT_ONLY")
    person = SimpleNamespace(employee_no="E2", portal_user_id=None, display_name="员工二", company_org="集团", department="研发", department_2=None, department_3=None, department_4=None, department_5=None, organization_ref="集团/研发", direct_supervisor_employee_no=None, hrbp_employee_no=None, employee_type="正式", employment_status="离职" if report_only else "在职", departure_date=date(2026, 5, 1) if report_only else None, job_family=None, job_category=None, standard_position=None, position_level=None, hire_date=None)
    if scenario == "ineligible":
        person.employment_status = "离职"
    snapshot = SimpleNamespace(id=7, source_filter={"task_generation_employee_nos": ["E1"]})
    nodes = [SimpleNamespace(id=10, node_id="self", node_type="evaluation", config={"template": {"executor_role_code": "assessment.project_manager" if scenario == "missing_manager" else "assessment.reviewee"}})]
    if scenario.startswith("calibration_"):
        from app.performance.calibration_service import resolve_calibration
        phase_window = {"start_at": "2026-11-06T16:00:00.000Z", "end_at": "2026-11-08T15:59:00.000Z"}
        rule = {"rule_id": "r1", "subject_groups": [{"conditions": [{"operator": "INCLUDE", "values": ["E2"]}]}], "scope": "PROJECT_ALL", "allow_authorize": False}
        flow = {"node_settings": {"cal": {"calibration": {"phases": [{"phase_id": "phase-1", "rules": [rule]}]}}}, "node_times": {"cal": dict(phase_window)}}
        if scenario == "calibration_override":
            flow["node_times"]["cal"]["phase_times"] = {"phase-1": {"start_at": "2026-11-07T16:00:00.000Z", "end_at": "2026-11-08T16:59:00.000Z"}}
        if scenario == "calibration_explicit_empty":
            flow["node_times"]["cal"]["phase_times"] = {"phase-1": {"start_at": "", "end_at": ""}}
        frozen = resolve_calibration({"node_id": "cal"}, flow, {"E2": person}, ["E1"])
        snapshot_time = dict(phase_window) if scenario == "calibration_missing" else {**phase_window, "phase_times": {"phase-1": dict(phase_window)}}
        nodes.append(SimpleNamespace(id=11, node_id="cal", node_type="calibration", config={"template": {}, "time": snapshot_time, "calibration": frozen}))
        target.settings["flow_settings"] = flow
    class Db:
        def __init__(self): self.rows = []; self.refreshed = False; self.commits = 0
        async def refresh(self, row, **kwargs):
            assert row is target and kwargs["with_for_update"] is True
            self.refreshed = True
            if scenario == "archived": target.status = "ARCHIVED"
        async def scalar(self, stmt):
            entity = stmt.column_descriptions[0]["entity"]
            if entity is PerformanceCycle: return cycle
            if entity is PerformanceProjectMemberSnapshot:
                assert self.refreshed
                return snapshot
            if entity is PerformanceProjectMember:
                return 99 if scenario == "duplicate" else "E2" if scenario == "other_project" and "JOIN performance_projects" in str(stmt) else None
            return None
        async def execute(self, stmt):
            values = nodes if stmt.column_descriptions[0]["entity"] is PerformanceProjectNodeSnapshot else []
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
        def add(self, row): self.rows.append(row)
        async def commit(self): self.commits += 1
    db = Db()
    monkeypatch.setattr(routes, "_project_started", lambda *args: _resolved(target))
    monkeypatch.setattr(routes, "_can_manage_project_like_overview", lambda *args: _resolved(scenario != "denied"))
    monkeypatch.setattr(PerformanceProjectService, "_cycle_snapshot_people", lambda *args: _resolved((SimpleNamespace(status="LOCKED"), [person])))
    monkeypatch.setattr(PerformanceProjectService, "project_audience", lambda *args: _resolved(([SimpleNamespace(employee_no="E1")], [SimpleNamespace(employee_no="E1")], [])))
    if scenario not in {"active", "report_only", "calibration_legacy", "calibration_override"}:
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as rejected:
            await routes.add_project_reviewee(1, routes.RevieweeAddPayload(employee_no="E2"), context("performance.cycles.manage"), db)
        if scenario in {"calibration_missing", "calibration_explicit_empty"}:
            assert rejected.value.detail["code"] == "CALIBRATION_PHASE_TIME_REQUIRED"
        assert not db.rows and db.commits == 0 and target.evaluated_count == 1
        assert len(target.settings["evaluator_rules"]["groups"]) == 1
        return
    result = await routes.add_project_reviewee(1, routes.RevieweeAddPayload(employee_no="E2"), context("performance.cycles.manage"), db)
    assert result.value == "E2" and db.commits == 1
    assert any(isinstance(row, PerformanceProjectMember) for row in db.rows)
    assert len([row for row in db.rows if isinstance(row, PerformanceNodeTask)]) == (0 if report_only else 2 if scenario.startswith("calibration_") else 1)
    if scenario in {"calibration_legacy", "calibration_override"}:
        from datetime import UTC, datetime
        task = next(row for row in db.rows if isinstance(row, PerformanceNodeTask) and row.task_kind == "calibration")
        expected_window = flow["node_times"]["cal"].get("phase_times", {"phase-1": phase_window})["phase-1"]
        assert task.available_at == _parse_time(expected_window["start_at"])
        assert task.due_at == _parse_time(expected_window["end_at"])
        start, end = routes._task_window(task, nodes[-1], target)
        assert routes._review_task_status(task, start.isoformat(), end.isoformat(), datetime(2026, 11, 9, tzinfo=UTC)) == "overdue"
        assert task.status == "pending"
        assert flow["node_times"]["cal"].get("phase_times") == (None if scenario == "calibration_legacy" else {"phase-1": expected_window})
    assert target.evaluated_count == (1 if report_only else 2)
    assert snapshot.source_filter["task_generation_employee_nos"] == (["E1"] if report_only else ["E1", "E2"])
    assert target.settings["evaluator_rules"]["groups"][-1]["conditions"] == [{"field": "employee", "operator": "include", "values": ["E2"]}]


@pytest.mark.parametrize("configured,expected", [
    ({}, "snapshot"),
    ({"start_at": "legacy", "end_at": "legacy"}, "snapshot"),
    ({"phase_times": {"p1": {"start_at": "new-start", "end_at": "new-end"}}}, "project"),
    ({"phase_times": {"p1": {"start_at": "", "end_at": ""}}}, "empty"),
    ({"phase_times": {"other": {"start_at": "other", "end_at": "other"}}}, "missing"),
])
def test_calibration_phase_window_falls_back_only_for_legacy_shape(configured, expected):
    from app.performance.calibration_service import calibration_phase_window
    snapshot = {"start_at": "old-start", "end_at": "old-end"}
    node = SimpleNamespace(node_id="cal", config={"time": {"phase_times": {"p1": snapshot}}})
    flow = {"node_times": {"cal": configured}}
    window = calibration_phase_window(flow, node, "p1")
    assert window == {"snapshot": snapshot, "project": {"start_at": "new-start", "end_at": "new-end"}, "empty": {"start_at": "", "end_at": ""}, "missing": None}[expected]
    assert calibration_phase_window(flow, node, "unrelated") is None


def test_distribution_summary_prefers_phase_level_rules_over_node_level():
    from app.performance.calibration_service import distribution_summary
    node_level_rule = {"assessment_item_id": "node-item", "min_people_operator": "GTE", "min_people_count": 3, "conditions": [{"control_mode": "HARD", "grade_codes": ["S"], "operator": "LTE", "value": 20, "unit": "PERCENT"}], "rounding_method": "ROUND"}
    phase_level_rule = {"assessment_item_id": "phase-item", "min_people_operator": "GTE", "min_people_count": 2, "conditions": [{"control_mode": "SOFT", "grade_codes": ["D"], "operator": "GTE", "value": 10, "unit": "PERCENT"}], "rounding_method": "FLOOR"}
    node = SimpleNamespace(node_id="cal", config={})
    flow = {"node_settings": {"cal": {"calibration": {
        "force_distribution_enabled": True,
        "distribution": {"mode": "UNIFIED", "rules": [node_level_rule], "scope_configured": False},
        "phases": [
            {"phase_id": "p1", "rules": [{"scope": "PROJECT_ALL", "allow_authorize": False, "distribution_rules": [phase_level_rule]}]},
            {"phase_id": "p2", "rules": [{"scope": "PROJECT_ALL", "allow_authorize": False}]},
        ],
    }}}}
    summary = distribution_summary(flow, node, "p1")
    assert summary["force_distribution_enabled"] is True
    assert summary["mode"] == "UNIFIED"
    assert summary["rules"] == [phase_level_rule]
    assert any("phase-item" in line and "适用人数大于等于2人时生效" in line for line in summary["lines"])
    assert any("建议：D 大于等于 10%" in line for line in summary["lines"])
    assert any("取整方式：向下取整" in line for line in summary["lines"])
    # 未配置 phase 级 distribution_rules 时回退节点级
    fallback = distribution_summary(flow, node, "p2")
    assert fallback["rules"] == [node_level_rule]
    # 未开启强制分布
    flow["node_settings"]["cal"]["calibration"]["force_distribution_enabled"] = False
    assert distribution_summary(flow, node, "p2")["force_distribution_enabled"] is False


def test_distribution_summary_uses_assessment_names_when_provided():
    from app.performance.calibration_service import distribution_summary
    rule = {"assessment_item_id": "item-123", "min_people_operator": "GTE", "min_people_count": 3, "conditions": [{"control_mode": "HARD", "grade_codes": ["S"], "operator": "LTE", "value": 20, "unit": "PERCENT"}], "rounding_method": "ROUND"}
    node = SimpleNamespace(node_id="cal", config={})
    flow = {"node_settings": {"cal": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "rules": [rule], "scope_configured": False}, "phases": []}}}}
    summary = distribution_summary(flow, node, "p1", {"item-123": "绩效得分"})
    assert any("绩效得分：适用人数大于等于3人时生效" in line for line in summary["lines"])
    assert not any("item-123" in line for line in summary["lines"])
    # 无映射时兜底 id
    fallback = distribution_summary(flow, node, "p1", {})
    assert any("item-123：适用人数大于等于3人时生效" in line for line in fallback["lines"])


def test_calibration_member_increment_keeps_old_assignments_and_adds_all_handlers():
    from app.performance.calibration_service import resolve_calibration, extend_calibration_member
    people = {no: SimpleNamespace(employee_no=no, direct_supervisor_employee_no=None) for no in ["E1", "E2", "M1", "M2"]}
    rule = {"rule_id": "r1", "subject_groups": [{"conditions": [{"operator": "INCLUDE", "values": ["M1", "M2"]}]}], "scope": "PROJECT_ALL", "allow_authorize": True}
    flow = {"node_settings": {"cal": {"calibration": {"phases": [{"phase_id": "p1", "rules": [rule]}]}}}}
    frozen = resolve_calibration({"node_id": "cal"}, flow, people, ["E1"], require_complete=True)
    result, delta = extend_calibration_member(SimpleNamespace(node_id="cal", config={"calibration": frozen}), flow, people, ["E1"], "E2")
    assert frozen["evaluated_count"] == 1
    assert result["evaluated_count"] == result["assigned_count"] == 2
    assert len(result["phases"][0]["assignments"]) == 4
    assert {(item["handler_ref"], item["employee_no"]) for item in delta[0]["assignments"]} == {("M1", "E2"), ("M2", "E2")}
    assert len(result["phases"][0]["rule_sources"][0]["assignments"]) == 4


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
    assert not _previous_finished("E001", previous, [])
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

    task = SimpleNamespace(id=1, cycle_ref="cycle:one", handler_ref="EMP-1", task_kind="evaluation", target_employee_no="EMP-2")
    node = SimpleNamespace(node_type="evaluation")

    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [])
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
    from app.performance.assessment_roles import ROLE_LINE_MANAGER, ROLE_METRIC_EVALUATOR, ROLE_PROJECT_MANAGER, ROLE_REVIEWEE, ROLE_REVIEWER_360

    assert _review_node_category("work_summary", None, has_task=False) == "mine"
    assert _review_node_category("evaluation", ROLE_REVIEWEE, has_task=False) == "mine"
    assert _review_node_category("evaluation", ROLE_LINE_MANAGER, has_task=False) == "team"
    assert _review_node_category("evaluation", ROLE_PROJECT_MANAGER, has_task=False) == "team"
    assert _review_node_category("reviewer_360_confirm", None, has_task=False) == "team"
    assert _review_node_category("result_reconsideration", None, has_task=False) is None
    assert _review_node_category("evaluation", ROLE_REVIEWER_360, has_task=False) is None
    assert _review_node_category("evaluation", ROLE_REVIEWER_360, has_task=True) == "others"
    assert _review_node_category("evaluation", ROLE_METRIC_EVALUATOR, has_task=True) == "others"


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


def _frontend_access(*, cycles=(), review_projects=(), manage_projects=(), workbench_projects=(), actor_ref="E001", visible=None, tasks=None, voluntary=None, scopes=None, features=None, manageable=()):
    from app.performance.navigation_service import FrontendAccess
    return FrontendAccess(
        cycles=list(cycles),
        review_projects=list(review_projects),
        manage_projects=list(manage_projects),
        workbench_projects=list(workbench_projects),
        actor_ref=actor_ref,
        actor_refs_by_cycle={cycle.cycle_ref: actor_ref for cycle in cycles},
        visible_node_ids_by_project=visible or {},
        task_ids_by_project=tasks or {},
        voluntary_node_ids_by_project=voluntary or {},
        management_scopes=scopes or {},
        management_features=features or {},
        manageable_cycle_refs=set(manageable),
    )


@pytest.mark.asyncio
async def test_project_management_overview_filters_cycles_and_projects_by_involvement(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceResultOpening

    cycle_one = _pm_cycle(1, "周期一")
    cycle_two = _pm_cycle(2, "周期二")
    project_one = _pm_project(1, "乙项目", 1, administrators=["张三"])
    project_two = _pm_project(2, "丙项目", 2, administrators=["张三"])
    access = _frontend_access(
        cycles=[cycle_one, cycle_two],
        manage_projects=[(project_one, cycle_one), (project_two, cycle_two)],
        scopes={1: None, 2: None},
        features={1: {"performance.frontend.progress"}, 2: {"performance.frontend.progress"}},
        manageable={cycle_one.cycle_ref, cycle_two.cycle_ref},
    )

    async def resolve(_db, _context):
        return access

    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)

    class Db:
        async def scalar(self, _query):
            return None

        async def execute(self, query):
            model = query.column_descriptions[0].get("entity")
            if model in {PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceResultOpening}:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            raise AssertionError(model)

    result = await projects_router.project_management_overview(None, context(), Db())
    assert [cycle["cycle_id"] for cycle in result["cycles"]] == [1, 2]
    assert result["active_cycle"]["cycle_id"] == 1
    assert [item["project_name"] for item in result["projects"]] == ["乙项目"]
    assert result["hrbp_scope"] == []
    assert result["category"] == {"key": "admin", "label": "项目管理员"}
    assert len(result["completion_nodes"]) == 8

    explicit = await projects_router.project_management_overview(2, context(), Db())
    assert explicit["active_cycle"]["cycle_id"] == 2
    assert [item["project_name"] for item in explicit["projects"]] == ["丙项目"]

    with pytest.raises(HTTPException) as denied:
        empty_access = _frontend_access(cycles=[cycle_one])
        async def no_identity(_db, _context):
            return empty_access
        monkeypatch.setattr(projects_router, "resolve_frontend_access", no_identity)
        await projects_router.project_management_overview(None, context("performance.cycles.manage"), Db())
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_project_management_overview_empty_and_missing_cycle(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    async def empty_access(_db, _context):
        return _frontend_access()

    monkeypatch.setattr(projects_router, "resolve_frontend_access", empty_access)
    empty = await projects_router.project_management_overview(None, context(), object())
    assert empty == {"cycles": [], "active_cycle": None, "projects": [], "completion_nodes": [], "hrbp_scope": [], "category": {"key": "admin", "label": "项目管理员"}}

    with pytest.raises(HTTPException) as exc_info:
        await projects_router.project_management_overview(99, context(), object())
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


@pytest.mark.asyncio
@pytest.mark.parametrize("with_payload", [False, True])
async def test_copy_project_preserves_configuration_and_resets_history_in_one_commit(with_payload):
    from copy import deepcopy
    from unittest.mock import AsyncMock, Mock
    from app.performance.models import PerformanceProject

    source = project(status="STARTED")
    source.evaluated_count = 123
    source.settings.update({
        "template_id": 7,
        "data_managers": ["HRBP"],
        "scope_limited": True,
        "scope_rules": {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]},
        "evaluator_rules": {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]},
        "flow_settings": {"node_settings": {"summary": {"work_summary": {"review_enabled": True}}}, "node_times": {"summary": {"start_at": "2026-01-01T00:00:00Z", "end_at": "2026-01-02T00:00:00Z"}}},
        "extra_configuration": {"values": ["keep"]},
    })
    before = deepcopy(source.settings)
    db = SimpleNamespace(add=Mock(side_effect=lambda row: setattr(row, "id", 2)), flush=AsyncMock(), commit=AsyncMock(), refresh=AsyncMock(), get=AsyncMock(return_value=None))
    service = PerformanceProjectService(db)
    service.audit.append_event = Mock()
    service.validate_template = AsyncMock()
    service._validate_distribution_template_options = AsyncMock()
    payload = {"name": "复制名称", "description": None, "administrators": ["E2", "E2"], "data_managers": ["PROJECT_ADMIN"], "scope_limited": False, "scope_rules": {"groups": []}} if with_payload else None
    copied = await service.copy_project(source, payload, target_cycle_ref="cycle:target" if with_payload else None, actor_type="PORTAL_USER", actor_id=1)

    assert copied.cycle_ref == ("cycle:target" if with_payload else source.cycle_ref)
    assert copied.name == ("复制名称" if with_payload else "项目一（副本）")
    assert copied.description == (None if with_payload else source.description)
    assert copied.administrators == (["E2"] if with_payload else source.administrators)
    assert copied.settings["data_managers"] == (["PROJECT_ADMIN"] if with_payload else ["HRBP"])
    assert copied.settings["scope_limited"] is (not with_payload)
    assert copied.settings["scope_rules"] == ({"groups": []} if with_payload else before["scope_rules"])
    assert copied.project_ref != source.project_ref
    assert copied.status == "DRAFT" and copied.evaluated_count == 0
    assert copied.settings["template_id"] == 7
    assert copied.settings["evaluator_rules"] == before["evaluator_rules"]
    assert copied.settings["flow_settings"]["node_times"]["summary"]["end_at"] == "2026-01-02T00:00:00Z"
    service.validate_template.assert_awaited_once_with(copied.cycle_ref, 7)
    service._validate_distribution_template_options.assert_awaited_once_with(7, copied.settings["flow_settings"])
    assert [type(call.args[0]) for call in db.add.call_args_list] == [PerformanceProject]
    db.commit.assert_awaited_once()
    event = service.audit.append_event.call_args.args[0]
    assert event.event_type == "PERFORMANCE_PROJECT_COPIED" and event.cycle_ref == copied.cycle_ref
    assert event.before_state["project_ref"] == source.project_ref
    assert event.after_state["name"] == copied.name
    copied.settings["extra_configuration"]["values"].append("copy-only")
    assert source.settings == before and source.status == "STARTED" and source.evaluated_count == 123


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"name": "   "},
    {"data_managers": []},
    {"data_managers": ["UNKNOWN"]},
    {"scope_limited": True, "scope_rules": {"groups": []}},
    {"scope_rules": {"groups": [{"conditions": [{"field": "job_family", "operator": "include", "values": ["研发"]}]}]}},
])
async def test_copy_project_reuses_create_field_and_scope_validation(changes):
    from unittest.mock import AsyncMock, Mock

    db = SimpleNamespace(add=Mock(), commit=AsyncMock())
    with pytest.raises(ProjectValidationError):
        await PerformanceProjectService(db).copy_project(project(), changes, actor_type="PORTAL_USER", actor_id=1)
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_copy_project_rejects_target_template_and_disabled_manual_opening():
    from unittest.mock import AsyncMock, Mock

    source = project()
    source.settings["template_id"] = 7
    db = SimpleNamespace(add=Mock(), commit=AsyncMock(), scalar=AsyncMock(return_value=SimpleNamespace(template_ids=[8], template_id=8)))
    with pytest.raises(ProjectValidationError, match="当前绩效周期"):
        await PerformanceProjectService(db).copy_project(source, target_cycle_ref="cycle:target", actor_type="PORTAL_USER", actor_id=1)
    source.settings = {"flow_settings": {"node_settings": {"view": {"result_view": {"manual_enabled": True, "manual_role_codes": ["PROJECT_ADMIN"]}}}}}
    db.get = AsyncMock(return_value=SimpleNamespace(manual_result_opening_enabled=False))
    with pytest.raises(ProjectValidationError, match="不允许手动开通"):
        await PerformanceProjectService(db).copy_project(source, actor_type="PORTAL_USER", actor_id=1)
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_copy_project_http_optional_payload_permissions_and_rollback(monkeypatch):
    from fastapi import FastAPI, HTTPException
    from httpx import ASGITransport, AsyncClient
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes

    source = project()
    copied = project(project_ref="project:copy")
    copied.id = 2
    db = SimpleNamespace(rollback=AsyncMock())
    active_context = context("performance.cycles.manage")
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[routes.get_session] = lambda: db
    app.dependency_overrides[routes.get_performance_access_context] = lambda: active_context
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=source))
    get_cycle = AsyncMock(return_value=SimpleNamespace(cycle_ref="cycle:target"))
    monkeypatch.setattr(routes, "_get_cycle", get_cycle)
    copy = AsyncMock(return_value=copied)
    monkeypatch.setattr(PerformanceProjectService, "copy_project", copy)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        url = "/performance/projects/1/copy"
        result = await client.post(url)
        assert result.status_code == 201 and result.json()["project_ref"] == "project:copy"
        assert copy.await_args.args == (source, {})
        assert copy.await_args.kwargs["target_cycle_ref"] == source.cycle_ref
        payload = {"target_cycle_id": 12, "name": "新名称", "description": None, "administrators": ["E2"], "data_managers": ["HRBP"], "scope_limited": False, "scope_rules": {"groups": []}}
        assert (await client.post(url, json=payload)).status_code == 201
        get_cycle.assert_awaited_once_with(db, 12)
        assert copy.await_args.kwargs["target_cycle_ref"] == "cycle:target"
        assert copy.await_args.args[1] == {key: value for key, value in payload.items() if key != "target_cycle_id"}
        for invalid in [{"target_cycle_id": 0}, {"target_cycle_id": "cycle:ref"}, {"settings": {}}, {"status": "STARTED"}, {"data_managers": []}]:
            assert (await client.post(url, json=invalid)).status_code == 422
        assert copy.await_count == 2
        for denied in [context(), context("performance.projects.manage", refs=(source.project_ref,)), context("performance.projects.manage", refs=("project:other",))]:
            active_context = denied
            assert (await client.post(url, json=payload)).status_code == 403
        assert copy.await_count == 2
        active_context = context("performance.cycles.manage")
        get_cycle.side_effect = HTTPException(status_code=404, detail="绩效周期不存在")
        assert (await client.post(url, json=payload)).status_code == 404
        assert copy.await_count == 2
        copy.side_effect = ProjectValidationError("开启限定考核范围后至少需要配置一条条件")
        result = await client.post(url)
        assert result.status_code == 422
        db.rollback.assert_awaited_once()


def _distribution_rule(assessment_item_id="grade", grade_codes=None):
    return {
        "assessment_item_id": assessment_item_id,
        "min_people_operator": "GTE",
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


def test_project_distribution_applicable_people_accepts_all_operators_and_rejects_invalid():
    for operator in ("EQ", "LT", "LTE", "GT", "GTE"):
        rule = _distribution_rule()
        rule["min_people_operator"] = operator
        flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "rules": [rule], "scope_configured": False}, "phases": []}}}}
        assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["calibration-1"]["calibration"]["distribution"]["rules"][0]["min_people_operator"] == operator
    invalid = _distribution_rule()
    invalid["min_people_operator"] = "LIKE"
    with pytest.raises(ProjectValidationError, match="分布规则适用人数比较符不合法"):
        PerformanceProjectService._validate_flow_settings({"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "rules": [invalid], "scope_configured": False}, "phases": []}}}})


def test_project_distribution_accepts_no_rounding_method():
    rule = _distribution_rule()
    rule["rounding_method"] = "NONE"
    flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": {"mode": "UNIFIED", "rules": [rule], "scope_configured": False}, "phases": []}}}}
    assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["calibration-1"]["calibration"]["distribution"]["rules"][0]["rounding_method"] == "NONE"


def test_project_distribution_rules_round_trip_and_reject_duplicate_assessment_item():
    distribution = {"mode": "UNIFIED", "rules": [_distribution_rule()], "scope_configured": False}
    flow = {"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": distribution, "phases": []}}}}
    assert PerformanceProjectService._validate_flow_settings(flow)["node_settings"]["calibration-1"]["calibration"]["distribution"] == distribution
    legacy_rule = {key: value for key, value in _distribution_rule().items() if key != "min_people_operator"}
    legacy = {"mode": "UNIFIED", "rules": [legacy_rule], "scope_configured": False}
    normalized = PerformanceProjectService._validate_flow_settings({"node_settings": {"calibration-1": {"calibration": {"force_distribution_enabled": True, "distribution": legacy, "phases": []}}}})["node_settings"]["calibration-1"]["calibration"]["distribution"]["rules"][0]
    assert normalized["min_people_operator"] == "GTE"
    assert normalized["min_people_count"] == 8
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
                    "allow_voluntary_okr_access": False,
                }
            },
            "calibration-1": {
                "calibration": {
                    "force_distribution_enabled": True,
                    "phases": [{"rules": [{"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False}]}],
                }
            },
            "result-view-1": {"result_view": {"automatic_enabled": False, "manual_enabled": True, "automatic_rule": "PREVIOUS_AND_START"}},
            "reconsideration-1": {"result_reconsideration": {"handler_employee_nos": ["HRBP"]}},
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
        "allow_voluntary_okr_access": False,
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
    from app.performance.calibration_service import canonical_flow
    assert PerformanceProjectService.serialize(target)["flow_settings"] == canonical_flow(normalized, target.id)


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


def test_project_node_time_parser_interprets_naive_value_as_shanghai_wall_time():
    from datetime import UTC, datetime

    assert _parse_time("2026-11-04T16:40") == datetime(2026, 11, 4, 8, 40, tzinfo=UTC)
    assert _parse_time("2026-11-04T16:40:00+08:00") == datetime(2026, 11, 4, 8, 40, tzinfo=UTC)
    assert _parse_time("2026-11-04T08:40:00Z") == datetime(2026, 11, 4, 8, 40, tzinfo=UTC)


def test_project_flow_settings_normalizes_node_time_without_changing_wall_time():
    normalized = PerformanceProjectService._validate_flow_settings({
        "node_settings": {},
        "node_times": {
            "evaluation-1": {
                "start_at": "2026-11-04T16:40",
                "end_at": "2026-11-06T23:59",
            },
        },
    })

    assert normalized["node_times"]["evaluation-1"] == {
        "start_at": "2026-11-04T16:40",
        "end_at": "2026-11-06T23:59",
    }


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


def test_prompt_elements_keep_page_and_inline_order_without_answer_fields():
    from app.performance.self_summary_service import build_self_summary_schema

    schema = build_self_summary_schema({"content": [
        {"type": "prompt", "id": "page-prompt", "prompt": {"title": "页面提示", "content": "先看这里", "allowView": True}},
        {"content_id": "mixed", "type": "custom", "name": "工作内容", "items": [
            {"id": "first", "kind": "fill", "questionType": "text", "label": "第一题"},
            {"id": "inline-prompt", "kind": "prompt", "prompt": {"title": "题间提示", "content": "补充说明", "allowView": True}},
            {"id": "second", "kind": "fill", "questionType": "text", "label": "第二题"},
        ]},
    ]}, include_prompts=True, filling=True)

    assert [section["id"] for section in schema] == ["page-prompt", "mixed"]
    assert schema[0]["elements"][0]["kind"] == "prompt"
    assert [(element["kind"], element["id"]) for element in schema[1]["elements"]] == [
        ("field", "first"), ("prompt", "inline-prompt"), ("field", "second"),
    ]
    assert all("prompt" not in field for section in schema for field in section["fields"])


def test_prompt_visibility_respects_allow_view_and_only_when_filling():
    from app.performance.self_summary_service import build_self_summary_schema

    template = {"content": [{"type": "prompt", "id": "p", "prompt": {"title": "提示", "content": "内部", "allowView": True, "onlyWhenFilling": True}}]}
    assert build_self_summary_schema(template, include_prompts=True, filling=True)[0]["elements"]
    assert build_self_summary_schema(template, include_prompts=True, filling=False) == []
    denied = {"content": [{"type": "prompt", "id": "p", "prompt": {"title": "提示", "content": "不可见", "allowView": False}}]}
    assert build_self_summary_schema(denied, include_prompts=True, filling=True) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("filling", [True, False])
async def test_task_visible_content_projects_prompts_from_snapshot_with_context(filling):
    from app.performance.projects_router import _task_visible_content

    node = SimpleNamespace(node_type="evaluation", config={"template": {"content": [
        {"id": "allowed", "type": "prompt", "prompt": {"content": "通用说明"}},
        {"id": "fill-only", "type": "prompt", "prompt": {"content": "填写说明", "onlyWhenFilling": True}},
        {"id": "denied", "type": "prompt", "prompt": {"content": "不可见提示", "allowView": False}},
        {"id": "reference", "type": "prompt", "content_slot": "reference", "prompt": {"content": "错误槽位"}},
        {"id": "block", "type": "custom", "items": [{"id": "answer", "kind": "fill", "label": "填写内容"}]},
    ]}})
    task = SimpleNamespace(answers={"answer": "真实答案", "allowed": "伪造提示答案"})
    schema, answers = await _task_visible_content(task, node, SimpleNamespace(), filling=filling)
    assert [section["id"] for section in schema] == (["allowed", "fill-only", "block"] if filling else ["allowed", "block"])
    assert "不可见提示" not in str(schema)
    assert "错误槽位" not in str(schema)
    assert answers == {"answer": "真实答案"}


def test_reference_prompt_projection_preserves_order_and_filters_fill_only_overrides():
    from copy import deepcopy
    from app.performance.self_summary_service import project_reference_content, sanitize_self_summary_answers

    source = {"content": [
        {"content_id": "page", "type": "prompt", "prompt": {"content": "公共说明"}},
        {"content_id": "mixed", "type": "custom", "name": "反馈", "items": [
            {"id": "first", "kind": "fill", "label": "第一题"},
            {"id": "notice", "kind": "prompt", "prompt": {"content": "题间说明"}},
            {"id": "fill-only", "kind": "prompt", "prompt": {"content": "仅填写秘密", "onlyWhenFilling": True}},
            {"id": "hidden", "kind": "fill", "settings": {"mode": "hidden"}},
        ]},
    ]}
    original = deepcopy(source)
    relation = {"reference_settings": {"content_settings": {
        "page": {"root": {"allowView": False}},
        "mixed": {"items": {"fill-only": {"allowView": True}}},
    }}}
    schema, answers = project_reference_content(source, relation, {"first": "答案", "notice": "伪造答案"})
    assert [section["id"] for section in schema] == ["mixed"]
    assert [(element["kind"], element["id"]) for element in schema[0]["elements"]] == [("field", "first"), ("prompt", "notice")]
    assert "仅填写秘密" not in str(schema)
    assert answers == {"first": "答案"}
    assert sanitize_self_summary_answers(schema, {"first": "答案", "notice": "伪造答案"}) == {"first": "答案"}
    assert source == original
    relation["reference_settings"]["content_settings"]["mixed"]["items"]["notice"] = {"allowView": False}
    assert all(element["kind"] != "prompt" for section in project_reference_content(source, relation, {})[0] for element in section["elements"])


@pytest.mark.parametrize("source_only,local_only", [(False, False), (False, True), (True, False), (True, True)])
def test_reference_prompt_only_when_filling_can_only_narrow_source(source_only, local_only):
    from copy import deepcopy
    from app.performance.self_summary_service import project_reference_content
    source = {"content": [
        {"content_id": "page", "type": "prompt", "prompt": {"content": "Page notice", "onlyWhenFilling": source_only}},
        {"content_id": "mixed", "type": "custom", "items": [
            {"id": "answer", "kind": "fill"},
            {"id": "notice", "kind": "prompt", "prompt": {"content": "Inline notice", "onlyWhenFilling": source_only}},
        ]},
    ]}
    relation = {"reference_settings": {"content_settings": {
        "page": {"root": {"onlyWhenFilling": local_only}},
        "mixed": {"items": {"notice": {"onlyWhenFilling": local_only}}},
    }}}
    original = deepcopy((source, relation))
    schema, answers = project_reference_content(source, relation, {"answer": "Safe"})
    visible = not (source_only or local_only)
    assert ("Page notice" in str(schema)) is visible
    assert ("Inline notice" in str(schema)) is visible
    assert answers == {"answer": "Safe"}
    assert (source, relation) == original


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
@pytest.mark.parametrize("page_name", [None, "快照页面名称"])
async def test_self_summary_detail_keeps_template_title_and_returns_snapshot_person(monkeypatch, page_name):
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
        "content_page_name": page_name,
        "content": [{
            "content_id": "summary", "type": "work_summary", "name": "工作总结", "description": "描述",
            "items": [{"id": "work", "label": "填写题名称", "settings": {"required": True}}],
        }]
    }})
    member = SimpleNamespace(snapshot_id=21, display_name="刘琦", company_org="产品中心", organization_ref="产品中心", direct_supervisor_employee_no="M001")

    async def fake_task(*_args):
        return task, node

    class Db:
        async def scalar(self, _statement):
            return member

        async def execute(self, statement):
            sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_authorization_snapshot_people.snapshot_id = performance_project_member_snapshots.source_snapshot_id" in sql
            assert "performance_project_member_snapshots.id IN (21)" in sql
            assert "performance_authorization_snapshot_people.employee_no IN ('M001')" in sql
            return SimpleNamespace(all=lambda: [(21, "M001", "刘芝萍")])

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
    assert result["content_page_name"] == (page_name or "模板手动维护名称")
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
    node.config["template"]["executor_role_code"] = "assessment.line_manager"
    member.id = 21
    from unittest.mock import AsyncMock
    management_detail = {
        "management_tabs": [{"key": "management-summary"}],
        "default_active_tab": "management-summary",
        "stage_views": [{"node_id": "summary", "reminder_target": "刘芝萍"}],
        "root_review_id": 21,
        "opened_at": None,
        "cycle": {"name": "测试周期"},
    }
    detail = AsyncMock(return_value=management_detail)
    monkeypatch.setattr(projects_router, "_project_member_detail", detail)
    evaluation = await projects_router.get_template_task(9, context(), Db())
    assert detail.await_count == 1
    assert detail.await_args.args[1] == "E001"
    assert detail.await_args.kwargs == {"root_review_id": 21, "skip_scope": True, "visibility_role": "leader"}
    assert all(evaluation[key] == value for key, value in management_detail.items())
    assert evaluation["task_kind"] == "evaluation"
    assert evaluation["entry_mode"] == "template_task"
    assert evaluation["node_name"] == "模板手动维护名称"
    assert evaluation["content_page_name"] == (page_name or "模板手动维护名称")
    assert evaluation["answers"] == {"work": "已完成"}


@pytest.mark.asyncio
async def test_reconsideration_template_task_passes_show_result_and_keep_result(monkeypatch):
    """复议处理任务透传模板节点开关 + 处理人选择（keep_result），供前端联动隐藏绩效结果内容"""
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        task_kind="result_reconsideration",
        member_snapshot_id=21,
        target_employee_no="E001",
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=3,
        answers={"keep_result": "keep"},
    )
    node = SimpleNamespace(node_id="recon", name="结果复议处理", config={"template": {
        "show_result_and_modify": False,
        "content": [{
            "content_id": "recon-result", "type": "work_summary", "name": "复议处理结果",
            "items": [{"id": "feedback", "label": "反馈说明", "settings": {"required": True}}],
        }],
    }})
    member = SimpleNamespace(snapshot_id=21, display_name="刘琦", company_org="产品中心", organization_ref="产品中心", direct_supervisor_employee_no="M001")
    page_name = None

    async def fake_task(*_args):
        return task, node

    class Db:
        async def scalar(self, _statement):
            return member

        async def execute(self, statement):
            sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_authorization_snapshot_people.snapshot_id = performance_project_member_snapshots.source_snapshot_id" in sql
            assert "performance_project_member_snapshots.id IN (21)" in sql
            assert "performance_authorization_snapshot_people.employee_no IN ('M001')" in sql
            return SimpleNamespace(all=lambda: [(21, "M001", "刘芝萍")])

        async def get(self, _model, _id):
            return SimpleNamespace(settings={"flow_settings": {"node_times": {"recon": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})

    from app.performance import reconsideration_service
    async def fake_reconsideration(db, t, **kwargs):
        return SimpleNamespace(reason="对评级有异议", result_snapshot={"schema_version": 1, "source_result": {}, "form_schema": [], "answers": {}})
    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    monkeypatch.setattr(reconsideration_service, "reconsideration_for_task", fake_reconsideration)

    result = await projects_router.get_template_task(9, context(), Db())
    assert result["task_kind"] == "result_reconsideration"
    assert result["reconsideration_reason"] == "对评级有异议"
    assert result["show_result_and_modify"] is False
    assert result["keep_result"] == "keep"


@pytest.mark.asyncio
@pytest.mark.parametrize("answer", ["新内容", '<div class="ace-line list-div"><ol class="list-number1 r-list r-list-number" start="2"><li data-start="2"><strong>第二项</strong></li></ol></div>'])
async def test_self_summary_partial_draft_merges_existing_answers(monkeypatch, answer):
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
        projects_router.SelfSummaryAnswersPayload(answers={"work": answer}, version=1),
        False,
        context(),
        Db(),
    )

    assert task.answers == {"work": "原内容", "other": "保留内容"}
    assert task.draft_answers == {"work": answer}
    assert result["answers"]["work"] == "原内容"
    assert result["has_draft"] is True
    assert result["version"] == 2


@pytest.mark.asyncio
async def test_reconsideration_submit_persists_keep_result(monkeypatch):
    """复议处理人选择「保持原结果/变更结果」随提交持久化（answers.keep_result），前端联动读取"""
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        task_kind="result_reconsideration",
        member_snapshot_id=21,
        node_snapshot_id=31,
        target_employee_no="E001",
        cycle_ref="cycle:one",
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=1,
        status="pending",
        completed_at=None,
        answers={"keep_result": "change"},
    )
    node = SimpleNamespace(node_id="recon", config={"template": {"content": [{
        "content_id": "recon", "type": "work_summary", "name": "复议处理结果",
        "items": [{"id": "feedback", "label": "反馈说明", "settings": {"required": True}}],
    }]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        def add(self, row):
            pass

        async def get(self, _model, _id):
            return None

        async def commit(self):
            return None

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    async def allow_overdue(*_args):
        return True
    monkeypatch.setattr(projects_router, "_overdue_submission_allowed", allow_overdue)
    from app.performance import reconsideration_service
    async def fake_reconsideration(db, t, **kwargs):
        return SimpleNamespace(id=1, reason="对评级有异议", version=1, result_snapshot={"schema_version": 1, "source_result": {}, "form_schema": [], "answers": {}})
    monkeypatch.setattr(reconsideration_service, "reconsideration_for_task", fake_reconsideration)
    async def fake_reconsideration_tasks(db, appeal, **kwargs):
        return []
    monkeypatch.setattr(reconsideration_service, "reconsideration_tasks", fake_reconsideration_tasks)
    result = await projects_router._save_self_summary(
        9,
        projects_router.SelfSummaryAnswersPayload(answers={"feedback": "<p>已变更</p>", "keep_result": "keep"}, version=1),
        True,
        context(),
        Db(),
    )

    assert task.answers["keep_result"] == "keep"
    assert "feedback" not in task.answers
    assert result["reconsideration_closed"] and not result["editable"]


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
    assert template == {"node_id": "summary", "content_bindings": {"fill": []}}


@pytest.mark.asyncio
async def test_self_summary_legacy_snapshot_without_template_falls_back_to_matching_template_node():
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceTemplateWorkflow

    task = SimpleNamespace(project_id=3)
    node = SimpleNamespace(node_id="summary", config={})
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
    cycle = SimpleNamespace(id=1, cycle_ref=target.cycle_ref, name="周期", start_at=Clock(2026, 9, 1, tzinfo=UTC), end_at=Clock(2026, 10, 1, tzinfo=UTC))
    task = SimpleNamespace(id=20, project_id=1, node_snapshot_id=10, handler_ref="E001", task_kind="evaluation", submitted_at=None, available_at=Clock(2026, 9, 20, tzinfo=UTC), due_at=Clock(2026, 9, 30, tzinfo=UTC))
    access = _frontend_access(cycles=[cycle], review_projects=[(target, cycle)], workbench_projects=[(target, cycle)], visible={1: {10}}, tasks={1: {20}})
    async def resolve(_db, _context):
        return access
    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)

    class Db:
        def __init__(self):
            self.calls = 0

        async def scalar(self, _query):
            return 20

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

        async def execute(self, query):
            from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot
            model = query.column_descriptions[0].get("entity")
            if model is PerformanceProjectNodeSnapshot:
                rows = [node]
            elif model is PerformanceNodeTask:
                rows = [task]
            else:
                rows = []
            return SimpleNamespace(all=lambda: rows, scalars=lambda: SimpleNamespace(all=lambda: rows))

        def add(self, _record):
            pass

        async def commit(self):
            pass

        async def refresh(self, _project):
            pass

    db = Db()
    db.calls = 1
    old = await projects_router.review_overview(1, context("performance.cycles.manage"), db)
    assert old["categories"][0]["nodes"][0]["status"] == "not_started"
    await PerformanceProjectService(db).update_project(target, {"flow_settings": {"node_settings": {}, "node_times": {"manager-review": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}}, actor_type="PORTAL_USER", actor_id=1)
    db.calls = 1
    current = await projects_router.review_overview(1, context("performance.cycles.manage"), db)
    review_node = current["categories"][0]["nodes"][0]
    assert (review_node["status"], review_node["start_at"]) == ("pending", "2026-09-16T00:00:00Z")
    db.calls = 1
    timeline = await projects_router.workbench_timeline(1, context("performance.cycles.manage"), db)
    assert (timeline[0]["status"], timeline[0]["start_at"]) == ("in_progress", "2026-09-16T00:00:00Z")
    assert node.config["time"]["start_at"] == "2026-09-20T00:00:00Z"
    assert task.available_at == Clock(2026, 9, 16, tzinfo=UTC)
    assert task.due_at == Clock(2026, 9, 30, tzinfo=UTC)

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
    assert task.draft_answers["work"] == "完成"
    assert result["answers"] == {}
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

    target = SimpleNamespace(id=1, cycle_ref="cycle:one", settings={"flow_settings": {"node_times": {"manager-review": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-25T00:00:00Z"}}}})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="上级评估", config={"time": {"end_at": "2026-10-01T00:00:00Z"}})
    task = SimpleNamespace(id=20, project_id=1, target_employee_no="E001", status="pending", available_at=None, due_at=datetime(2026, 10, 1, tzinfo=UTC))
    member = SimpleNamespace(snapshot_id=7, employee_no="E001", display_name="员工甲")

    class Db:
        async def execute(self, query):
            if "performance_node_tasks.cycle_ref =" in str(query):
                return SimpleNamespace(all=lambda: [])
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
async def test_task_people_returns_dynamic_ratings_from_the_current_task(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router as routes
    from app.performance.models import PerformanceProject

    project = SimpleNamespace(id=1, cycle_ref="C1", settings={})
    node = SimpleNamespace(id=10, node_id="manager", node_type="evaluation", config={"template": {"content": [{
        "content_id": "assessment", "type": "rating", "name": "综合评估", "items": [
            {"id": "grade", "kind": "rating", "label": "年度绩效", "options": [{"id": "good", "code": "3星+", "label": "符合预期+", "color": "#d9f5d6"}]},
            {"id": "value", "kind": "rating", "label": "价值贡献", "options": [{"id": "high", "code": "A", "label": "优秀"}]},
        ],
    }]}})
    member = SimpleNamespace(snapshot_id=7, employee_no="E1", display_name="员工")
    task = SimpleNamespace(id=20, project_id=1, status="completed", submitted_at=datetime.now(UTC), target_employee_no="E1", available_at=None, due_at=None, answers={"grade": "good", "value": "high"})
    async def actor(*args, **kwargs): return SimpleNamespace(actor_ref="M1")
    async def rules(*args): return {"leader": []}
    async def role(*args): return "leader"
    async def progress(*args): return {}
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(routes, "load_subject_visibility_rules", rules)
    monkeypatch.setattr(routes, "resolve_subject_visibility_role", role)
    monkeypatch.setattr(routes, "_communication_progress", progress)
    monkeypatch.setattr(routes, "_communication_progress_detail", progress)
    class Db:
        async def get(self, model, key): return project if model is PerformanceProject else None
        async def execute(self, query): return SimpleNamespace(all=lambda: [(task, node, member)])
    result = await routes.workbench_task_people("manager", 1, "all", context(), Db(), None)
    row = result[0]
    assert row["rating_columns"] == [{"key": "rating:grade", "label": "年度绩效"}, {"key": "rating:value", "label": "价值贡献"}]
    assert row["ratings"]["rating:grade"] == {"label": "3星+", "color": "#d9f5d6", "foreground": None}
    assert row["ratings"]["rating:value"]["label"] == "A"
    assert row["rating"] is None
    task.submitted_at = None
    task.status = "pending"
    row = (await routes.workbench_task_people("manager", 1, "all", context(), Db(), None))[0]
    assert row["ratings"] == {"rating:grade": None, "rating:value": None}
    task.submitted_at = datetime.now(UTC)
    task.answers = {"grade": "unknown-option"}
    row = (await routes.workbench_task_people("manager", 1, "all", context(), Db(), None))[0]
    assert row["ratings"] == {"rating:grade": None, "rating:value": None}
    task.answers = {"grade": "good", "value": "high"}
    node.config["template"]["content"][0]["items"][1]["settings"] = {"mode": "view"}
    row = (await routes.workbench_task_people("manager", 1, "all", context(), Db(), None))[0]
    assert row["rating_columns"] == [{"key": "rating:grade", "label": "年度绩效"}]
    assert row["rating"] == "3星+"
    node.config["template"]["content"][0]["items"][0]["settings"] = {"mode": "hidden"}
    row = (await routes.workbench_task_people("manager", 1, "all", context(), Db(), None))[0]
    assert row["rating_columns"] == []
    assert row["ratings"] == {}
    assert row["rating"] is None


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
        assert "performance_node_tasks.handler_ref = 'MANAGER-1'" in where
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
    access = _frontend_access(cycles=[_pm_cycle(1, "周期一")], workbench_projects=rows)
    async def resolve(_db, _context):
        return access
    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)
    result = await projects_router.workbench_projects(None, 1, 20, context(), db)
    assert result[0]["project_id"] == 1


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

async def test_review_project_visibility_uses_semi_joins_for_admin_and_participant(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    cycle = _pm_cycle(1)
    target = _pm_project(1, "已启动项目", 1)
    access = _frontend_access(cycles=[cycle], review_projects=[(target, cycle)], visible={1: {11}}, tasks={1: {21}})
    async def resolve(_db, _context):
        return access
    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)

    class Db:
        calls = 0
        async def get(self, model, identity):
            if model is projects_router.PerformanceProject:
                return target if identity == 1 else None
            return SimpleNamespace(name="模板")
        async def execute(self, query):
            model = query.column_descriptions[0].get("entity")
            if model is projects_router.PerformanceProjectNodeSnapshot:
                self.calls += 1
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            if model is projects_router.PerformanceNodeTask:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            return SimpleNamespace(all=lambda: [])

    response = await projects_router.review_overview(1, context(), Db())
    assert response["active_project"]["project_id"] == 1
    assert response["projects"] == [projects_router.project_payload(target, cycle)]

    with pytest.raises(HTTPException) as denied:
        empty = _frontend_access(cycles=[cycle])
        async def no_project(_db, _context):
            return empty
        monkeypatch.setattr(projects_router, "resolve_frontend_access", no_project)
        await projects_router.review_overview(1, context(), Db())
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_frontend_navigation_uses_selected_related_cycle_and_rejects_unrelated(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    cycle_one = _pm_cycle(1, "周期一")
    cycle_two = _pm_cycle(2, "周期二")
    review_project = _pm_project(11, "评估项目", 1)
    manage_project = _pm_project(22, "管理项目", 2)
    access = _frontend_access(
        cycles=[cycle_two, cycle_one],
        review_projects=[(review_project, cycle_one)],
        manage_projects=[(manage_project, cycle_two)],
        manageable={cycle_two.cycle_ref},
    )
    async def resolve(_db, _context):
        return access
    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)

    default = await projects_router.frontend_navigation(None, context("performance.cycles.manage"), object())
    assert default["active_cycle"]["cycle_id"] == 2
    assert default["can_manage"] is True
    assert default["can_review"] is False
    assert default["review_projects"] == []

    selected = await projects_router.frontend_navigation(1, context(), object())
    assert selected["can_review"] is True
    assert selected["can_manage"] is False
    assert selected["review_projects"] == [projects_router.project_payload(review_project, cycle_one)]

    with pytest.raises(HTTPException) as denied:
        await projects_router.frontend_navigation(99, context(), object())
    assert (denied.value.status_code, denied.value.detail) == (404, "CYCLE_NOT_FOUND")


@pytest.mark.asyncio
async def test_review_overview_explicit_cycle_rejects_cross_project(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    cycle = _pm_cycle(1)
    allowed = _pm_project(1, "允许项目", 1)
    forbidden = _pm_project(2, "同周期未授权项目", 1)
    access = _frontend_access(cycles=[cycle], review_projects=[(allowed, cycle)], visible={1: {11}}, tasks={1: {21}})
    async def resolve(_db, _context):
        return access
    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)
    class Db:
        async def get(self, model, identity):
            return forbidden if model is PerformanceProject and identity == 2 else None
    with pytest.raises(HTTPException) as denied:
        await projects_router.review_overview(2, context(), Db(), None, 1)
    assert (denied.value.status_code, denied.value.detail) == (404, "PROJECT_NOT_FOUND")


@pytest.mark.asyncio
@pytest.mark.parametrize("roles_enabled", [True, False])
async def test_frontend_access_resolves_tasks_management_and_cycle_hrbp(roles_enabled):
    from dataclasses import replace
    from app.performance import navigation_service as navigation
    from app.performance.models import (
        PerformanceAuthorizationSnapshotPerson, PerformanceCycle, PerformanceHrbpPermission,
        PerformanceNodeTask, PerformanceProject, PerformanceProjectMember,
        PerformanceProjectNodeSnapshot, PerformanceRole,
    )

    cycles = [_pm_cycle(i) for i in (1, 2, 3)]
    projects = [_pm_project(i, f"项目{i}", i, administrators=["员工一"] if i == 2 else []) for i in (1, 2, 3)]
    projects[0].settings = {"flow_settings": {"node_settings": {"invite": {"invite": {"allow_voluntary_evaluation": True}}}}}
    people = [(SimpleNamespace(employee_no="E001", display_name="员工一", portal_user_id=1), SimpleNamespace(cycle_ref=cycle.cycle_ref)) for cycle in cycles]
    members = [(SimpleNamespace(employee_no="E001", organization_ref="部门一"), SimpleNamespace(id=i, project_id=i)) for i in (1, 2, 3)]
    nodes = [
        SimpleNamespace(id=11, project_id=1, node_id="summary", node_type="work_summary", config={}),
        SimpleNamespace(id=12, project_id=1, node_id="invite", node_type="reviewer_360_invite", config={}),
        SimpleNamespace(id=13, project_id=1, node_id="feedback", node_type="evaluation", config={"template": {"executor_role_code": "assessment.reviewer_360"}}),
        SimpleNamespace(id=14, project_id=1, node_id="manager", node_type="evaluation", config={"template": {"executor_role_code": "assessment.line_manager"}}),
        SimpleNamespace(id=15, project_id=1, node_id="appeal", node_type="result_reconsideration", config={}),
    ]
    tasks = [SimpleNamespace(id=21, project_id=1, cycle_ref="cycle:1", node_snapshot_id=11, handler_ref="E001", status="pending")]
    roles = [SimpleNamespace(code=code, is_active=roles_enabled, role_type=kind, is_system=True, function_permission_keys=["performance.frontend.progress"]) for code, kind in [
        ("assessment.reviewee", "ASSESSMENT"), ("assessment.reviewer_360", "ASSESSMENT"),
        ("performance.project_admin", "MANAGEMENT"), ("performance.hrbp", "MANAGEMENT"),
    ]]
    permissions = [SimpleNamespace(cycle_ref="cycle:3", hrbp_employee_no="E001", scope=["部门一"], invisible_people=[])]

    class Db:
        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            values = {
                PerformanceAuthorizationSnapshotPerson: people,
                PerformanceCycle: cycles, PerformanceProject: projects,
                PerformanceProjectMember: members, PerformanceProjectNodeSnapshot: nodes,
                PerformanceNodeTask: tasks, PerformanceRole: roles,
                PerformanceHrbpPermission: permissions,
            }[model]
            return SimpleNamespace(all=lambda: values, scalars=lambda: SimpleNamespace(all=lambda: values))

    access = await navigation.resolve_frontend_access(Db(), replace(context("performance.cycles.manage"), effective_employee_no="E001"))
    if not roles_enabled:
        assert access.cycles == []
        assert access.review_projects == []
        assert access.manageable_cycle_refs == set()
        return
    assert [cycle.id for cycle in access.cycles] == [3, 2, 1]
    assert access.visible_node_ids_by_project == {1: {11, 13}}
    assert access.task_ids_by_project == {1: {21}}
    assert access.voluntary_node_ids_by_project == {1: {13}}
    assert access.manageable_cycle_refs == {"cycle:2", "cycle:3"}
    assert access.management_scopes == {2: None, 3: {"E001"}}


def test_voluntary_360_requires_enabled_invite_and_reviewer_node():
    from app.performance.navigation_service import _voluntary_360_node_ids
    project = _pm_project(1, "360项目", 1)
    project.settings = {"flow_settings": {"node_settings": {"invite": {"invite": {"allow_voluntary_evaluation": True}}}}}
    nodes = [
        SimpleNamespace(id=10, node_id="invite", node_type="reviewer_360_invite", config={}),
        SimpleNamespace(id=11, node_id="evaluate", node_type="evaluation", config={"template": {"executor_role_code": "assessment.reviewer_360"}}),
        SimpleNamespace(id=12, node_id="manager", node_type="evaluation", config={"template": {"executor_role_code": "assessment.line_manager"}}),
    ]
    assert _voluntary_360_node_ids(project, nodes) == {11}
    project.settings["flow_settings"]["node_settings"]["invite"]["invite"]["allow_voluntary_evaluation"] = False
    assert _voluntary_360_node_ids(project, nodes) == set()


@pytest.mark.asyncio
async def test_workbench_timeline_uses_navigation_management_identity(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceProjectNodeSnapshot
    cycle = _pm_cycle(1)
    target = _pm_project(1, "项目", 1)
    access = _frontend_access(cycles=[cycle], manage_projects=[(target, cycle)], workbench_projects=[(target, cycle)], manageable={cycle.cycle_ref})
    async def resolve(_db, _context):
        return access
    monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)
    class Db:
        async def get(self, _model, _identity):
            return None
        async def execute(self, query):
            if query.column_descriptions[0].get("entity") is PerformanceProjectNodeSnapshot:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            raise AssertionError(query)
    assert await projects_router.workbench_timeline(1, context(), Db()) == []


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
            if model is PerformanceOtherPermissionSetting:
                return None  # 全局 HRBP 不可见未配置
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
    project = SimpleNamespace(id=1, cycle_ref="cycle:one", settings={})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", config={"template": {"executor_role_code": "assessment.metric_evaluator"}})
    completed = SimpleNamespace(id=20, project_id=1, status="completed", submitted_at=datetime(2026, 9, 20, tzinfo=UTC), available_at=None, due_at=None, target_employee_no="E001", member_snapshot_id=7)
    pending = SimpleNamespace(id=21, project_id=1, status="pending", submitted_at=None, available_at=None, due_at=None, target_employee_no="E002", member_snapshot_id=7)
    member_a = SimpleNamespace(snapshot_id=7, employee_no="E001", display_name="员工一", job_family="技术", job_category="研发", position_level="P6", hire_date=datetime(2020, 1, 2).date(), company_org="研发中心", organization_ref="研发中心", employee_type="正式员工", employment_status="在职")
    member_b = SimpleNamespace(snapshot_id=7, employee_no="E002", display_name="员工二", job_family="技术", job_category="研发", position_level="P6", hire_date=datetime(2020, 1, 2).date(), company_org="研发中心", organization_ref="研发中心", employee_type="正式员工", employment_status="在职")

    class Db:
        async def execute(self, _query):
            if "performance_node_tasks.cycle_ref =" in str(_query):
                return SimpleNamespace(all=lambda: [])
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
async def test_department_completion_roots_at_company_org(monkeypatch):
    from app.performance import projects_router as router
    from app.performance.models import PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceResultOpening

    project = SimpleNamespace(id=3, status="STARTED", cycle_ref="cycle:1")
    values = {
        PerformanceProjectMember: [
            SimpleNamespace(employee_no="E1", company_org="集团", department="研发", department_2="平台", department_3=None, department_4=None, department_5=None),
            SimpleNamespace(employee_no="E2", company_org="集团", department="研发", department_2="平台", department_3=None, department_4=None, department_5=None),
            SimpleNamespace(employee_no="E3", company_org="集团", department="销售", department_2=None, department_3=None, department_4=None, department_5=None),
        ],
        PerformanceProjectNodeSnapshot: [
            SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", name="填写工作总结", config={}, node_order=0),
        ],
        PerformanceNodeTask: [
            SimpleNamespace(node_snapshot_id=5, target_employee_no="E1", status="pending"),
            SimpleNamespace(node_snapshot_id=5, target_employee_no="E2", status="completed"),
            SimpleNamespace(node_snapshot_id=5, target_employee_no="E3", status="pending"),
        ],
        PerformanceResultOpening: [],
    }
    class Db:
        async def scalar(self, query): return 10
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values[query.column_descriptions[0]["entity"]]))

    async def managed(*args): return [(project, None)]
    monkeypatch.setattr(router, "_managed_completion_projects", managed)

    result = await router.project_management_department_completion(cycle_id=1, context=None, db=Db())
    assert result["columns"][0]["title"] == "填写工作总结"
    assert [row["department"] for row in result["rows"]] == ["集团"]
    assert {row["department"] for row in result["rows"][0]["children"]} == {"研发", "销售"}
    assert result["rows"][0]["children"][0]["children"][0]["department"] == "平台"
    metric = result["rows"][0]["children"][0]["metrics"]["work-summary"]
    assert metric == {"completed_count": 1, "total_count": 2, "completion_rate": 50.0}




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
    assert options["people"] == [{"value": row["employee_no"], "label": row["display_name"]} for row in rows]
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
    from unittest.mock import AsyncMock
    db = SimpleNamespace(scalar=get_cycle, rollback=AsyncMock())
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
    if submit:
        assert result["answers"] == {"visible": payload.answers["visible"]}
    else:
        assert task.draft_answers == {"visible": payload.answers["visible"]}
        assert result["answers"] == {"visible": {"tags": ["a"], "notes": {"a": "Previous"}}}
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
    if endpoint == "overview":
        cycle.id = 1
        cycle.cycle_ref = "cycle:one"
        target_project.cycle_ref = "cycle:one"
        access = _frontend_access(cycles=[cycle], review_projects=[(target_project, cycle)], visible={3: {11}}, tasks={3: {9}})
        async def resolve(_db, _context):
            return access
        monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)
    class Db:
        def __init__(self):
            self.calls = 0
        async def get(self, model, _identity):
            return target_project if model is PerformanceProject else None
        async def scalar(self, _query):
            return None
        async def execute(self, _query):
            self.calls += 1
            values = [[node], [task]]
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
    target.cycle_ref = "cycle:one"
    cycle.id = 1
    cycle.cycle_ref = "cycle:one"
    if endpoint == "overview":
        access = _frontend_access(cycles=[cycle], review_projects=[(target, cycle)], visible={3: {12}}, tasks={3: {9}})
        async def resolve(_db, _context):
            return access
        monkeypatch.setattr(projects_router, "resolve_frontend_access", resolve)
    class Db:
        async def get(self, model, _identity):
            return target if model is PerformanceProject else None
        async def scalar(self, _query):
            return None
        async def execute(self, query):
            model = query.column_descriptions[0].get("entity")
            params = query.compile().params
            if model is PerformanceProjectNodeSnapshot:
                rows = [source_node] if "work_summary" in params.values() else [view_node]
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
    view = SimpleNamespace(name="结果查看", config={"template": {"content_page_name": "查看绩效结果", "content": [{**tags, "content_slot": "view"}]}})
    final = SimpleNamespace(id=31, config={"template": {"content": [
        {**tags, "content_slot": "fill"},
        {"content_id": "rating", "type": "rating", "content_slot": "fill", "name": "评级", "items": [{"id": "rating", "label": "评级"}], "options": [{"id": "A", "label": "优秀"}]},
    ]}})
    task = SimpleNamespace(id=101, project_id=7, cycle_ref="cycle:7", member_snapshot_id=91, target_employee_no="E001", node_snapshot_id=31, status="completed", submitted_at=datetime(2026, 10, 1, tzinfo=timezone.utc), answers={"rating": "A", "tag": {"tags": ["a"], "notes": {"a": "<script>x</script><p>完成</p>"}}, "work": "不应返回"})
    member = SimpleNamespace(employee_no="E001")

    async def actor(*_args, **_kwargs):
        return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E001")

    async def opening_state(*_args, **_kwargs):
        assert _kwargs["member_snapshot_id"] == 91
        return view, final, None, [member], [task], projects_router.build_self_summary_schema(final.config["template"])

    monkeypatch.setattr(projects_router, "_get_project", lambda *_args: _resolved(project))
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "_opening_state", opening_state)

    class Db:
        async def scalar(self, _statement):
            return SimpleNamespace(id=1, result_version={"101": 1})
        async def execute(self, _statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [task]))

    result = await projects_router.read_my_project_results(7, context(), Db())

    assert result["results"] == []
    assert result["content_page_name"] == "查看绩效结果"
    assert result["regions"] == [{"key": "result", "kind": "result", "title": "查看绩效结果", "contents": result["contents"]}]
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
            return None if denied == "opening" else SimpleNamespace(id=1, result_version={})
        async def execute(self, _statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    with pytest.raises(HTTPException) as error:
        await projects_router.read_my_project_results(7, context(), Db())
    assert error.value.status_code == 404
    assert error.value.detail == "RESULT_NOT_FOUND"


def test_result_view_orders_local_sections_items_and_independent_prompts():
    from copy import deepcopy
    from app.performance.self_summary_service import project_result_view_contents
    a = {"content_id": "a", "type": "custom", "items": [{"id": "one", "kind": "fill"}, {"id": "notice", "kind": "prompt", "prompt": {"content": "Inline", "onlyWhenFilling": True}}, {"id": "two", "kind": "fill"}]}
    b = {"content_id": "b", "type": "custom", "items": [{"id": "three", "kind": "fill"}]}
    local_a = {**deepcopy(a), "content_slot": "view"}
    local_a["items"].reverse()
    local_a["items"][1]["prompt"]["onlyWhenFilling"] = False
    notice = {"content_id": "page", "type": "prompt", "content_slot": "view", "prompt": {"content": "Page", "allowView": True}}
    view = {"content": [{**b, "content_slot": "view"}, notice, local_a]}
    source = {"content": [a, b]}
    before = deepcopy((source, view))
    task = {"id": 1, "status": "completed", "submitted_at": "now", "answers": {"one": "1", "two": "2", "three": "3"}}
    result = project_result_view_contents(view, source, [task])[0]
    assert [section["id"] for section in result["form_schema"]] == ["b", "page", "a"]
    assert [item["id"] for item in result["form_schema"][2]["elements"]] == ["two", "notice", "one"]
    assert "Inline" in str(result) and "Page" in str(result)
    assert (source, view) == before
    notice["prompt"]["allowView"] = False
    local_a["items"][1]["prompt"]["onlyWhenFilling"] = True
    result = project_result_view_contents(view, source, [task])[0]
    assert "Page" not in str(result) and "Inline" not in str(result)
    local_a["settings"] = {"allowView": False}
    assert [section["id"] for section in project_result_view_contents(view, source, [task])[0]["form_schema"]] == ["b"]


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["allowed", "root_denied", "anonymous", "wrong_project", "wrong_cycle", "wrong_snapshot", "wrong_employee", "revoked", "pending", "missing_submitted"])
async def test_employee_result_regions_reference_scope_and_configured_order(monkeypatch, scenario):
    from copy import deepcopy
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    source_template = {"content": [{"content_id": "source", "type": "custom", "name": "Source", "items": [{"id": "visible", "kind": "fill"}, {"id": "hidden", "kind": "fill", "settings": {"allowView": False}}]}]}
    if scenario == "anonymous":
        source_template["executor_role_code"] = "assessment.reviewer_360"
    source = SimpleNamespace(id=2, node_id="source", name="来源", node_type="evaluation", config={"template": source_template})
    relation = {"content_id": "ref", "content_slot": "reference", "reference_kind": "node", "reference_value": "source", "reference_settings": {"page_name": "参考页", "content_settings": {}}}
    if scenario == "root_denied":
        relation["reference_settings"]["content_settings"] = {"source": {"root": {"allowView": False}}}
    unknown = {"content_id": "unknown", "content_slot": "reference", "reference_kind": "more", "reference_value": "team_stats"}
    view = SimpleNamespace(name="结果", config={"template": {"content": [relation, unknown], "content_region_order": ["reference:unknown", "reference:ref", "result"]}})
    task = SimpleNamespace(id=3, project_id=1, cycle_ref="cycle", member_snapshot_id=8, target_employee_no="E1", node_snapshot_id=2, status="completed", submitted_at="now", revoked_at=None, answers={"visible": "Allowed", "hidden": "Secret"})
    for case, key, value in [("wrong_project", "project_id", 99), ("wrong_cycle", "cycle_ref", "other"), ("wrong_snapshot", "member_snapshot_id", 99), ("wrong_employee", "target_employee_no", "E2"), ("revoked", "revoked_at", "now"), ("pending", "status", "pending"), ("missing_submitted", "submitted_at", None)]:
        if scenario == case:
            setattr(task, key, value)
    queries = []
    class Db:
        async def scalar(self, statement):
            queries.append(statement)
            return source
        async def execute(self, statement):
            queries.append(statement)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [task]))
    visible = AsyncMock(return_value=([], task.answers))
    monkeypatch.setattr(routes, "_task_visible_content", visible)
    monkeypatch.setattr(routes, "_self_summary_template", AsyncMock(return_value=source_template))
    original = deepcopy(source_template)
    regions = await routes._employee_result_regions(SimpleNamespace(id=1, cycle_ref="cycle"), view, [SimpleNamespace(member_snapshot_id=8)], [], "E1", context(), Db())
    assert [region["key"] for region in regions] == ["reference:unknown", "reference:ref", "result"]
    assert regions[0]["status"] == "unavailable" and regions[0]["contents"] == []
    reference = regions[1]
    assert reference["title"] == "参考页"
    if scenario == "allowed":
        assert reference["contents"][0]["answers"] == {"visible": "Allowed"}
        assert "Secret" not in str(regions)
    else:
        assert reference["contents"] == []
    if scenario == "anonymous" or scenario not in {"allowed", "root_denied"}:
        visible.assert_not_awaited()
    assert source_template == original
    if scenario != "anonymous":
        sql = str(queries[-1])
        for name in ("project_id", "cycle_ref", "member_snapshot_id", "target_employee_no", "revoked_at", "submitted_at"):
            assert name in sql


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["allowed", "no_binding", "legacy_mixed_snapshot", "missing_task", "mixed_snapshot", "wrong_project", "wrong_cycle", "wrong_employee", "wrong_final", "missing_member", "published_revoked"])
async def test_employee_results_bind_published_snapshot_and_visible_ratings(monkeypatch, scenario):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.performance import projects_router as routes
    rating = {"content_id": "rating", "type": "rating", "items": [{"id": "grade"}], "options": [{"id": "a", "label": "Label", "description": "Not label"}]}
    final = SimpleNamespace(id=2, config={"template": {"content": [rating]}})
    view = SimpleNamespace(name="结果", config={"template": {"content": [{**rating, "content_slot": "view"}]}})
    task = SimpleNamespace(id=3, project_id=1, cycle_ref="cycle", member_snapshot_id=8, target_employee_no="E1", node_snapshot_id=2, status="completed", submitted_at="now", answers={"grade": "a"})
    for case, key, value in [("wrong_project", "project_id", 99), ("wrong_cycle", "cycle_ref", "other"), ("wrong_employee", "target_employee_no", "E2"), ("wrong_final", "node_snapshot_id", 99)]:
        if scenario == case:
            setattr(task, key, value)
    tasks = [] if scenario == "missing_task" else [task]
    version = {} if scenario in {"no_binding", "legacy_mixed_snapshot"} else {"3": 1}
    if scenario in {"mixed_snapshot", "legacy_mixed_snapshot"}:
        tasks.append(SimpleNamespace(**{**vars(task), "id": 4, "member_snapshot_id": 9}))
        if scenario == "mixed_snapshot":
            version["4"] = 1
    class Db:
        async def scalar(self, statement):
            return SimpleNamespace(result_version=version)
        async def execute(self, statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: tasks))
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=SimpleNamespace(id=1, cycle_ref="cycle")))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1")))
    if scenario == "published_revoked":
        task.revoked_at = "later"
    state = AsyncMock(return_value=(view, final, None, [] if scenario == "missing_member" else [SimpleNamespace(employee_no="E1")], tasks, []))
    monkeypatch.setattr(routes, "_opening_state", state)
    if scenario not in {"allowed", "no_binding", "published_revoked"}:
        with pytest.raises(HTTPException) as error:
            await routes.read_my_project_results(1, context(), Db())
        assert error.value.status_code == 404
        return
    result = await routes.read_my_project_results(1, context(), Db())
    assert result["results"] == [{"task_id": 3, "field_id": "grade", "option_id": "a", "label": "Label"}]
    assert state.call_args.kwargs == {"include_history": True, "member_snapshot_id": 8}
    view.config["template"]["content"][0]["settings"] = {"allowView": False}
    result = await routes.read_my_project_results(1, context(), Db())
    assert result["results"] == [] and result["contents"] == []


@pytest.mark.asyncio
async def test_employee_result_okr_only_reads_explicit_self_relation(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes, okr_provider
    from app.integrations.feishu import feishu_client
    from contextlib import contextmanager
    reads = []
    @contextmanager
    def authorized(employee_no, actor_context):
        reads.append(employee_no)
        yield
    monkeypatch.setattr(feishu_client, "authorized_okr_read", authorized)
    fetch = AsyncMock(return_value=[{"period_id": "current"}])
    monkeypatch.setattr(okr_provider, "fetch_employee_okrs", fetch)
    relation = {"content_id": "okr", "content_slot": "reference", "reference_kind": "more", "reference_value": "okr"}
    view = SimpleNamespace(name="结果", config={"template": {"content": []}})
    args = (SimpleNamespace(id=1), view, [SimpleNamespace(member_snapshot_id=8)], [], "E1", context(), object())
    assert len(await routes._employee_result_regions(*args)) == 1
    fetch.assert_not_awaited()
    view.config["template"]["content"] = [relation]
    region = (await routes._employee_result_regions(*args))[1]
    assert reads == ["E1"] and region["reference_kind"] == "okr"
    assert region["okr"] == {"period_id": "current"} and region["okrs"] == [region["okr"]]


def test_reference_projection_applies_relation_visibility_without_mutating_source():
    from copy import deepcopy
    from app.performance.self_summary_service import project_reference_content

    source = {
        "content": [{
            "content_id": "summary", "content_slot": "fill", "type": "custom",
            "questionType": "text", "name": "来源模块", "description": "来源说明",
            "settings": {}, "items": [
                {"id": "readonly", "kind": "fill", "label": "只读题", "hint": "题目描述", "settings": {"mode": "view"}},
                {"id": "hidden", "kind": "fill", "label": "隐藏题", "hint": "隐藏描述", "settings": {}},
            ],
        }]
    }
    reference = {
        "content_slot": "reference", "reference_settings": {"content_settings": {
            "summary": {"root": {"allowView": True, "hideName": True, "hideDescription": True},
                        "items": {"readonly": {"allowView": True, "hideName": True, "hideDescription": True},
                                  "hidden": {"allowView": False}}}
        }}
    }
    original = deepcopy((source, reference))
    source_answers = {"readonly": "保留答案", "hidden": "不得返回", "extra": "不得返回"}
    original_answers = deepcopy(source_answers)
    schema, answers = project_reference_content(source, reference, source_answers)
    assert schema[0]["name"] == ""
    assert schema[0]["description"] == ""
    assert [field["id"] for field in schema[0]["fields"]] == ["readonly"]
    field = schema[0]["fields"][0]
    assert field["readonly"] is True
    assert field["label"] == ""
    assert field["placeholder"] == ""
    assert answers == {"readonly": "保留答案"}
    assert source_answers == original_answers
    assert (source, reference) == original

    denied_reference = {"reference_settings": {"content_settings": {"summary": {"root": {"allowView": False}}}}}
    assert project_reference_content(source, denied_reference, {"readonly": "不得返回"}) == ([], {})


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type,question_type,answer", [
    ("work_summary", None, "<p>答案</p>"),
    ("custom", "text", "<p>答案</p>"),
    ("custom", "tag", {"tags": ["a"], "notes": {"a": "<p>答案</p>"}}),
    ("rating", None, "a"),
])
@pytest.mark.parametrize("denial", [None, "root", "item"])
async def test_reference_tabs_project_relation_settings_and_keep_projected_answers(monkeypatch, content_type, question_type, answer, denial):
    from copy import deepcopy
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    content = {
        "content_id": "block", "content_slot": "fill", "type": content_type,
        "questionType": question_type, "name": "模块私有名称", "description": "模块私有描述",
        "items": [
            {"id": "visible", "label": "题目私有名称", "hint": "题目私有描述", "settings": {"mode": "fill"}},
            {"id": "hidden", "label": "隐藏定义", "settings": {"mode": "hidden"}},
        ],
        "options": [{"id": "a", "label": "选项"}],
    }
    relation = {
        "content_slot": "reference", "reference_kind": "node", "reference_value": "source",
        "reference_settings": {"content_settings": {"block": {
            "root": {"allowView": denial != "root", "hideName": True, "hideDescription": True},
            "items": {"visible": {"allowView": denial != "item", "hideName": True, "hideDescription": True},
                      "hidden": {"allowView": True}},
        }}},
    }
    node = SimpleNamespace(node_id="target", node_type="evaluation", config={"template": {"content": [relation]}})
    source_node = SimpleNamespace(id=32, node_id="source", node_type="work_summary", name="来源节点", config={"template": {"content": [content]}})
    task = SimpleNamespace(member_snapshot_id=21, target_employee_no="E001", handler_ref="M001")
    source = SimpleNamespace(id=11, status="completed", submitted_at=datetime.now(UTC), answers={"visible": answer, "hidden": "隐藏答案", "extra": "未知答案"})
    project = SimpleNamespace(id=3)
    before = deepcopy((node.config, source_node.config, source.answers))

    class Db:
        async def get(self, *_args):
            return None

        async def execute(self, statement):
            model = statement.column_descriptions[0]["entity"]
            values = [source_node] if model is PerformanceProjectNodeSnapshot else [source]
            assert model in {PerformanceProjectNodeSnapshot, PerformanceNodeTask}
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))

    tabs = await projects_router._reference_tabs(task, node, project, "M001", Db())
    assert len(tabs) == 1
    tab = tabs[0]
    assert tab["task_id"] == 11
    assert tab["status"] == "completed"
    assert tab["can_remind"] is False
    if denial:
        assert tab["form_schema"] == []
        assert tab["answers"] == {}
    else:
        section = tab["form_schema"][0]
        assert section["name"] == section["description"] == ""
        assert [field["id"] for field in section["fields"]] == ["visible"]
        field = section["fields"][0]
        assert field["label"] == field["placeholder"] == ""
        assert "description" not in field
        assert tab["answers"] == {"visible": answer}
        assert "私有" not in str(tab)
    assert (node.config, source_node.config, source.answers) == before


async def test_reference_tab_prefers_relation_page_name_over_source_stage_name():
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    content = {
        "content_id": "block", "content_slot": "fill", "type": "custom",
        "name": "模块名称", "description": "", "items": [{"id": "visible", "label": "题", "settings": {"mode": "fill"}}],
    }
    relation = {
        "content_slot": "reference", "reference_kind": "node", "reference_value": "source",
        "reference_settings": {"page_name": "引用视图名称", "content_settings": {}},
    }
    node = SimpleNamespace(node_id="target", node_type="evaluation", config={"template": {"content": [relation]}})
    source_node = SimpleNamespace(id=32, node_id="source", node_type="work_summary", name="来源节点", config={"template": {"content": [content]}})
    task = SimpleNamespace(member_snapshot_id=21, target_employee_no="E001", handler_ref="M001")
    source = SimpleNamespace(id=11, status="completed", submitted_at=datetime.now(UTC), answers={"visible": "答"})
    project = SimpleNamespace(id=3)

    class Db:
        async def get(self, *_args):
            return None

        async def execute(self, statement):
            model = statement.column_descriptions[0]["entity"]
            values = [source_node] if model is PerformanceProjectNodeSnapshot else [source]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))

    tabs = await projects_router._reference_tabs(task, node, project, "M001", Db())
    assert tabs[0]["node_name"] == "引用视图名称"
    relation["reference_settings"].pop("page_name")
    tabs = await projects_router._reference_tabs(task, node, project, "M001", Db())
    assert tabs[0]["node_name"] == "来源节点"


def test_task_content_page_name_prefers_snapshot_then_falls_back_without_renaming_node():
    from app.performance.projects_router import _task_content_page_name

    node = SimpleNamespace(name="流程节点名称", config={"template": {"content_page_name": "快照页面名称"}})
    assert _task_content_page_name(node) == "快照页面名称"
    assert node.name == "流程节点名称"
    node.config = {"template": {}}
    assert _task_content_page_name(node) == "流程节点名称"


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
    from app.performance.calibration_service import canonical_flow
    assert PerformanceProjectService.serialize(target)["flow_settings"] == canonical_flow(normalized, target.id)


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


def test_calibration_phase_times_drop_orphan_entries_without_calibration_config():
    # 历史残留：node_times 带 phase_times 但 node_settings 无对应校准配置，直接收敛不报错
    flow = calibration_phase_time_settings()
    flow["node_times"]["orphan-node"] = {"start_at": "", "end_at": "", "phase_times": {"phase-1": {"start_at": "2026-10-01T09:00+08:00", "end_at": "2026-10-05T18:00+08:00"}}}
    normalized = PerformanceProjectService._validate_flow_settings(flow)
    assert "phase_times" not in normalized["node_times"]["orphan-node"]
    # 节点存在于 node_settings 但 calibration 为空（无 phases）时同样收敛
    flow2 = calibration_phase_time_settings()
    flow2["node_settings"]["calibration-1"] = {}
    flow2["node_times"]["calibration-1"] = {"phase_times": {"phase-1": {"start_at": "", "end_at": ""}}}
    normalized2 = PerformanceProjectService._validate_flow_settings(flow2)
    assert "phase_times" not in normalized2["node_times"]["calibration-1"]


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
        "configuration_completed": True,
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
        async def refresh(self, _obj, **kwargs):
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
        async def refresh(self, _obj, **kwargs):
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
        async def rollback(self):
            pass
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
    from app.performance.calibration_service import CalibrationConflict
    with pytest.raises(CalibrationConflict) as error:
        await service.update_project(target, {"flow_settings": {"node_settings": {}}}, actor_type="PORTAL_USER", actor_id=1)
    assert error.value.code == "CALIBRATION_PHASE_CLOSED"


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


def test_cr013_calibration_canonical_read_and_explicit_delete_contract():
    from copy import deepcopy
    from datetime import UTC, datetime, timedelta
    from app.performance.calibration_service import canonical_flow, calibration_digest, validate_calibration_change, CalibrationConflict
    target = project("STARTED")
    now = datetime.now(UTC)
    old = _calibration_rules("PROJECT_ALL")
    old["node_settings"]["calibration-1"]["calibration"]["phases"][0].pop("phase_id")
    old["node_times"] = {"calibration-1": {"phase_times": {"phase-1": {"start_at": (now-timedelta(hours=1)).isoformat(), "end_at": (now+timedelta(hours=1)).isoformat()}}}}
    target.settings = {"flow_settings": old}
    response = PerformanceProjectService.serialize(target)
    canonical = response["flow_settings"]
    assert old["node_settings"]["calibration-1"]["calibration"]["phases"][0].get("phase_id") is None
    assert calibration_digest(old, target.id) == response["calibration_base_digest"] == calibration_digest(canonical, target.id)
    assert validate_calibration_change(target, old, canonical, [], None, now)[2] is False
    rule = canonical["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"][0]
    deleted = deepcopy(canonical)
    deleted["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"] = []
    operation = {"operation": "delete_rule", "node_id": "calibration-1", "phase_id": "phase-1", "rule_id": rule["rule_id"]}
    assert validate_calibration_change(target, canonical, deleted, [operation], response["calibration_base_digest"], now)[2]
    with pytest.raises(CalibrationConflict) as error:
        validate_calibration_change(target, canonical, deleted, [], None, now)
    assert error.value.code == "CALIBRATION_OPERATIONS_MISMATCH"
    with pytest.raises(CalibrationConflict) as error:
        validate_calibration_change(target, canonical, deleted, [operation], "stale", now)
    assert error.value.code == "CALIBRATION_BASE_CONFLICT"


def test_cr013_calibration_old_window_and_cross_node_distribution_guard():
    from copy import deepcopy
    from datetime import UTC, datetime, timedelta
    from app.performance.calibration_service import canonical_flow, validate_calibration_change, editing_policy, CalibrationConflict
    target = project("STARTED")
    now = datetime.now(UTC)
    old = canonical_flow(_calibration_rules("PROJECT_ALL"), target.id)
    old["node_settings"]["other"] = deepcopy(old["node_settings"]["calibration-1"])
    old["node_times"] = {"calibration-1": {"phase_times": {"first": {"start_at": (now-timedelta(hours=2)).isoformat(), "end_at": (now-timedelta(hours=1)).isoformat()}}}, "other": {"phase_times": {"first": {"start_at": (now+timedelta(hours=1)).isoformat(), "end_at": (now+timedelta(hours=2)).isoformat()}}}}
    assert not editing_policy(target, old, now)["calibration_nodes"]["other"]["can_edit_distribution"]
    new = deepcopy(old)
    new["node_times"]["calibration-1"]["phase_times"]["first"]["end_at"] = (now+timedelta(days=1)).isoformat()
    rule = new["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"].pop()
    operation = {"operation": "delete_rule", "node_id": "calibration-1", "phase_id": "first", "rule_id": rule["rule_id"]}
    with pytest.raises(CalibrationConflict) as error:
        validate_calibration_change(target, old, new, [operation], None, now)
    assert error.value.code == "CALIBRATION_PHASE_CLOSED"
    new = deepcopy(old)
    new["node_settings"]["other"]["calibration"]["force_distribution_enabled"] = True
    with pytest.raises(CalibrationConflict) as error:
        validate_calibration_change(target, old, new, [], None, now)
    assert error.value.code == "CALIBRATION_DISTRIBUTION_STARTED"


@pytest.mark.asyncio
async def test_cr013_calibration_delta_overlap_revoke_and_readd_preserves_history():
    from copy import deepcopy
    from datetime import UTC, datetime, timedelta
    from app.performance.calibration_service import canonical_flow, resolve_calibration, apply_calibration_delta, calibration_task_scope
    from app.performance.models import PerformanceNodeTask, PerformanceNodeTaskAuthorization
    now = datetime.now(UTC)
    target = project("STARTED")
    target.evaluated_count = 1
    old = canonical_flow(_calibration_rules("PROJECT_ALL"), target.id)
    phase = old["node_settings"]["calibration-1"]["calibration"]["phases"][0]
    phase["rules"][0]["allow_authorize"] = True
    phase["rules"].append({**deepcopy(phase["rules"][0]), "rule_id": "second-rule", "allow_authorize": False})
    old["node_times"] = {"calibration-1": {"phase_times": {"first": {"start_at": (now-timedelta(hours=1)).isoformat(), "end_at": (now+timedelta(hours=1)).isoformat()}}}}
    people = _calibration_people()
    member = people["E1"]
    node = SimpleNamespace(id=4, project_id=target.id, node_id="calibration-1", node_type="calibration", config={"calibration": resolve_calibration({"node_id": "calibration-1"}, old, people, ["E1"])})
    task = PerformanceNodeTask(id=9, project_id=target.id, cycle_ref=target.cycle_ref, member_snapshot_id=3, node_snapshot_id=4, target_employee_no="E1", handler_ref="C1", task_kind="calibration", phase_id="first", status="completed", answers={"value": "A"}, draft_answers={"value": "B"}, answer_version=7, submitted_at=now, completed_at=now)
    delegation = PerformanceNodeTaskAuthorization(id=8, task_id=9, project_id=target.id, cycle_ref=target.cycle_ref, authorization_type="AUTHORIZE", grantor_employee_no="C1", recipient_employee_no="M1", status="ACTIVE")
    class Db:
        def __init__(self):
            self.added = []
        async def scalar(self, query):
            return SimpleNamespace(id=3, source_snapshot_id=2, source_filter={"task_generation_employee_nos": ["E1"]})
        async def execute(self, query):
            text = str(query)
            if "FROM performance_project_node_snapshots" in text:
                rows = [node]
            elif "FROM performance_project_members" in text:
                rows = [member]
            elif "FROM performance_authorization_snapshot_people" in text:
                rows = list(people.values())
            elif "FROM performance_node_task_authorizations" in text:
                rows = [delegation] if delegation.status == "ACTIVE" else []
            else:
                rows = [task] if task.revoked_at is None else []
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))
        def add(self, row):
            self.added.append(row)
        async def flush(self):
            pass
    legacy_frozen = node.config["calibration"]["phases"][0]
    legacy_frozen.pop("rule_sources")
    for item in legacy_frozen["assignments"]:
        item.pop("source_rule_ids")
    db = Db()
    new = deepcopy(old)
    new["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"].pop(0)
    outcome, recipients = await apply_calibration_delta(db, target, old, new, actor_type="PORTAL_USER", actor_id=1)
    assert outcome["added_tasks"] == outcome["revoked_tasks"] == 0 and not recipients
    assert node.config["calibration"]["phases"][0]["rule_sources"][0]["rule_id"] == "second-rule"
    assert task.revoked_at is None and delegation.status == "REVOKED"
    assert calibration_task_scope(task, node)
    removed = deepcopy(new)
    removed["node_settings"]["calibration-1"]["calibration"]["phases"][0]["rules"] = []
    outcome, recipients = await apply_calibration_delta(db, target, new, removed, actor_type="PORTAL_USER", actor_id=1)
    assert outcome["revoked_tasks"] == 1 and recipients == {"C1"}
    assert task.answers == {"value": "A"} and task.draft_answers == {"value": "B"}
    assert task.status == "completed" and task.answer_version == 7 and task.submitted_at == now
    assert not calibration_task_scope(task, node)
    outcome, _ = await apply_calibration_delta(db, target, removed, new, actor_type="PORTAL_USER", actor_id=1)
    fresh = [row for row in db.added if isinstance(row, PerformanceNodeTask)]
    assert outcome["added_tasks"] == 1 and len(fresh) == 1
    assert fresh[0] is not task and fresh[0].status == "pending" and not fresh[0].answers
    assert task.revoked_at is not None and delegation.status == "REVOKED"


@pytest.fixture
def calibration_content_data(monkeypatch):
    from copy import deepcopy
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.calibration_service import calibration_template
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    content = {"content_id": "content", "type": "custom", "items": [
        {"id": "locked", "kind": "fill", "questionType": "text"},
        {"id": "editable", "kind": "fill", "questionType": "text"},
        {"id": "grade", "kind": "rating", "options": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}]},
        {"id": "hidden", "kind": "fill", "settings": {"mode": "hidden"}},
    ]}
    final = SimpleNamespace(id=11, project_id=3, node_id="final", node_type="evaluation", config={"template": {"include_final_result": True, "content": [content]}})
    raw = {"node_id": "cal", "calibration_settings": {"content": {"items": {"locked": {"allowModify": False}}}}}
    calibration = SimpleNamespace(id=12, project_id=3, node_id="cal", node_type="calibration", config={
        "template": calibration_template(raw, final.config["template"], []),
        "calibration": {"role_code": "assessment.calibrator", "phases": [
            {"phase_id": phase, "assignments": [{"handler_ref": "C1", "employee_no": "E1"}, {"handler_ref": "C2", "employee_no": "E1"}]}
            for phase in ("first", "second", "third")
        ]},
    })
    now = datetime.now(UTC)
    def make_task(task_id, node_id=11, **values):
        return SimpleNamespace(**{**dict(id=task_id, project_id=3, cycle_ref="cycle:one", member_snapshot_id=7,
            node_snapshot_id=node_id, target_employee_no="E1", handler_ref="M1" if node_id == 11 else "C1",
            task_kind="evaluation" if node_id == 11 else "calibration", phase_id="" if node_id == 11 else "first",
            revoked_at=None, status="completed", submitted_at=now, completed_at=now, available_at=None, due_at=None,
            answers={"locked": "trusted", "editable": "original", "grade": "a", "hidden": "secret", "unknown": "secret"},
            draft_answers=None, answer_version=1), **values})
    task = make_task(20, 12, answers={}, status="pending", submitted_at=None)
    class Db:
        def __init__(self):
            self.tasks = [make_task(10), task]
            self.nodes = [final, calibration]
            self.queries = []
            self.added = []
            self.commits = 0
        async def execute(self, query):
            self.queries.append(query)
            params = query.compile().params
            model = query.column_descriptions[0]["entity"]
            if model is PerformanceNodeTask:
                rows = [candidate for candidate in self.tasks if all(getattr(candidate, key[:-2]) == value for key, value in params.items()) and candidate.revoked_at is None]
            elif model is PerformanceProjectNodeSnapshot:
                rows = [candidate for candidate in self.nodes if candidate.project_id == params["project_id_1"]]
            else:
                raise AssertionError(model)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))
        async def get(self, *_args):
            return None
        async def commit(self):
            self.commits += 1
        def add(self, value):
            self.added.append(value)
    async def fake_task(*_args):
        return task, calibration
    async def sync(*_args):
        pass
    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    monkeypatch.setattr(projects_router, "_sync_automatic_openings", sync)
    return SimpleNamespace(routes=projects_router, db=Db(), task=task, node=calibration, final=final, make_task=make_task, deepcopy=deepcopy)


@pytest.mark.asyncio
async def test_calibration_reads_final_answers_without_writing_and_filters_source_scope(calibration_content_data):
    data = calibration_content_data
    for values in ({"project_id": 9}, {"cycle_ref": "other"}, {"member_snapshot_id": 8}, {"target_employee_no": "E2"}, {"revoked_at": data.make_task(1).submitted_at}):
        data.db.tasks.append(data.make_task(30 + len(data.db.tasks), answers={"locked": "wrong"}, **values))
    schema, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert answers == {"locked": "trusted", "editable": "original", "grade": "a"}
    assert schema[0]["fields"][0]["readonly"] is True
    assert data.task.answers == {} and not data.db.added and data.db.commits == 0
    sql = str(data.db.queries[0])
    for name in ("project_id", "cycle_ref", "member_snapshot_id", "target_employee_no", "revoked_at"):
        assert name in sql


@pytest.mark.asyncio
@pytest.mark.parametrize("submit", [False, True])
async def test_calibration_save_preserves_trusted_readonly_and_reopens_without_source(calibration_content_data, submit):
    data = calibration_content_data
    payload = data.routes.SelfSummaryAnswersPayload(answers={"locked": "forged", "editable": "changed", "hidden": "forged", "unknown": "forged"}, version=1)
    result = await data.routes._save_self_summary(data.task.id, payload, submit, context(), data.db, "evaluation")
    assert data.task.answers == {"locked": "trusted", "editable": "changed" if submit else "original", "grade": "a"}
    assert result["answers"] == data.task.answers
    assert data.task.draft_answers == (None if submit else {"editable": "changed", "grade": "a"})
    assert data.task.answer_version == 2
    assert data.db.added[-1].event_type == ("CALIBRATION_ADJUSTED" if submit else "CALIBRATION_DRAFT_SAVED")
    data.db.tasks.clear()
    _, reopened = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert reopened == data.task.answers
    if not submit:
        await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": "submitted", "locked": "forged"}, version=2), True, context(), data.db, "evaluation")
        assert data.task.answers == {"locked": "trusted", "editable": "submitted", "grade": "a"}
        assert data.task.draft_answers is None


@pytest.mark.asyncio
@pytest.mark.parametrize("case,code", [("missing", "CALIBRATION_SOURCE_NOT_READY"), ("pending", "CALIBRATION_SOURCE_NOT_READY"), ("draft", "CALIBRATION_SOURCE_NOT_READY"), ("empty", "CALIBRATION_SOURCE_NOT_READY"), ("different", "CALIBRATION_SOURCE_CONFLICT"), ("missing-value", "CALIBRATION_SOURCE_CONFLICT"), ("ambiguous-final", "CALIBRATION_SOURCE_CONFLICT")])
async def test_calibration_source_blocks_unready_or_conflicting_results(calibration_content_data, case, code):
    from fastapi import HTTPException
    data = calibration_content_data
    if case == "missing":
        data.db.tasks = [data.task]
    elif case in {"pending", "draft"}:
        data.db.tasks[0].status = "pending"
        data.db.tasks[0].submitted_at = None
        data.db.tasks[0].draft_answers = {"editable": "not submitted"}
    elif case == "empty":
        data.db.tasks[0].answers = {}
    elif case in {"different", "missing-value"}:
        answers = {**data.db.tasks[0].answers, "editable": "different"}
        if case == "missing-value":
            answers.pop("editable")
        data.db.tasks.append(data.make_task(13, answers=answers))
    else:
        other = data.deepcopy(data.final)
        other.id = 99
        data.db.nodes.append(other)
    with pytest.raises(HTTPException) as error:
        await data.routes._task_visible_content(data.task, data.node, data.db)
    assert (error.value.status_code, error.value.detail) == (409, code)
    with pytest.raises(HTTPException) as error:
        await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": "forged replacement"}, version=1), True, context(), data.db, "evaluation")
    assert error.value.detail == code
    assert data.task.answers == {} and data.task.answer_version == 1 and data.db.commits == 0


@pytest.mark.asyncio
async def test_calibration_multiple_final_reviewers_must_agree_on_visible_projection(calibration_content_data):
    data = calibration_content_data
    data.db.tasks.append(data.make_task(13, answers={**data.db.tasks[0].answers, "hidden": "other hidden", "unknown": "ignored"}))
    _, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert answers == {"locked": "trusted", "editable": "original", "grade": "a"}


@pytest.mark.asyncio
@pytest.mark.parametrize("case,expected", [("nearest", "previous"), ("skip-empty", "previous"), ("pending", "CALIBRATION_SOURCE_NOT_READY"), ("conflict", "CALIBRATION_SOURCE_CONFLICT"), ("agree", "previous"), ("revoked", "original")])
async def test_calibration_phase_inherits_nearest_valid_completed_phase(calibration_content_data, case, expected):
    from fastapi import HTTPException
    data = calibration_content_data
    data.task.phase_id = "third"
    first = data.make_task(21, 12, answers={"locked": "trusted", "editable": "previous", "grade": "b"})
    first.phase_id = "second" if case != "skip-empty" else "first"
    data.db.tasks.append(first)
    if case == "pending":
        first.submitted_at = None
        first.status = "pending"
        first.draft_answers = {"editable": "draft"}
    if case in {"conflict", "agree"}:
        data.db.tasks.append(data.make_task(22, 12, phase_id="second", handler_ref="C2", answers={**first.answers, "editable": "different" if case == "conflict" else "previous"}))
    if case == "revoked":
        first.revoked_at = first.submitted_at
    if expected.startswith("CALIBRATION_"):
        with pytest.raises(HTTPException) as error:
            await data.routes._task_visible_content(data.task, data.node, data.db)
        assert error.value.detail == expected
    else:
        _, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
        assert answers["editable"] == expected
        assert answers["grade"] == ("a" if case == "revoked" else "b")


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["type", "options", "repeatable", "hidden"])
async def test_calibration_source_schema_mismatch_fails_closed(calibration_content_data, change):
    from fastapi import HTTPException
    data = calibration_content_data
    content = data.final.config["template"]["content"][0]
    if change == "type":
        content["items"][1]["kind"] = "rating"
    elif change == "options":
        content["items"][2]["options"] = [{"id": "other"}]
    elif change == "repeatable":
        content["settings"] = {"allowMultiple": True}
    else:
        content["items"][0]["settings"] = {"mode": "hidden"}
    with pytest.raises(HTTPException) as error:
        await data.routes._task_visible_content(data.task, data.node, data.db)
    assert error.value.detail == "CALIBRATION_SOURCE_CONFLICT"


@pytest.mark.asyncio
async def test_calibration_http_detail_submit_and_reopen(calibration_content_data, monkeypatch):
    from unittest.mock import AsyncMock
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from app.core.db import get_session
    from app.performance.auth_context import get_performance_access_context
    data = calibration_content_data
    data.node.name = "Calibration"
    monkeypatch.setattr(data.db, "scalar", AsyncMock(return_value=None), raising=False)
    monkeypatch.setattr(data.routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="C1", actor_type="EMPLOYEE")))
    monkeypatch.setattr(data.routes, "resolve_subject_visibility_role", AsyncMock(return_value="other"))
    monkeypatch.setattr(data.routes, "load_subject_visibility_rules", AsyncMock(return_value={"other": []}))
    app = FastAPI()
    app.include_router(data.routes.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: data.db
    app.dependency_overrides[get_performance_access_context] = lambda: context()
    path = f"/api/v1/performance/tasks/{data.task.id}/template-task"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(path)
        assert response.status_code == 200, response.text
        assert response.json()["answers"] == {"locked": "trusted", "editable": "original", "grade": "a"}
        assert response.json()["phase_id"] == "first"
        assert data.task.answers == {}
        response = await client.post(path + "/submit", json={"answers": {"locked": "forged", "editable": "submitted", "grade": "b"}, "version": 1})
        assert response.status_code == 200, response.text
        assert response.json()["answers"] == {"locked": "trusted", "editable": "submitted", "grade": "b"}
        data.db.tasks[0].answers = {"editable": "upstream changed"}
        response = await client.get(path)
        assert response.status_code == 200, response.text
        assert response.json()["answers"] == {"locked": "trusted", "editable": "submitted", "grade": "b"}


@pytest.mark.asyncio
async def test_calibration_keeps_optional_missing_fields_and_validates_required_payload(calibration_content_data):
    from fastapi import HTTPException
    data = calibration_content_data
    data.db.tasks[0].answers = {"locked": "trusted"}
    data.node.config["template"]["content"][0]["items"][1]["settings"] = {"required": True}
    _, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert answers == {"locked": "trusted"}
    with pytest.raises(HTTPException) as error:
        await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={}, version=1), True, context(), data.db, "evaluation")
    assert error.value.detail == {"code": "VALIDATION_FAILED", "field_id": "editable"}
    assert data.task.answers == {} and data.task.answer_version == 1
    result = await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": "completed", "grade": "forged-option"}, version=1), True, context(), data.db, "evaluation")
    assert result["answers"] == {"locked": "trusted", "editable": "completed"}


@pytest.mark.asyncio
async def test_calibration_version_conflict_prevents_source_read_and_write(calibration_content_data):
    from fastapi import HTTPException
    data = calibration_content_data
    with pytest.raises(HTTPException) as error:
        await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": "bad"}, version=2), True, context(), data.db, "evaluation")
    assert error.value.detail == "VERSION_CONFLICT"
    assert not data.db.queries and not data.db.commits and data.task.answers == {}


@pytest.mark.asyncio
async def test_calibration_source_uses_real_project_lock_and_refreshes_before_read(calibration_content_data, monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance.models import PerformanceNodeTask
    from app.performance.authorization_service import PerformanceAuditService
    from fastapi import HTTPException
    data = calibration_content_data
    real = PerformanceNodeTask(**vars(data.task))
    events = []
    async def task_for_actor(*_args):
        return real, data.node
    async def scalar(query):
        assert query._for_update_arg is not None
        events.append("project-lock")
        return None
    async def refresh(row, **kwargs):
        events.append("task-refresh" if row is real else "node-refresh")
        if row is real:
            assert kwargs["with_for_update"] is True
            real.answer_version = 2
    monkeypatch.setattr(data.routes, "_self_summary_task", task_for_actor)
    monkeypatch.setattr(data.routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="C1", actor_type="EMPLOYEE")))
    monkeypatch.setattr(data.routes, "_task_edit_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(data.db, "scalar", scalar, raising=False)
    monkeypatch.setattr(data.db, "refresh", refresh, raising=False)
    with pytest.raises(HTTPException) as error:
        await data.routes._save_self_summary(real.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": "stale"}, version=1), True, context(), data.db, "evaluation")
    assert error.value.detail == "VERSION_CONFLICT"
    assert events == ["project-lock", "node-refresh", "task-refresh"]
    assert not data.db.queries and not data.db.commits
    monkeypatch.setattr(PerformanceAuditService, "append_event", lambda self, event: data.db.added.append(event))
    result = await data.routes._save_self_summary(real.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": "saved"}, version=2), True, context(), data.db, "evaluation")
    assert result["answers"] == {"locked": "trusted", "editable": "saved", "grade": "a"}
    assert real.answer_version == 3 and data.db.commits == 1


@pytest.mark.asyncio
async def test_calibration_refuses_submission_of_entirely_empty_result(calibration_content_data):
    from fastapi import HTTPException
    data = calibration_content_data
    data.db.tasks[0].answers = {"editable": "original"}
    with pytest.raises(HTTPException) as error:
        await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={"editable": ""}, version=1), True, context(), data.db, "evaluation")
    assert error.value.detail == "CALIBRATION_SOURCE_NOT_READY"
    assert data.task.answers == {} and not data.db.commits


@pytest.mark.asyncio
async def test_calibration_legacy_partial_result_backfills_only_missing_readonly_on_save(calibration_content_data):
    data = calibration_content_data
    data.task.answers = {"editable": "historical-adjustment"}
    data.task.status = "completed"
    data.task.submitted_at = data.make_task(1).submitted_at
    _, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert answers == {"locked": "trusted", "editable": "historical-adjustment"}
    assert data.task.answers == {"editable": "historical-adjustment"}
    result = await data.routes._save_self_summary(data.task.id, data.routes.SelfSummaryAnswersPayload(answers={"locked": "forged", "editable": "updated"}, version=1), True, context(), data.db, "evaluation")
    assert result["answers"] == {"locked": "trusted", "editable": "updated"}
    assert data.task.answers == result["answers"]


@pytest.mark.asyncio
@pytest.mark.parametrize("existing", ["", "kept", None])
async def test_calibration_legacy_existing_readonly_key_never_reverts_to_source(calibration_content_data, existing):
    data = calibration_content_data
    data.task.answers = {"locked": existing, "editable": "historical-adjustment"}
    data.task.answer_version = 2
    data.db.tasks.clear()
    _, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert "locked" in answers and answers["locked"] == existing
    assert answers["editable"] == "historical-adjustment"
    assert "grade" not in answers and not data.db.queries


@pytest.mark.asyncio
@pytest.mark.parametrize("case,code", [("missing", "CALIBRATION_SOURCE_NOT_READY"), ("conflict", "CALIBRATION_SOURCE_CONFLICT")])
async def test_calibration_legacy_missing_readonly_requires_trustworthy_source(calibration_content_data, case, code):
    from fastapi import HTTPException
    data = calibration_content_data
    data.task.answers = {"editable": "historical-adjustment"}
    data.task.answer_version = 2
    if case == "missing":
        data.db.tasks = [data.task]
    else:
        data.db.tasks.append(data.make_task(30, answers={**data.db.tasks[0].answers, "locked": "different"}))
    with pytest.raises(HTTPException) as error:
        await data.routes._task_visible_content(data.task, data.node, data.db)
    assert error.value.detail == code
    assert data.task.answers == {"editable": "historical-adjustment"} and not data.db.commits


@pytest.mark.asyncio
async def test_calibration_legacy_optional_readonly_absent_in_source_stays_absent(calibration_content_data):
    data = calibration_content_data
    data.task.answers = {"editable": "historical-adjustment"}
    data.task.answer_version = 2
    data.db.tasks[0].answers.pop("locked")
    _, answers = await data.routes._task_visible_content(data.task, data.node, data.db)
    assert answers == {"editable": "historical-adjustment"}
    assert data.task.answers == answers


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
    from app.performance.models import PerformanceCycle
    class Db:
        async def scalar(self, statement):
            if statement.column_descriptions[0]["entity"] is PerformanceCycle:
                return SimpleNamespace(template_ids=[11, 12])
            key = next(iter(statement.compile().params.values()))
            return SimpleNamespace(template_kind="performance", status="active" if key == 11 else "inactive")

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
async def test_project_hrbp_global_rules_apply_to_data_scope_without_overriding_admin_union(statistics_db, monkeypatch):
    from app.performance import projects_router, hrbp_scope_service
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people

    db = statistics_db
    _configure_data_manager_hrbp(db)
    original_get = db.get
    setting = SimpleNamespace(hrbp_invisible_rules=[{"conditions": [{"field": "employee", "operator": "include", "values": ["CHILD"]}]}], hrbp_invisible_people=[], hrbp_invisible_scope_enabled=False)

    async def get(model, identity):
        if model is PerformanceOtherPermissionSetting:
            return setting
        return await original_get(model, identity)

    async def roster(_db):
        return build_snapshot_people([RosterAuthorizationInput(no, no) for no in ["VISIBLE", "CHILD", "HIDDEN"]])

    monkeypatch.setattr(db, "get", get)
    monkeypatch.setattr(hrbp_scope_service, "load_hrbp_roster_people", roster)
    target = db.projects[0]
    assert await projects_router._project_data_scope(context(), target, db, "performance.frontend.data-view") == {"VISIBLE"}
    setting.hrbp_invisible_rules = []
    assert await projects_router._project_data_scope(context(), target, db, "performance.frontend.data-view") == {"VISIBLE", "CHILD"}
    setting.hrbp_invisible_rules = [{"conditions": [{"field": "employee", "operator": "include", "values": ["VISIBLE", "CHILD"]}]}]
    target.settings["data_managers"] = ["PROJECT_ADMIN", "HRBP"]
    target.administrators = ["管理员"]
    assert await projects_router._project_data_scope(context(), target, db, "performance.frontend.data-view") is None


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

    node = SimpleNamespace(id=31, node_id="review", node_type="evaluation", name="自评", config={"template": {"executor_types": ["SUBJECT"]}})
    values = {
        PerformanceProjectMember: [SimpleNamespace(employee_no=no) for no in ["VISIBLE", "HIDDEN"]],
        PerformanceProjectNodeSnapshot: [node],
        PerformanceNodeTask: [SimpleNamespace(node_snapshot_id=31, target_employee_no="VISIBLE", status="pending", submitted_at=None, available_at=None, due_at=None), SimpleNamespace(node_snapshot_id=31, target_employee_no="HIDDEN", status="completed", submitted_at=True)],
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


def test_timeline_node_state_is_time_driven():
    from datetime import UTC, datetime

    from app.performance.projects_router import _timeline_node_state

    now = datetime(2026, 10, 29, tzinfo=UTC)
    assert _timeline_node_state("2026-11-01T00:00:00+00:00", "2026-11-10T00:00:00+00:00", now) == "not_started"
    assert _timeline_node_state("2026-10-01T00:00:00+00:00", "2026-11-10T00:00:00+00:00", now) == "in_progress"
    assert _timeline_node_state("2026-10-01T00:00:00+00:00", "2026-10-10T00:00:00+00:00", now) == "ended"
    assert _timeline_node_state(None, None, now) == "unscheduled"


@pytest.mark.asyncio
async def test_communication_progress_counts_invited_and_voluntary_people_once():
    from app.performance import projects_router

    reviewer = SimpleNamespace(config={"template": {"executor_role_code": "assessment.reviewer_360"}})
    manager = SimpleNamespace(config={"template": {"executor_role_code": "assessment.line_manager"}})
    def task(handler, completed=False):
        return SimpleNamespace(target_employee_no="E1", handler_ref=handler, status="completed" if completed else "pending", submitted_at=None)
    class Db:
        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_node_tasks.project_id = 7" in sql
            assert "performance_node_tasks.cycle_ref = 'C1'" in sql
            assert "performance_node_tasks.task_kind = 'evaluation'" in sql
            return SimpleNamespace(all=lambda: [(task("invited", True), reviewer), (task("voluntary"), reviewer), (task("invited"), reviewer), (task("manager", True), manager)])
    assert await projects_router._communication_progress(Db(), SimpleNamespace(id=7, cycle_ref="C1"), {"E1", "E2"}) == {"E1": "1/2", "E2": "0/0"}


@pytest.mark.asyncio
async def test_communication_progress_detail_joins_member_snapshot_for_person_names_and_dimission():
    from app.performance import projects_router

    reviewer = SimpleNamespace(config={"template": {"executor_role_code": "assessment.reviewer_360"}})
    def task(handler, completed=False):
        return SimpleNamespace(target_employee_no="E1", handler_ref=handler, status="completed" if completed else "pending", submitted_at=None)
    class Db:
        def __init__(self):
            self.calls = 0
        async def execute(self, query):
            self.calls += 1
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            if self.calls == 1:  # 节点任务查询
                assert "performance_node_tasks.project_id = 7" in sql
                return SimpleNamespace(all=lambda: [(task("H1", True), reviewer), (task("H2"), reviewer)])
            if self.calls == 2:  # 最新成员快照查询（project_id 在 member_snapshots 表上）
                assert "performance_project_member_snapshots" in sql
                assert "performance_project_members" not in sql
                assert sql.index("max(performance_project_member_snapshots.id)") < sql.index("performance_project_member_snapshots.project_id = 7")
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [5]))
            # 评估人 person join
            assert "performance_authorization_snapshot_people" in sql
            assert "performance_project_member_snapshots.id IN (5)" in sql
            return SimpleNamespace(all=lambda: [
                (5, "H1", "邓超", "在职", "在职"),
                (5, "H2", "张玉柱", None, "离职"),
            ])
    result = await projects_router._communication_progress_detail(Db(), SimpleNamespace(id=7, cycle_ref="C1"), {"E1"})
    assert result["E1"] == {
        "completion": "1/2",
        "evaluated": [{"name": "邓超", "dimission": False}],
        "pending": [{"name": "张玉柱", "dimission": True}],
        "dimission_count": 1,
        "invite_stage": "in_progress",
    }


@pytest.mark.asyncio
async def test_previous_published_level_uses_latest_employee_release_without_live_fallback():
    from app.performance import projects_router
    current = SimpleNamespace(start_at="2026-11-01")
    newer, older = SimpleNamespace(id=9), SimpleNamespace(id=8)
    def opening(employee, level):
        return SimpleNamespace(employee_no=employee, published_position_level=level)
    class Db:
        async def scalar(self, query):
            return current
        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_cycles.start_at < '2026-11-01'" in sql
            assert "ORDER BY performance_cycles.start_at DESC" in sql
            return SimpleNamespace(all=lambda: [(opening("E1", None), newer), (opening("E1", "P5"), older), (opening("E2", "P6"), newer), (opening("E3", "P6"), newer), (opening("E3", "P7"), newer)])
    assert await projects_router._previous_published_position_levels(Db(), SimpleNamespace(cycle_ref="C1"), {"E1", "E2", "E3"}) == {"E1": None, "E2": "P6", "E3": None}


@pytest.mark.asyncio
async def test_result_opening_freezes_position_and_does_not_overwrite_existing(monkeypatch):
    from app.performance import projects_router
    recorded = []
    monkeypatch.setattr(projects_router.PerformanceAuditService, "append_event", lambda self, event: recorded.append(event))
    class Db:
        async def scalar(self, statement):
            assert statement.compile().params["published_position_level"] == "P6"
            assert "ON CONFLICT (project_id, employee_no) DO NOTHING" in str(statement)
            return 1
    assert await projects_router._open_result(Db(), SimpleNamespace(id=1, cycle_ref="C1"), "E1", actor_type="EMPLOYEE", actor_ref="M1", tasks=[], final=SimpleNamespace(id=2), member=SimpleNamespace(position_level="P6"))
    assert recorded[0].after_state["published_position_level"] == "P6"


@pytest.mark.asyncio
async def test_result_communication_template_task_keeps_identity_and_target_authorization(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router
    task = SimpleNamespace(id=1, handler_ref="M1", task_kind="result_communication", target_employee_no="E1", cycle_ref="C1")
    node = SimpleNamespace(node_type="result_communication")
    class Db:
        async def execute(self, query):
            return SimpleNamespace(first=lambda: (task, node), scalars=lambda: SimpleNamespace(all=lambda: []))
    async def actor(db, context, **kwargs):
        return SimpleNamespace(actor_ref="M1")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    assert await projects_router._self_summary_task(1, context(), Db(), "evaluation") == (task, node)
    assert projects_router._task_entry_mode(task) == "template_task"
    task.handler_ref = "OTHER"
    with pytest.raises(HTTPException) as denied:
        await projects_router._self_summary_task(1, context(), Db(), "evaluation")
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_calibration_people_rejects_non_frozen_assignment_and_filters_phase(monkeypatch):
    from app.performance import projects_router
    async def actor(db, context):
        return SimpleNamespace(actor_ref="CAL")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    node = SimpleNamespace(project_id=1, node_type="calibration", config={"calibration": {"role_code": "assessment.calibrator", "phases": [{"phase_id": "p1", "assignments": [{"handler_ref": "CAL", "employee_no": "E1"}]}]}})
    def task(employee):
        return SimpleNamespace(id=1, project_id=1, task_kind="calibration", phase_id="p1", handler_ref="CAL", target_employee_no=employee)
    class Db:
        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_node_tasks.phase_id = 'p1'" in sql
            return SimpleNamespace(all=lambda: [(task("E2"), node, None)])
        async def get(self, model, key):
            return None
    assert await projects_router.workbench_task_people("cal", 1, "all", context(), Db(), phase_id="p1") == []



def test_published_position_migration_round_trip_and_history_guard():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = Path(__file__).resolve().parents[1] / "alembic/versions/0288_performance_published_position_level.py"
    spec = importlib.util.spec_from_file_location("published_position_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE performance_result_openings (id INTEGER PRIMARY KEY, employee_no TEXT)"))
        connection.execute(text("INSERT INTO performance_result_openings VALUES (1, 'E1')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.scalar(text("SELECT published_position_level FROM performance_result_openings WHERE id=1")) is None
            migration.downgrade()
            migration.upgrade()
            connection.execute(text("UPDATE performance_result_openings SET published_position_level='P6' WHERE id=1"))
            with pytest.raises(RuntimeError, match="历史结果证据"):
                migration.downgrade()
            assert connection.scalar(text("SELECT published_position_level FROM performance_result_openings WHERE id=1")) == "P6"
    engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,role", [
    ("evaluation", "assessment.reviewer_360"),
    ("evaluation", "assessment.line_manager"),
    ("work_summary", "assessment.reviewee"),
    ("result_communication", "assessment.line_manager"),
    ("calibration", "assessment.calibrator"),
    ("result_reconsideration", "assessment.line_manager"),
])
@pytest.mark.parametrize("scenario", ["visible", "hidden", "missing_name", "missing_member", "no_supervisor"])
async def test_task_detail_uses_source_snapshot_supervisor_name(monkeypatch, kind, role, scenario):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    from app.performance import reconsideration_service
    from app.performance.models import PerformanceProject, PerformanceProjectMember

    member = PerformanceProjectMember(
        id=1, snapshot_id=7, employee_no="E1", display_name="员工",
        direct_supervisor_employee_no=None if scenario == "no_supervisor" else "M1",
    ) if scenario != "missing_member" else None
    task = SimpleNamespace(
        id=9, project_id=3, member_snapshot_id=7, target_employee_no="E1",
        task_kind=kind, handler_ref="REVIEWER", submitted_at=None, status="pending",
        answer_version=1, answers={}, available_at=None, due_at=None, phase_id="",
    )
    node = SimpleNamespace(node_id="node", node_type=kind, name="评估", config={"template": {"executor_role_code": role}})
    project = SimpleNamespace(id=3, cycle_ref="C1", settings={})
    visible = scenario != "hidden"
    monkeypatch.setattr(routes, "_self_summary_task", AsyncMock(return_value=(task, node)))
    monkeypatch.setattr(routes, "_overdue_submission_allowed", AsyncMock(return_value=False))
    monkeypatch.setattr(routes, "_task_visible_content", AsyncMock(return_value=([], {})))
    monkeypatch.setattr(routes, "_reference_tabs", AsyncMock(return_value=[]))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="REVIEWER")))
    monkeypatch.setattr(routes, "resolve_subject_visibility_role", AsyncMock(return_value="other"))
    monkeypatch.setattr(routes, "load_subject_visibility_rules", AsyncMock(return_value={"other": ["direct_supervisor"] if visible else []}))
    monkeypatch.setattr(routes, "_project_member_detail", AsyncMock(return_value={}))
    monkeypatch.setattr(reconsideration_service, "reconsideration_for_task", AsyncMock(return_value=SimpleNamespace(reason="复议")))

    class Db:
        async def get(self, model, key):
            assert model is PerformanceProject and key == 3
            return project

        async def scalar(self, query):
            assert query.column_descriptions[0]["entity"] is PerformanceProjectMember
            assert query.column_descriptions[0]["name"] == "PerformanceProjectMember"
            return member

        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_authorization_snapshot_people.snapshot_id = performance_project_member_snapshots.source_snapshot_id" in sql
            assert "performance_project_member_snapshots.id IN (7)" in sql
            assert "performance_authorization_snapshot_people.employee_no IN ('M1')" in sql
            return SimpleNamespace(all=lambda: [] if scenario == "missing_name" else [(7, "M1", "冻结上级姓名")])

    for _ in range(2):
        detail = await (routes.get_self_summary(9, context(), Db()) if kind == "work_summary" else routes.get_template_task(9, context(), Db()))
        expected = "冻结上级姓名" if scenario == "visible" else None
        assert detail["person"]["direct_supervisor_name"] == expected
        assert detail["person"]["profile_fields"] == ([{"key": "direct_supervisor", "label": "直属上级", "value": expected}] if expected else [])
        assert "M1" not in str(detail["person"])


@pytest.mark.asyncio
async def test_supervisor_names_query_keeps_source_snapshot_versions_isolated():
    from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine
    from app.performance.projects_router import _snapshot_supervisor_names

    metadata = MetaData()
    snapshots = Table("performance_project_member_snapshots", metadata,
        Column("id", Integer, primary_key=True), Column("source_snapshot_id", Integer))
    people = Table("performance_authorization_snapshot_people", metadata,
        Column("snapshot_id", Integer), Column("employee_no", String), Column("display_name", String))
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        metadata.create_all(connection)
        connection.execute(snapshots.insert(), [{"id": 7, "source_snapshot_id": 10}, {"id": 8, "source_snapshot_id": 20}])
        connection.execute(people.insert(), [
            {"snapshot_id": 10, "employee_no": "M1", "display_name": "历史上级姓名"},
            {"snapshot_id": 20, "employee_no": "M1", "display_name": "另一周期姓名"},
        ])

        class Db:
            async def execute(self, query):
                return connection.execute(query)

        members = [SimpleNamespace(snapshot_id=number, direct_supervisor_employee_no="M1") for number in (7, 8)]
        assert await _snapshot_supervisor_names(Db(), members) == {
            (7, "M1"): "历史上级姓名", (8, "M1"): "另一周期姓名",
        }
    engine.dispose()


@pytest.mark.asyncio
async def test_supervisor_names_use_cycle_snapshot_even_when_manager_is_outside_project():
    from app.performance.projects_router import _snapshot_supervisor_names
    member = SimpleNamespace(snapshot_id=7, direct_supervisor_employee_no="M1")
    class Db:
        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_authorization_snapshot_people.snapshot_id = performance_project_member_snapshots.source_snapshot_id" in sql
            assert "performance_project_member_snapshots.id IN (7)" in sql
            assert "performance_authorization_snapshot_people.employee_no IN ('M1')" in sql
            return SimpleNamespace(all=lambda: [(7, "M1", "冻结上级姓名")])
    assert await _snapshot_supervisor_names(Db(), [member]) == {(7, "M1"): "冻结上级姓名"}
    assert await _snapshot_supervisor_names(object(), [SimpleNamespace(snapshot_id=7, direct_supervisor_employee_no=None)]) == {}


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["project", "review", "communication"])
@pytest.mark.parametrize("visible", [True, False])
async def test_member_lists_keep_supervisor_name_visibility_and_zero_360_rate(monkeypatch, entry, visible):
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceProjectMember
    target = SimpleNamespace(id=1, cycle_ref="C1", administrators=[], settings={})
    member = PerformanceProjectMember(id=1, snapshot_id=7, employee_no="E1", display_name="员工", direct_supervisor_employee_no="M1", employee_type="正式员工")
    node = SimpleNamespace(id=2, project_id=1, node_type="result_communication" if entry == "communication" else "evaluation", node_id="manager", config={"template": {"executor_role_code": "assessment.line_manager"}})
    task = SimpleNamespace(id=3, project_id=1, member_snapshot_id=7, target_employee_no="E1", status="pending", available_at=None, due_at=None)
    async def get_project(*args): return target
    async def scope(*args): return None
    async def actor(*args, **kwargs): return SimpleNamespace(actor_ref="VIEWER")
    async def rules(*args): return {role: ["direct_supervisor", "employee_type"] if visible else [] for role in ("leader", "activity_manager")}
    monkeypatch.setattr(projects_router, "_get_project", get_project)
    monkeypatch.setattr(projects_router, "_project_data_scope", scope)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "load_subject_visibility_rules", rules)
    class Db:
        async def get(self, model, key): return target if model is PerformanceProject else None
        async def scalar(self, query): return None
        async def execute(self, query):
            sql = str(query)
            if "performance_authorization_snapshot_people" in sql:
                return SimpleNamespace(all=lambda: [(7, "M1", "冻结上级姓名")])
            if "performance_node_tasks.cycle_ref =" in sql:
                return SimpleNamespace(all=lambda: [])
            if "performance_project_node_snapshots" in sql and "performance_node_tasks" not in sql:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [node]))
            if "performance_node_tasks" in sql and "JOIN" not in sql:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            if entry != "project":
                return SimpleNamespace(all=lambda: [(task, node, member)])
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [member]))
    if entry == "project":
        result = await projects_router.list_project_members(1, keyword=None, page=1, page_size=50, sort_by=None, sort_order=None, context=context(), db=Db())
        row = result.items[0].model_dump()
    else:
        row = (await projects_router.workbench_task_people("manager", 1, "all", context(), Db(), None))[0]
    assert row["direct_supervisor"] == ("冻结上级姓名" if visible else None)
    assert row["completion"] == "0/0"
    assert row["employee_type"] == ("正式员工" if visible else None)
    assert ("employee_type" in row["visible_profile_fields"]) is visible


@pytest.mark.asyncio
async def test_matrix_drilldown_members_intersects_data_scope(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes

    project = SimpleNamespace(id=7)
    actor, db = context(), object()
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=project))
    monkeypatch.setattr(routes, "_project_data_scope", AsyncMock(return_value={"E1", "E2"}))
    drilldown = AsyncMock(return_value={"E2"})
    loader = AsyncMock(return_value=([
        routes.ProjectMemberResponse(id=2, root_review_id=2, project_id=7, employee_no="E2", display_name="员工二")
    ], []))
    monkeypatch.setattr(routes, "_matrix_drilldown_scope", drilldown)
    monkeypatch.setattr(routes, "_project_member_rows", loader)

    result = await routes.list_project_members(7, None, 1, 50, "name", "asc", actor, db, "J6", "three")

    assert [item.employee_no for item in result.items] == ["E2"]
    drilldown.assert_awaited_once_with(project, {"E1", "E2"}, "J6", "three", db)
    loader.assert_awaited_once_with(project, {"E2"}, None, "name", "asc", actor, db)


@pytest.mark.asyncio
async def test_matrix_drilldown_members_requires_both_filters(monkeypatch):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.performance import projects_router as routes

    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=SimpleNamespace(id=7)))
    with pytest.raises(HTTPException) as error:
        await routes.list_project_members(7, None, 1, 50, None, None, context(), object(), "J6", None)
    assert (error.value.status_code, error.value.detail) == (422, "MATRIX_DRILLDOWN_FILTERS_REQUIRED")


@pytest.mark.asyncio
async def test_member_export_returns_all_rows_and_intersects_view_export_scopes(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    project = SimpleNamespace(id=1)
    rows = [routes.ProjectMemberResponse(id=i, root_review_id=i, project_id=1, employee_no=f"E{i}", display_name=f"员工{i}") for i in range(151)]
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=project))
    scopes = AsyncMock(side_effect=[{"E1", "E2"}, {"E2", "E3"}])
    monkeypatch.setattr(routes, "_project_data_scope", scopes)
    loader = AsyncMock(return_value=(rows, []))
    monkeypatch.setattr(routes, "_project_member_rows", loader)
    actor, db = context(), object()
    result = await routes.export_project_members(1, "员工", "name", "desc", actor, db)
    assert len(result.items) == result.total == 151
    loader.assert_awaited_once_with(project, {"E2"}, "员工", "name", "desc", actor, db)
    assert [call.args[3] for call in scopes.await_args_list] == ["performance.frontend.data-view", "performance.frontend.export-members"]


@pytest.mark.asyncio
async def test_member_export_denies_missing_export_permission_before_reading_rows(monkeypatch):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.performance import projects_router as routes
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=SimpleNamespace(id=1)))
    monkeypatch.setattr(routes, "_project_data_scope", AsyncMock(side_effect=[None, HTTPException(403, "PROJECT_DATA_FORBIDDEN")]))
    loader = AsyncMock()
    monkeypatch.setattr(routes, "_project_member_rows", loader)
    with pytest.raises(HTTPException) as error:
        await routes.export_project_members(1, None, None, None, context(), object())
    assert error.value.status_code == 403
    assert error.value.detail == "PERFORMANCE_MEMBER_EXPORT_FORBIDDEN"
    loader.assert_not_awaited()


@pytest.mark.asyncio
async def test_member_task_map_skips_non_delegatable_stage_without_key_error(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceProjectMember
    from app.performance.assessment_roles import ROLE_REVIEWEE, ROLE_LINE_MANAGER
    target = SimpleNamespace(id=1, cycle_ref="C1", administrators=[], settings={})
    member = PerformanceProjectMember(id=1, snapshot_id=7, employee_no="E1", display_name="员工", direct_supervisor_employee_no="M1", employee_type="正式员工")
    # self-review 节点（不可授权环节）+ manager-review 节点（可授权环节）
    self_node = SimpleNamespace(id=11, project_id=1, node_type="evaluation", node_id="self", config={"template": {"executor_role_code": ROLE_REVIEWEE}})
    manager_node = SimpleNamespace(id=12, project_id=1, node_type="evaluation", node_id="manager", config={"template": {"executor_role_code": ROLE_LINE_MANAGER}})
    self_task = SimpleNamespace(id=101, project_id=1, node_snapshot_id=11, member_snapshot_id=7, target_employee_no="E1", handler_ref="E1")
    manager_task = SimpleNamespace(id=102, project_id=1, node_snapshot_id=12, member_snapshot_id=7, target_employee_no="E1", handler_ref="M1")
    async def get_project(*args): return target
    async def scope(*args): return None
    async def actor(*args, **kwargs): return SimpleNamespace(actor_ref="VIEWER")
    async def rules(*args): return {role: [] for role in ("leader", "activity_manager")}
    monkeypatch.setattr(projects_router, "_get_project", get_project)
    monkeypatch.setattr(projects_router, "_project_data_scope", scope)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(projects_router, "load_subject_visibility_rules", rules)
    class Db:
        async def get(self, model, key): return target if model is PerformanceProject else None
        async def scalar(self, query): return None
        async def execute(self, query):
            sql = str(query)
            if "performance_authorization_snapshot_people" in sql:
                return SimpleNamespace(all=lambda: [(7, "M1", "冻结上级姓名")])
            if "performance_node_tasks.cycle_ref =" in sql:
                return SimpleNamespace(all=lambda: [])
            if "performance_project_node_snapshots" in sql:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [self_node, manager_node]))
            if "performance_node_tasks" in sql:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [self_task, manager_task]))
            if "performance_node_task_authorizations" in sql:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [member]))
    result = await projects_router.list_project_members(1, keyword=None, page=1, page_size=50, sort_by=None, sort_order=None, context=context(), db=Db())
    row = result.items[0].model_dump()
    # self-review 任务（node 11 不在 stages）不触发 KeyError，task_map 仅含 manager-review 环节
    assert [option["stage_key"] for option in row["task_map"]] == ["manager-review"]
    assert row["task_map"][0]["task_id"] == 102
    assert row["task_map"][0]["role_key"] == "DIRECT_SUPERVISOR"


@pytest.mark.asyncio
async def test_reviewer_tasks_excludes_revoked(monkeypatch):
    """放弃评估后任务带 revoked_at，_reviewer_tasks 列表不得再返回。"""
    from app.performance import review_360_feedback_router as feedback

    active = SimpleNamespace(id=1, project_id=1, node_snapshot_id=10, handler_ref="REVIEWER", task_kind="evaluation", revoked_at=None)
    revoked = SimpleNamespace(id=2, project_id=1, node_snapshot_id=10, handler_ref="REVIEWER", task_kind="evaluation", revoked_at="2026-11-08T00:00:00+00:00")

    class FakeDb:
        async def execute(self, query):
            captured.append(str(query))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [active, revoked]))

    captured = []
    result = await feedback._reviewer_tasks(FakeDb(), 1, 10, "REVIEWER")
    assert "revoked_at IS NULL" in captured[0], captured[0]


@pytest.mark.asyncio
@pytest.mark.parametrize("status,submitted,expected", [("rejected", False, "rejected"), ("pending", False, "pending"), ("completed", False, "completed"), ("pending", True, "completed")])
async def test_360_feedback_list_preserves_rejected_and_completed_states(monkeypatch, status, submitted, expected):
    from datetime import UTC, datetime
    from app.performance import review_360_feedback_router as feedback
    target = SimpleNamespace(id=1, settings={})
    node = SimpleNamespace(id=10, node_id="feedback", node_type="evaluation", config={"template": {"executor_role_code": "assessment.reviewer_360"}}, node_order=1)
    task = SimpleNamespace(id=3, member_snapshot_id=7, target_employee_no="E1", status=status, source_type="VOLUNTARY", submitted_at=datetime(2026, 1, 1, tzinfo=UTC) if submitted else None, due_at=datetime(2020, 1, 1, tzinfo=UTC))
    async def project(*args): return target
    async def snapshot(*args): return SimpleNamespace(id=2)
    async def actor(*args): return "REVIEWER"
    async def evaluation_node(*args, **kwargs): return node
    async def project_nodes(*args): return [node]
    async def tasks(*args): return [task]
    async def member_snapshot(*args): return 7
    async def people(*args): return []
    async def labels(*args): return {}
    for name, function in [("_get_project", project), ("_locked_snapshot", snapshot), ("_resolve_cycle_member_employee", actor), ("_evaluation_node", evaluation_node), ("_project_nodes", project_nodes), ("_reviewer_tasks", tasks), ("_latest_member_snapshot_id", member_snapshot), ("_snapshot_people", people), ("_feedback_source_labels", labels)]:
        monkeypatch.setattr(feedback, name, function)
    result = await feedback.list_feedback(1, keyword=None, context=context(), db=object())
    assert result.items[0].status == expected
    assert result.items[0].due_at == "2020-01-01T00:00:00+00:00"
    assert task.status == status


@pytest.mark.parametrize("source", ["feedback-first", "feedback-second", "invite"])
def test_voluntary_360_settings_inherit_first_reviewer_node_and_ignore_unrelated(source):
    from app.performance.navigation_service import _voluntary_360_node_ids
    from app.performance.review_360_invites_router import _invite_settings
    nodes = [
        SimpleNamespace(id=12, node_id="feedback-second", node_type="evaluation", node_order=3, config={"template": {"executor_role_code": "assessment.reviewer_360"}}),
        SimpleNamespace(id=10, node_id="invite", node_type="reviewer_360_invite", node_order=1, config={}),
        SimpleNamespace(id=11, node_id="feedback-first", node_type="evaluation", node_order=2, config={"template": {"executor_role_code": "assessment.reviewer_360"}}),
        SimpleNamespace(id=13, node_id="manager", node_type="evaluation", node_order=0, config={"template": {"executor_role_code": "assessment.line_manager"}}),
    ]
    target = project("STARTED")
    stored = target.settings["flow_settings"]["node_settings"]
    stored["manager"] = {"invite": {"allow_voluntary_evaluation": True}}
    assert _invite_settings(target, nodes=nodes) == {}
    assert _voluntary_360_node_ids(target, nodes) == set()
    stored[source] = {"invite": {"allow_voluntary_evaluation": True, "source": source}}
    assert _invite_settings(target, "feedback-second", nodes=nodes)["source"] == source
    assert _voluntary_360_node_ids(target, nodes) == {11, 12}
    stored["feedback-first"] = {"invite": {"allow_voluntary_evaluation": False}}
    assert _invite_settings(target, "feedback-second", nodes=nodes) == {"allow_voluntary_evaluation": False}
    assert _voluntary_360_node_ids(target, nodes) == set()
    assert _invite_settings(target, "feedback-first") == stored["manager"]["invite"]


@pytest.fixture
def voluntary_360_context(monkeypatch):
    from datetime import UTC, datetime, timedelta
    from app.performance import review_360_feedback_router as feedback
    from app.performance.models import PerformanceAuditEvent, PerformanceNodeTask
    now = datetime.now(UTC)
    target = project("STARTED")
    nodes = [
        SimpleNamespace(id=11, project_id=1, node_id="feedback-first", node_type="evaluation", node_order=1, config={"template": {"executor_role_code": "assessment.reviewer_360"}}),
        SimpleNamespace(id=12, project_id=1, node_id="feedback-second", node_type="evaluation", node_order=2, config={"template": {"executor_role_code": "assessment.reviewer_360"}}),
        SimpleNamespace(id=13, project_id=1, node_id="manager", node_type="evaluation", node_order=3, config={"template": {"executor_role_code": "assessment.line_manager"}}),
    ]
    target.settings["flow_settings"] = {
        "node_settings": {"feedback-first": {"invite": {"allow_voluntary_evaluation": True}}},
        "node_times": {node.node_id: {"start_at": (now - timedelta(days=1)).isoformat(), "end_at": (now + timedelta(days=1)).isoformat()} for node in nodes},
    }
    people = [SimpleNamespace(employee_no=number, display_name=number, live_employment_status=None, employment_status="在职", organization_ref="总部/研发", job_family=None, job_category=None, position_level=None, direct_supervisor_employee_no=None) for number in ["REVIEWER", "E1", "E2"]]
    class Db:
        def __init__(self):
            self.tasks = [SimpleNamespace(id=index, node_snapshot_id=node.id, member_snapshot_id=7, target_employee_no="E1", status="pending", submitted_at=None, due_at=now, handler_ref="REVIEWER") for index, node in enumerate(nodes[:2], 101)]
            self.events = []
            self.commits = 0
            self.rollbacks = 0
            self.existing = None
            self.overdue = False
            self.fail_flush = False
        async def get(self, model, key):
            return SimpleNamespace(overdue_voluntary_360_submission_enabled=self.overdue)
        async def scalar(self, query):
            params = query.compile().params
            self.last_existing_params = params
            return self.existing
        async def execute(self, query):
            class ExecuteResult:
                def scalars(self):
                    return SimpleNamespace(all=lambda: [])
            return ExecuteResult()
        def add(self, row):
            if isinstance(row, PerformanceNodeTask):
                self.pending = row
            elif isinstance(row, PerformanceAuditEvent):
                assert self.pending.id is not None
                self.events.append(row)
        async def flush(self):
            if self.fail_flush:
                from sqlalchemy.exc import IntegrityError
                raise IntegrityError("insert", {}, Exception("duplicate"))
            self.pending.id = 999
            self.tasks.append(self.pending)
        async def rollback(self):
            self.rollbacks += 1
            self.existing = 999
        async def commit(self):
            self.commits += 1
    db = Db()
    async def get_project(*args): return target
    async def snapshot(*args): return SimpleNamespace(id=2)
    async def actor(*args): return "REVIEWER"
    async def project_nodes(*args): return nodes
    async def tasks(_db, project_id, node_id, handler_ref): return [task for task in db.tasks if task.node_snapshot_id == node_id]
    async def member_snapshot(*args): return 7
    async def snapshot_people(*args): return people
    async def labels(*args): return {"E1": "自己邀请", "E2": "自愿评估"}
    async def evaluated(*args): return ["E1", "E2"]
    for name, function in [("_get_project", get_project), ("_locked_snapshot", snapshot), ("_resolve_cycle_member_employee", actor), ("_project_nodes", project_nodes), ("_reviewer_tasks", tasks), ("_latest_member_snapshot_id", member_snapshot), ("_snapshot_people", snapshot_people), ("_feedback_source_labels", labels), ("_evaluated_employee_nos", evaluated)]:
        monkeypatch.setattr(feedback, name, function)
    return SimpleNamespace(feedback=feedback, project=target, nodes=nodes, people=people, db=db, now=now)


@pytest.mark.asyncio
@pytest.mark.parametrize("enabled,window,overdue,error", [
    (False, "open", False, (403, "VOLUNTARY_NOT_ALLOWED")),
    (True, "early", False, (409, "VOLUNTARY_WINDOW_NOT_OPEN")),
    (True, "early", True, (409, "VOLUNTARY_WINDOW_NOT_OPEN")),
    (True, "closed", False, (409, "VOLUNTARY_WINDOW_CLOSED")),
    (True, "closed", True, (409, "VOLUNTARY_WINDOW_CLOSED")),
    (True, "open", False, None),
])
async def test_voluntary_360_list_candidates_and_start_share_permission(voluntary_360_context, enabled, window, overdue, error):
    from datetime import timedelta
    from fastapi import HTTPException
    data = voluntary_360_context
    data.project.settings["flow_settings"]["node_settings"]["feedback-first"]["invite"]["allow_voluntary_evaluation"] = enabled
    timing = data.project.settings["flow_settings"]["node_times"]["feedback-second"]
    if window == "early":
        timing["start_at"] = (data.now + timedelta(days=1)).isoformat()
        timing["end_at"] = (data.now + timedelta(days=2)).isoformat()
    elif window == "closed":
        timing["start_at"] = (data.now - timedelta(days=2)).isoformat()
        timing["end_at"] = (data.now - timedelta(days=1)).isoformat()
    data.db.overdue = overdue
    listed = await data.feedback.list_feedback(1, node_id="feedback-second", keyword=None, context=context(), db=data.db)
    assert listed.allow_voluntary_evaluation is (error is None)
    assert listed.voluntary_evaluation_enabled is enabled
    if enabled and window == "closed":
        assert listed.voluntary_evaluation_disabled_reason == "360°评估已截止，无法发起自愿评估"
    assert [item.task_id for item in listed.items] == [102]
    assert listed.items[0].source_label == "自己邀请"
    calls = [
        lambda: data.feedback.list_voluntary_candidates(1, node_id="feedback-second", keyword=None, context=context(), db=data.db),
        lambda: data.feedback.start_voluntary_evaluation(1, data.feedback.VoluntaryPayload(target_employee_no="E2", node_id="feedback-second"), context=context(), db=data.db),
    ]
    for call in calls:
        if error:
            with pytest.raises(HTTPException) as denied:
                await call()
            assert (denied.value.status_code, denied.value.detail) == error
        else:
            result = await call()
    if error:
        assert data.db.commits == 0 and len(data.db.tasks) == 2
    else:
        assert result.task_id == 999
        assert data.db.pending.node_snapshot_id == 12
        assert data.db.last_existing_params["node_snapshot_id_1"] == 12
        event = data.db.events[0]
        assert event.after_state["task_id"] == 999
        assert (event.cycle_ref, event.employee_no, event.actor_ref) == ("cycle:one", "E2", "REVIEWER")
        assert {key: event.after_state[key] for key in ["project_id", "node_id", "source_type"]} == {"project_id": 1, "node_id": "feedback-second", "source_type": "VOLUNTARY"}
    reread = await data.feedback.list_feedback(1, node_id="feedback-second", keyword=None, context=context(), db=data.db)
    assert reread.items[0].task_id == 102
    if not error:
        assert reread.items[-1].source_label == "自愿评估"


@pytest.mark.asyncio
@pytest.mark.parametrize("node_id,error", [("unknown", (404, "REVIEWER_360_NODE_NOT_FOUND")), ("manager", (409, "REVIEWER_360_NODE_REQUIRED"))])
async def test_voluntary_360_explicit_node_rejects_missing_or_wrong_role(voluntary_360_context, node_id, error):
    from fastapi import HTTPException
    data = voluntary_360_context
    for call in [
        lambda: data.feedback.list_feedback(1, node_id=node_id, keyword=None, context=context(), db=data.db),
        lambda: data.feedback.list_voluntary_candidates(1, node_id=node_id, keyword=None, context=context(), db=data.db),
        lambda: data.feedback.start_voluntary_evaluation(1, data.feedback.VoluntaryPayload(target_employee_no="E2", node_id=node_id), context=context(), db=data.db),
    ]:
        with pytest.raises(HTTPException) as denied:
            await call()
        assert (denied.value.status_code, denied.value.detail) == error
    assert data.db.commits == 0


@pytest.mark.asyncio
async def test_voluntary_360_body_node_priority_legacy_first_node_and_idempotency(voluntary_360_context):
    from fastapi import HTTPException
    data = voluntary_360_context
    first = await data.feedback.list_feedback(1, keyword=None, context=context(), db=data.db)
    assert first.node_id == "feedback-first" and [item.task_id for item in first.items] == [101]
    data.db.existing = 102
    result = await data.feedback.start_voluntary_evaluation(1, data.feedback.VoluntaryPayload(target_employee_no="E1", node_id="feedback-second"), context=context(), db=data.db)
    assert result.task_id == 102 and data.db.commits == 0 and data.db.events == []
    assert data.db.last_existing_params["node_snapshot_id_1"] == 12
    with pytest.raises(HTTPException) as denied:
        await data.feedback.start_voluntary_evaluation(1, data.feedback.VoluntaryPayload(target_employee_no="E1", node_id="feedback-second"), node_id="feedback-first", context=context(), db=data.db)
    assert (denied.value.status_code, denied.value.detail) == (409, "REVIEWER_360_NODE_MISMATCH")
    result = await data.feedback.start_voluntary_evaluation(1, data.feedback.VoluntaryPayload(target_employee_no="E1"), context=context(), db=data.db)
    assert result.task_id == 102 and data.db.last_existing_params["node_snapshot_id_1"] == 11


@pytest.mark.asyncio
async def test_voluntary_360_concurrent_duplicate_returns_existing_task_without_migration(voluntary_360_context):
    data = voluntary_360_context
    data.db.fail_flush = True
    result = await data.feedback.start_voluntary_evaluation(1, data.feedback.VoluntaryPayload(target_employee_no="E2", node_id="feedback-second"), context=context(), db=data.db)
    assert result.task_id == 999
    assert data.db.rollbacks == 1 and data.db.commits == 0 and data.db.events == []


def test_rich_text_list_metadata_survives_sanitizing_without_allowing_css_or_events():
    from app.performance.self_summary_service import sanitize_rich_text, sanitize_self_summary_answers

    html = '<div class="ace-line list-div injected" data-node="true" dir="auto" onclick="bad()"><ol class="list-number1 r-list r-list-number injected" start="2" data-start="2" data-origin-start="1" style="color:red"><li start="2" data-start="2" onmouseover="bad()"><span data-string="true" data-leaf="true"><strong><em><u>第二项</u></em></strong></span><span data-enter="true">​</span></li></ol></div><div class="ace-line list-indent1"><span>保留缩进</span></div><ul class="list-bullet1 r-list r-list-bullet"><li>无序项</li></ul>'
    clean = sanitize_rich_text(html)
    assert 'class="ace-line list-div"' in clean
    assert 'class="ace-line list-indent1"' in clean
    assert 'class="list-number1 r-list r-list-number"' in clean
    assert 'start="2" data-start="2" data-origin-start="1"' in clean
    assert '<strong><em><u>第二项</u></em></strong>' in clean
    assert 'data-leaf="true"' in clean and 'data-enter="true"' in clean
    assert 'class="list-bullet1 r-list r-list-bullet"' in clean
    assert all(value not in clean for value in ["injected", "onclick", "onmouseover", "style="])
    assert sanitize_rich_text(clean) == clean
    schema = [{"fields": [{"id": "work", "type": "rich_text"}, {"id": "tag", "type": "tag_with_followup", "options": [{"id": "a"}]}]}]
    answers = sanitize_self_summary_answers(schema, {"work": html, "tag": {"tags": ["a"], "notes": {"a": html}}})
    assert answers["work"] == clean
    assert answers["tag"]["notes"]["a"] == clean


@pytest.mark.parametrize("number", ["0", "-1", "1.5", "1 onclick=bad()", "9999999", "0002", "１２", "9" * 5000])
def test_rich_text_rejects_noncanonical_list_numbers(number):
    from app.performance.self_summary_service import sanitize_rich_text

    clean = sanitize_rich_text(f'<ol start="{number}" data-start="{number}"><li data-start="{number}">内容</li></ol>')
    assert clean == "<ol><li>内容</li></ol>"


@pytest.mark.asyncio
async def test_submitted_answers_survive_draft_discard_validation_and_resubmission(monkeypatch):
    from datetime import UTC, datetime
    from fastapi import HTTPException
    from app.performance import projects_router as router
    task = SimpleNamespace(id=901, project_id=3, task_kind="work_summary", available_at=None, due_at=None, submitted_at=datetime.now(UTC), answer_version=1, answers={"work": "<p>提交A</p>"}, draft_answers=None, status="completed", completed_at=None)
    node = SimpleNamespace(node_id="summary", node_type="work_summary", config={"template": {"content": [{"content_id": "summary", "type": "work_summary", "items": [{"id": "work", "label": "总结", "settings": {"required": True}}]}]}})
    async def get_task(*_args): return task, node
    class Db:
        async def get(self, *_args): return None
        async def commit(self): pass
    monkeypatch.setattr(router, "_self_summary_task", get_task)
    db = Db()
    submitted_at = task.submitted_at
    payload = router.SelfSummaryAnswersPayload(answers={"work": "<p>草稿B</p>"}, version=1)
    await router._save_self_summary(901, payload, False, context(), db)
    assert task.answers == {"work": "<p>提交A</p>"}
    assert task.draft_answers == payload.answers
    assert task.status == "completed" and task.submitted_at == submitted_at
    _, visible = await router._task_visible_content(task, node, db)
    assert visible == task.answers
    with pytest.raises(HTTPException) as stale:
        await router._discard_task_draft(901, router.TaskDraftVersionPayload(version=1), context(), db, "work_summary", None)
    assert stale.value.detail == "VERSION_CONFLICT" and task.draft_answers == payload.answers
    await router._discard_task_draft(901, router.TaskDraftVersionPayload(version=2), context(), db, "work_summary", None)
    assert task.draft_answers is None and task.answers == visible
    await router._save_self_summary(901, router.SelfSummaryAnswersPayload(answers={"work": "<p>草稿C</p>"}, version=3), False, context(), db)
    with pytest.raises(HTTPException) as invalid:
        await router._save_self_summary(901, router.SelfSummaryAnswersPayload(answers={"work": ""}, version=4), True, context(), db)
    assert invalid.value.status_code == 400 and task.answers == visible
    assert task.draft_answers == {"work": "<p>草稿C</p>"}
    await router._save_self_summary(901, router.SelfSummaryAnswersPayload(answers={"work": "<p>提交C</p>"}, version=4), True, context(), db)
    assert task.answers == {"work": "<p>提交C</p>"} and task.draft_answers is None
    with pytest.raises(HTTPException) as late:
        await router._save_self_summary(901, router.SelfSummaryAnswersPayload(answers={"work": "过期草稿"}, version=4), False, context(), db)
    assert late.value.detail == "VERSION_CONFLICT"
    assert task.answers == {"work": "<p>提交C</p>"} and task.draft_answers is None


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["work_summary", "evaluation"])
async def test_discard_draft_enforces_handler_identity_and_target_scope(monkeypatch, kind):
    from fastapi import HTTPException
    from app.performance import projects_router as router
    task = SimpleNamespace(id=1, cycle_ref="c", handler_ref="owner", task_kind=kind, target_employee_no="E1")
    class Db:
        async def execute(self, _statement): return SimpleNamespace(first=lambda: (task, SimpleNamespace()), scalars=lambda: SimpleNamespace(all=lambda: []))
    async def trusted(*_args, **_kwargs): return SimpleNamespace(actor_ref="intruder")
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", trusted)
    with pytest.raises(HTTPException) as denied:
        await router._discard_task_draft(1, router.TaskDraftVersionPayload(version=1), context(), Db(), kind, "E1")
    assert denied.value.status_code == 404


def test_task_draft_migration_does_not_backfill_submitted_history_and_blocks_lossy_downgrade(monkeypatch):
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0289_performance_task_drafts.py"
    spec = importlib.util.spec_from_file_location("task_drafts_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    operations = []
    binding = SimpleNamespace(scalar=lambda _stmt: None)
    monkeypatch.setattr(migration, "op", SimpleNamespace(add_column=lambda *args: operations.append(("add", args)), execute=lambda sql: operations.append(("sql", sql)), drop_column=lambda *args: operations.append(("drop", args)), get_bind=lambda: binding))
    migration.upgrade()
    assert migration.down_revision == "0288_pm_published_level"
    assert "submitted_at IS NULL" in operations[-1][1]
    assert "SET draft_answers = answers" in operations[-1][1]
    binding.scalar = lambda _stmt: 1
    with pytest.raises(RuntimeError, match="禁止删除"):
        migration.downgrade()
    assert not any(item[0] == "drop" for item in operations)
    binding.scalar = lambda _stmt: None
    migration.downgrade()
    assert "answers = draft_answers" in operations[-2][1]
    assert operations[-1] == ("drop", ("performance_node_tasks", "draft_answers"))


def test_cleared_task_draft_binds_to_sql_null_not_json_null():
    from sqlalchemy.dialects.postgresql import dialect
    from app.performance.models import PerformanceNodeTask
    column = PerformanceNodeTask.__table__.c.draft_answers
    assert column.nullable and column.type.none_as_null is True
    assert column.type.bind_processor(dialect())(None) is None


@pytest.mark.asyncio
async def test_cycle_reminder_enforces_member_scope_and_current_snapshot(monkeypatch):
    from app.performance import projects_router as router
    from app.performance.models import PerformanceAuditEvent
    project = SimpleNamespace(id=3, status="STARTED", cycle_ref="cycle:1", name="项目", settings={})
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    tasks = [SimpleNamespace(id=i, project_id=3, cycle_ref="cycle:1", member_snapshot_id=snapshot, target_employee_no=employee, handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None) for i, snapshot, employee in [(1, 10, "VISIBLE"), (2, 10, "HIDDEN"), (3, 9, "VISIBLE")]]
    async def managed(*args): return [(project, {"VISIBLE"})]
    async def eligible(*args, **kwargs): return [{"task_id": i, "selectable": True} for i in [1, 2, 3]]
    async def actor(*args): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ADMIN")
    sent = []
    async def send(task, *args): sent.append(task.id); return True, None
    monkeypatch.setattr(router, "_managed_completion_projects", managed)
    monkeypatch.setattr(router, "_completion_reminder_rows", eligible)
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(router, "_send_performance_task_reminder", send)
    class Db:
        def __init__(self): self.events = []
        async def scalar(self, query): return 10
        async def execute(self, query): return SimpleNamespace(all=lambda: [(task, node, project) for task in tasks], scalars=lambda: SimpleNamespace(all=lambda: []))
        def add(self, event): self.events.append(event)
        async def commit(self): pass
    db = Db()
    result = await router.project_management_remind(router.CycleReminderTasksPayload(cycle_id=1, node_key="work-summary", task_ids=[1, 2, 3, 99]), context(), db)
    assert result["accepted_task_ids"] == [1]
    assert result["skipped_task_ids"] == [2, 3, 99]
    assert sent == [1]
    assert db.events[0].actor_ref == "ADMIN"
    assert db.events[0].after_state["delivery_status"] == "sent"


@pytest.mark.asyncio
async def test_cycle_reminder_does_not_report_delivery_failure_as_success(monkeypatch):
    from app.performance import projects_router as router
    project = SimpleNamespace(id=3, cycle_ref="cycle:1", settings={})
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    task = SimpleNamespace(id=1, project_id=3, cycle_ref="cycle:1", member_snapshot_id=10, target_employee_no="VISIBLE", handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None)
    async def managed(*args): return [(project, None)]
    async def eligible(*args, **kwargs): return [{"task_id": 1, "selectable": True}]
    async def actor(*args): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ADMIN")
    async def send(*args): return False, "failed"
    monkeypatch.setattr(router, "_managed_completion_projects", managed)
    monkeypatch.setattr(router, "_completion_reminder_rows", eligible)
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(router, "_send_performance_task_reminder", send)
    class Db:
        async def scalar(self, query): return 10
        async def execute(self, query): return SimpleNamespace(all=lambda: [(task, node, project)], scalars=lambda: SimpleNamespace(all=lambda: []))
        async def commit(self): pass
    result = await router.project_management_remind(router.CycleReminderTasksPayload(cycle_id=1, node_key="work-summary", task_ids=[1]), context(), Db())
    assert result["accepted_task_ids"] == []
    assert result["failed_task_ids"] == [1]
    assert result["delivery_status"] == "failed"


@pytest.mark.asyncio
async def test_cycle_reminder_skips_tasks_reminded_within_six_hours_when_flagged(monkeypatch):
    from app.performance import projects_router as router
    project = SimpleNamespace(id=3, cycle_ref="cycle:1", settings={})
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    task = SimpleNamespace(id=1, project_id=3, cycle_ref="cycle:1", member_snapshot_id=10, target_employee_no="VISIBLE", handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None)
    async def managed(*args): return [(project, None)]
    async def eligible(*args, **kwargs): return [{"task_id": 1, "selectable": True}]
    async def actor(*args): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ADMIN")
    monkeypatch.setattr(router, "_managed_completion_projects", managed)
    monkeypatch.setattr(router, "_completion_reminder_rows", eligible)
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    sent = {"calls": 0}
    async def send(*args): sent["calls"] += 1; return True, None
    monkeypatch.setattr(router, "_send_performance_task_reminder", send)
    class Db:
        async def scalar(self, query): return 10
        async def execute(self, query):
            first_column = query.column_descriptions[0]["name"] if getattr(query, "column_descriptions", None) else None
            if first_column == "biz_id":
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: ["1"]))
            return SimpleNamespace(all=lambda: [(task, node, project)], scalars=lambda: SimpleNamespace(all=lambda: []))
        async def commit(self): pass
    result = await router.project_management_remind(router.CycleReminderTasksPayload(cycle_id=1, node_key="work-summary", task_ids=[1], skip_recently_reminded=True), context(), Db())
    assert result["accepted_task_ids"] == []
    assert result["skipped_task_ids"] == [1]
    assert sent["calls"] == 0
    assert result["delivery_status"] == "failed"


@pytest.mark.asyncio
async def test_cycle_reminder_sends_when_not_recently_reminded(monkeypatch):
    from app.performance import projects_router as router
    project = SimpleNamespace(id=3, cycle_ref="cycle:1", settings={})
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    task = SimpleNamespace(id=1, project_id=3, cycle_ref="cycle:1", member_snapshot_id=10, target_employee_no="VISIBLE", handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None)
    async def managed(*args): return [(project, None)]
    async def eligible(*args, **kwargs): return [{"task_id": 1, "selectable": True}]
    async def actor(*args): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ADMIN")
    monkeypatch.setattr(router, "_managed_completion_projects", managed)
    monkeypatch.setattr(router, "_completion_reminder_rows", eligible)
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    sent = {"calls": 0}
    async def send(*args): sent["calls"] += 1; return True, None
    monkeypatch.setattr(router, "_send_performance_task_reminder", send)
    class Db:
        async def scalar(self, query): return 10
        async def execute(self, query):
            first_column = query.column_descriptions[0]["name"] if getattr(query, "column_descriptions", None) else None
            if first_column == "biz_id":
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
            return SimpleNamespace(all=lambda: [(task, node, project)], scalars=lambda: SimpleNamespace(all=lambda: []))
        def add(self, record): pass
        async def commit(self): pass
    result = await router.project_management_remind(router.CycleReminderTasksPayload(cycle_id=1, node_key="work-summary", task_ids=[1], skip_recently_reminded=True), context(), Db())
    assert result["accepted_task_ids"] == [1]
    assert sent["calls"] == 1


@pytest.mark.asyncio
async def test_global_blocked_mode_records_success_without_transport(monkeypatch):
    """全局 blocked：保险丝开、投递模式 blocked 时，记录 success 但不调用飞书。"""
    from unittest.mock import AsyncMock, Mock
    from app.integrations.feishu import notification_service as service
    from app.integrations.feishu.schemas import NotificationConfig, MessageConfig, ResolveResult, ResolvedReceiver
    from app.identity_switch.service import current_switch
    monkeypatch.setattr(settings, "FEISHU_NOTIFICATION_DELIVERY_ENABLED", True)
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="blocked"))
    monkeypatch.setattr(service, "resolve_receivers", AsyncMock(return_value=ResolveResult(ok=True, receivers=[ResolvedReceiver(receiver_type="user", receiver_id="ou_original", display_name="原接收人", source="fixed_users")])))
    transport = Mock(side_effect=AssertionError("blocked 模式禁止创建飞书 transport"))
    monkeypatch.setattr(service, "get_feishu_client", transport)
    logs = []
    class Db:
        def add(self, log): logs.append(log); log.id = 1
        async def flush(self): pass
    token = current_switch.set(None)
    try:
        result = await service.send_notification(NotificationConfig(message=MessageConfig(title_template="任务", content_template="待办")), {}, Db(), biz_type="performance_task_reminder", biz_id="1")
    finally:
        current_switch.reset(token)
    assert result.status == "success" and result.success_count == 1
    assert result.errors == []
    assert logs[0].status == "success"
    assert logs[0].result_snapshot[0]["status"] == "success"
    assert not any("preview_only" in str(s) for s in logs[0].result_snapshot)
    transport.assert_not_called()


@pytest.mark.asyncio
async def test_global_test_receiver_mode_rewrites_receivers_and_sends(monkeypatch):
    """全局 test_receiver：接收人整体替换为测试接收人并真实发送（原名单重合也照发）。"""
    from unittest.mock import AsyncMock
    from app.integrations.feishu import notification_service as service
    from app.integrations.feishu.schemas import NotificationConfig, MessageConfig, ResolveResult, ResolvedReceiver
    from app.identity_switch.service import current_switch
    monkeypatch.setattr(settings, "FEISHU_NOTIFICATION_DELIVERY_ENABLED", True)
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="test_receiver"))
    test_receiver = ResolvedReceiver(receiver_type="user", receiver_id="ou_test", display_name="测试接收人", source="global_test_receiver")
    monkeypatch.setattr(service, "_global_test_receiver", AsyncMock(return_value=test_receiver))
    monkeypatch.setattr(service, "resolve_receivers", AsyncMock(return_value=ResolveResult(ok=True, receivers=[ResolvedReceiver(receiver_type="user", receiver_id="ou_original", display_name="原接收人", source="fixed_users")])))
    sent_to = []
    class Client:
        async def send_interactive_card_to_user(self, open_id, _card): sent_to.append(open_id); return {"data": {"message_id": "m1"}}
        async def send_markdown_to_user(self, open_id, title, content): sent_to.append(open_id); return {"data": {"message_id": "m1"}}
    monkeypatch.setattr(service, "get_feishu_client", lambda: Client())
    logs = []
    class Db:
        def add(self, log): logs.append(log); log.id = 1
        async def flush(self): pass
    token = current_switch.set(None)
    try:
        result = await service.send_notification(NotificationConfig(message=MessageConfig(title_template="任务", content_template="待办")), {}, Db(), biz_type="performance_task_reminder", biz_id="1")
    finally:
        current_switch.reset(token)
    assert result.status == "success" and result.success_count == 1
    assert sent_to == ["ou_test"]
    assert logs[0].receiver_snapshot == [test_receiver.model_dump()]


@pytest.mark.asyncio
async def test_global_normal_mode_sends_to_original_receivers(monkeypatch):
    """全局 normal：真实发送原接收人。"""
    from unittest.mock import AsyncMock
    from app.integrations.feishu import notification_service as service
    from app.integrations.feishu.schemas import NotificationConfig, MessageConfig, ResolveResult, ResolvedReceiver
    from app.identity_switch.service import current_switch
    monkeypatch.setattr(settings, "FEISHU_NOTIFICATION_DELIVERY_ENABLED", True)
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="normal"))
    monkeypatch.setattr(service, "resolve_receivers", AsyncMock(return_value=ResolveResult(ok=True, receivers=[ResolvedReceiver(receiver_type="user", receiver_id="ou_original", display_name="原接收人", source="fixed_users")])))
    sent_to = []
    class Client:
        async def send_interactive_card_to_user(self, open_id, _card): sent_to.append(open_id); return {"data": {"message_id": "m1"}}
        async def send_markdown_to_user(self, open_id, title, content): sent_to.append(open_id); return {"data": {"message_id": "m1"}}
    monkeypatch.setattr(service, "get_feishu_client", lambda: Client())
    logs = []
    class Db:
        def add(self, log): logs.append(log); log.id = 1
        async def flush(self): pass
    token = current_switch.set(None)
    try:
        result = await service.send_notification(NotificationConfig(message=MessageConfig(title_template="任务", content_template="待办")), {}, Db(), biz_type="performance_task_reminder", biz_id="1")
    finally:
        current_switch.reset(token)
    assert result.status == "success" and result.success_count == 1
    assert sent_to == ["ou_original"]


@pytest.mark.asyncio
async def test_fuse_off_still_preview_only_even_when_blocked(monkeypatch):
    """部署保险丝关闭时保持 preview_only 兜底，不受 delivery_mode=blocked 影响。"""
    from unittest.mock import AsyncMock, Mock
    from app.integrations.feishu import notification_service as service
    from app.integrations.feishu.schemas import NotificationConfig, MessageConfig, ResolveResult, ResolvedReceiver
    from app.identity_switch.service import current_switch
    monkeypatch.setattr(settings, "FEISHU_NOTIFICATION_DELIVERY_ENABLED", False)
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="blocked"))
    monkeypatch.setattr(service, "resolve_receivers", AsyncMock(return_value=ResolveResult(ok=True, receivers=[ResolvedReceiver(receiver_type="user", receiver_id="ou_original", display_name="原接收人", source="fixed_users")])))
    transport = Mock(side_effect=AssertionError("preview_only 模式禁止创建飞书 transport"))
    monkeypatch.setattr(service, "get_feishu_client", transport)
    logs = []
    class Db:
        def add(self, log): logs.append(log); log.id = 1
        async def flush(self): pass
    token = current_switch.set(None)
    try:
        result = await service.send_notification(NotificationConfig(message=MessageConfig(title_template="任务", content_template="待办")), {}, Db(), biz_type="performance_task_reminder", biz_id="1")
    finally:
        current_switch.reset(token)
    assert result.status == "skipped"
    assert "NOTIFICATION_PREVIEW_ONLY" in result.errors
    assert logs[0].result_snapshot[0]["status"] == "preview_only"
    transport.assert_not_called()


def test_calibration_completion_counts_handlers_not_individual_reviewees():
    from app.performance.projects_router import _completion_task_counts
    node = SimpleNamespace(project_id=3, node_type="calibration", config={"calibration": {"role_code": "assessment.calibrator", "phases": [{"phase_id": "p1", "assignments": [{"handler_ref": handler, "employee_no": employee} for handler, employee in [("M1", "E1"), ("M1", "E2"), ("M2", "E3")]]}]}})
    tasks = [SimpleNamespace(project_id=3, task_kind="calibration", phase_id="p1", handler_ref=handler, target_employee_no=employee, status=state, submitted_at=None) for handler, employee, state in [("M1", "E1", "completed"), ("M1", "E2", "pending"), ("M2", "E3", "completed")]]
    assert _completion_task_counts(node, tasks) == (1, 2)


@pytest.mark.asyncio
@pytest.mark.parametrize("switched", [False, True])
async def test_notification_preview_logs_without_creating_transport(monkeypatch, switched):
    from unittest.mock import AsyncMock, Mock
    from app.integrations.feishu import notification_service as service
    from app.integrations.feishu.schemas import NotificationConfig, MessageConfig, ResolveResult, ResolvedReceiver
    from app.identity_switch.service import current_switch
    monkeypatch.setattr(settings, "FEISHU_NOTIFICATION_DELIVERY_ENABLED", False)
    monkeypatch.setattr(service, "resolve_receivers", AsyncMock(return_value=ResolveResult(ok=True, receivers=[ResolvedReceiver(receiver_type="user", receiver_id="ou_test", display_name="测试接收人", source="fixed_users")])))
    transport = Mock(side_effect=AssertionError("must not create Feishu transport"))
    monkeypatch.setattr(service, "get_feishu_client", transport)
    logs = []
    class Db:
        def add(self, log): logs.append(log); log.id = 1
        async def flush(self): pass
    token = current_switch.set(SimpleNamespace() if switched else None)
    try:
        result = await service.send_notification(NotificationConfig(message=MessageConfig(title_template="任务", content_template="待办")), {}, Db(), biz_type="performance_task_reminder", biz_id="1")
    finally:
        current_switch.reset(token)
    assert result.status == "skipped" and result.success_count == 0
    assert "NOTIFICATION_PREVIEW_ONLY" in result.errors
    assert logs[0].result_snapshot[0]["status"] == "preview_only"
    assert logs[0].receiver_snapshot[0]["receiver_id"] == "ou_test"
    transport.assert_not_called()


@pytest.mark.asyncio
async def test_cycle_reminder_preview_mode_never_counts_as_accepted(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as router
    result = SimpleNamespace(status="skipped", success_count=0, errors=["NOTIFICATION_PREVIEW_ONLY"])
    monkeypatch.setattr(router, "send_notification", AsyncMock(return_value=result))
    task = SimpleNamespace(id=1, handler_ref="M1", member_snapshot_id=10, target_employee_no="E1")
    async def scalar(_statement): return SimpleNamespace(id=8, is_active=True, feishu_user_id="ou_test")
    ok, error = await router._send_performance_task_reminder(task, SimpleNamespace(id=3, name="项目"), SimpleNamespace(name="自评"), context(), SimpleNamespace(scalar=scalar))
    assert ok is False
    assert error == "NOTIFICATION_PREVIEW_ONLY"


@pytest.mark.asyncio
@pytest.mark.parametrize("delivery,successes,expected", [("success", 1, True), ("failed", 0, False), ("skipped", 0, False), ("partial_success", 1, False)])
async def test_cycle_reminder_calls_shared_notification_service_with_bound_handler(monkeypatch, delivery, successes, expected):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as router
    task = SimpleNamespace(id=1, handler_ref="M1", member_snapshot_id=10, target_employee_no="E1")
    project = SimpleNamespace(id=3, name="真实项目")
    node = SimpleNamespace(name="上级评估")
    user = SimpleNamespace(id=8, is_active=True, feishu_user_id="ou_fixture")
    class Db:
        async def scalar(self, statement): return user
    sending = AsyncMock(return_value=SimpleNamespace(status=delivery, success_count=successes))
    monkeypatch.setattr(router, "send_notification", sending)
    ok, error = await router._send_performance_task_reminder(task, project, node, context(), Db())
    assert ok is expected
    config, values, db = sending.call_args.args
    assert config.receivers[0].type == "fixed_users"
    assert config.receivers[0].user_ids == [8]
    assert values["task_id"] == 1
    assert values["project_name"] == "真实项目"
    assert sending.call_args.kwargs["biz_type"] == "performance_task_reminder"
    if not expected:
        assert error == delivery


@pytest.mark.asyncio
async def test_cycle_reminder_missing_handler_mapping_does_not_guess_username(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as router
    from app.integrations.feishu import notification_service as service
    # normal 模式下 handler 无身份映射 → 拒绝，不猜测用户名
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="normal"))
    calls = []
    class Db:
        async def scalar(self, statement): calls.append(statement); return None
    sending = AsyncMock()
    monkeypatch.setattr(router, "send_notification", sending)
    result = await router._send_performance_task_reminder(SimpleNamespace(id=1, handler_ref="M1", member_snapshot_id=10), SimpleNamespace(id=3), SimpleNamespace(name="上级评估"), context(), Db())
    assert result == (False, "TASK_HANDLER_IDENTITY_NOT_FOUND")
    assert len(calls) == 1
    sending.assert_not_awaited()


@pytest.mark.asyncio
async def test_cycle_reminder_preview_without_mapping_records_intended_employee(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as router
    from app.integrations.feishu import notification_service as service
    # blocked 模式下 handler 无身份映射 → 记录 preview 日志，不发送
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="blocked"))
    sending = AsyncMock(side_effect=AssertionError("must not send without mapping"))
    monkeypatch.setattr(router, "send_notification", sending)
    logs = []
    class Db:
        async def scalar(self, statement): return None
        def add(self, log): logs.append(log)
        async def flush(self): pass
    result = await router._send_performance_task_reminder(SimpleNamespace(id=1, handler_ref="M1", member_snapshot_id=10), SimpleNamespace(id=3, name="测试项目"), SimpleNamespace(name="上级评估"), context(), Db())
    assert result == (False, "NOTIFICATION_PREVIEW_ONLY")
    assert logs[0].receiver_snapshot == [{"employee_no": "M1", "identity_status": "unmapped"}]
    assert logs[0].status == "skipped" and logs[0].success_count == 0
    sending.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("delivery_enabled,mapped,handler_status,expected", [(False, False, "在职", True), (True, False, "在职", False), (True, True, "在职", True), (False, False, "离职", False)])
async def test_cycle_reminder_people_use_snapshot_progress_and_profile_visibility(monkeypatch, delivery_enabled, mapped, handler_status, expected):
    from app.performance import projects_router as router
    from app.integrations.feishu import notification_service as service
    from app.performance.models import PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink, PerformanceNodeTaskAuthorization
    from unittest.mock import AsyncMock
    # delivery_enabled=True → normal 模式启用飞书绑定过滤；False → blocked 不过滤
    monkeypatch.setattr(service, "_global_delivery_mode", AsyncMock(return_value="normal" if delivery_enabled else "blocked"))
    project = SimpleNamespace(id=3, name="测试项目", cycle_ref="cycle:1", settings={})
    member = PerformanceProjectMember(snapshot_id=10, employee_no="E1", display_name="员工", organization_ref="集团/研发", department="研发", direct_supervisor_employee_no="M1", hrbp_employee_no="H1", job_family="产品", job_category="技术", position_level="P6")
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    task = SimpleNamespace(id=1, project_id=3, cycle_ref="cycle:1", member_snapshot_id=10, node_snapshot_id=5, target_employee_no="E1", handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None)
    async def managed(*args): return [(project, {"E1"})]
    async def actor(*args): return SimpleNamespace(actor_ref="ADMIN")
    async def rules(*args): return {"activity_manager": ["department"]}
    async def role(*args): return "activity_manager"
    async def scope(*args): return {"E1"}
    async def progress(*args): return {"E1": "2/3"}
    async def previous(*args): return {"E1": "P5"}
    async def ratings(*args, **kwargs): return [], {}, []
    for name, value in [("_managed_completion_projects", managed), ("resolve_trusted_performance_actor", actor), ("load_subject_visibility_rules", rules), ("resolve_subject_visibility_role", role), ("_communication_progress", progress), ("_previous_published_position_levels", previous), ("_project_final_ratings", ratings), ("_project_data_scope", scope)]:
        monkeypatch.setattr(router, name, value)
    values = {
        PerformanceProjectMember: [member],
        PerformanceProjectNodeSnapshot: [node],
        PerformanceNodeTask: [task],
        PerformanceAuthorizationSnapshotPerson: [SimpleNamespace(employee_no="M1", display_name="快照经理", employment_status=handler_status), SimpleNamespace(employee_no="H1", display_name="快照HRBP")],
        PerformanceIdentityLink: ["M1"] if mapped else [], PerformanceNodeTaskAuthorization: [],
    }
    class Db:
        async def scalar(self, query): return 10
        async def get(self, model, key): return SimpleNamespace(source_snapshot_id=20)
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values[query.column_descriptions[0]["entity"]]))
    rows = await router._completion_reminder_rows(1, "work-summary", context(), Db())
    assert rows[0]["reminder_target"] == "快照经理"
    assert rows[0]["completion"] == "2/3"
    assert rows[0]["selectable"] is expected
    assert rows[0]["direct_supervisor"] is None
    assert rows[0]["previous_position_level"] is None
    assert rows[0]["job_category"] is None
    assert rows[0]["organization_path"] == "集团/研发"


@pytest.mark.asyncio
async def test_cycle_reminder_hides_delegation_for_self_and_360_and_calibration_nodes(monkeypatch):
    from app.performance import projects_router as router
    from app.performance.models import PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink, PerformanceNodeTaskAuthorization
    project = SimpleNamespace(id=3, name="测试项目", cycle_ref="cycle:1", settings={})
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    member = PerformanceProjectMember(snapshot_id=10, employee_no="E1", display_name="员工", organization_ref="集团/研发", department="研发", direct_supervisor_employee_no="M1", hrbp_employee_no="H1", job_family="产品", job_category="技术", position_level="P6")
    task = SimpleNamespace(id=1, project_id=3, cycle_ref="cycle:1", member_snapshot_id=10, node_snapshot_id=5, target_employee_no="E1", handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None)
    async def managed(*args): return [(project, None)]
    async def actor(*args): return SimpleNamespace(actor_ref="ADMIN")
    async def rules(*args): return {"activity_manager": ["department"]}
    async def role(*args): return "activity_manager"
    async def progress(*args): return {}
    async def previous(*args): return {}
    async def ratings(*args, **kwargs): return [], {}, []
    async def scope(*args): return None
    async def authorize(*args): return True
    for name, value in [("_managed_completion_projects", managed), ("resolve_trusted_performance_actor", actor), ("load_subject_visibility_rules", rules), ("resolve_subject_visibility_role", role), ("_communication_progress", progress), ("_previous_published_position_levels", previous), ("_project_final_ratings", ratings), ("_project_data_scope", scope), ("_authorize_task_delegation", authorize)]:
        monkeypatch.setattr(router, name, value)
    values = {
        PerformanceProjectMember: [member],
        PerformanceProjectNodeSnapshot: [node],
        PerformanceNodeTask: [task],
        PerformanceAuthorizationSnapshotPerson: [SimpleNamespace(employee_no="M1", display_name="快照经理", employment_status="在职")],
        PerformanceIdentityLink: ["M1"], PerformanceNodeTaskAuthorization: [],
    }
    class Db:
        async def scalar(self, query): return 10
        async def get(self, model, key): return SimpleNamespace(source_snapshot_id=20)
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values[query.column_descriptions[0]["entity"]]))
    node_types = {"work-summary": "work_summary", "self-review": "evaluation", "review-360": "evaluation", "calibration": "calibration", "manager-review": "evaluation", "communicate": "result_communication"}
    role_codes = {"self-review": "assessment.reviewee", "review-360": "assessment.reviewer_360", "manager-review": "assessment.line_manager", "communicate": "assessment.line_manager"}
    task_extra = {"task_kind": "calibration", "phase_id": "p1"}
    calibration = {"role_code": "assessment.calibrator", "phases": [{"phase_id": "p1", "assignments": [{"handler_ref": "M1", "employee_no": "E1", "allow_authorize": True}]}]}
    for node_key, node_type in node_types.items():
        node.config = {"template": {"executor_role_code": role_codes.get(node_key, "")}}
        if node_key == "calibration":
            node.config["calibration"] = calibration
            task.__dict__.update(task_extra)
        node.node_type = node_type
        values[PerformanceProjectNodeSnapshot] = [node]
        rows = await router._completion_reminder_rows(1, node_key, context(), Db())
        assert rows, node_key
        expected = node_key in {"work-summary", "self-review", "review-360", "calibration"}
        assert rows[0]["can_authorize"] is not expected, node_key
        if node_key in {"manager-review", "communicate"}:
            assert rows[0]["task_map"] == [{
                "task_id": 1,
                "stage_key": node_key,
                "stage_id": "summary",
                "stage_label": "上级评估" if node_key == "manager-review" else "绩效沟通并开通结果",
                "role_key": "DIRECT_SUPERVISOR",
                "role_label": "直属上级",
                "handler_ref": "M1",
                "handler_name": "快照经理",
                "can_authorize": True,
            }]
        else:
            assert not rows[0]["task_map"] or rows[0]["task_map"][0]["can_authorize"] is False


@pytest.mark.asyncio
async def test_cycle_reminder_department_filter_matches_path_prefix_and_unassigned(monkeypatch):
    from app.performance import projects_router as router
    from app.performance.models import PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink, PerformanceNodeTaskAuthorization
    project = SimpleNamespace(id=3, name="测试项目", cycle_ref="cycle:1", settings={})
    node = SimpleNamespace(id=5, project_id=3, node_id="summary", node_type="work_summary", config={})
    members = [
        PerformanceProjectMember(snapshot_id=10, employee_no="E1", display_name="甲", company_org="集团", department="研发部", direct_supervisor_employee_no="M1", job_family="产品", job_category="技术", position_level="P6", hrbp_employee_no="H1"),
        PerformanceProjectMember(snapshot_id=10, employee_no="E2", display_name="乙", company_org="集团", department="销售部", direct_supervisor_employee_no="M1", job_family="产品", job_category="技术", position_level="P6", hrbp_employee_no="H1"),
        PerformanceProjectMember(snapshot_id=10, employee_no="E3", display_name="丙", direct_supervisor_employee_no="M1", job_family="产品", job_category="技术", position_level="P6", hrbp_employee_no="H1"),
    ]
    tasks = [SimpleNamespace(id=i, project_id=3, cycle_ref="cycle:1", member_snapshot_id=10, node_snapshot_id=5, target_employee_no=employee, handler_ref="M1", status="pending", submitted_at=None, available_at=None, due_at=None) for i, employee in [(1, "E1"), (2, "E2"), (3, "E3")]]
    async def managed(*args): return [(project, None)]
    async def actor(*args): return SimpleNamespace(actor_ref="ADMIN")
    async def rules(*args): return {"activity_manager": ["department"]}
    async def role(*args): return "activity_manager"
    async def progress(*args): return {}
    async def previous(*args): return {}
    async def ratings(*args, **kwargs): return [], {}, []
    async def scope(*args): return None
    for name, value in [("_managed_completion_projects", managed), ("resolve_trusted_performance_actor", actor), ("load_subject_visibility_rules", rules), ("resolve_subject_visibility_role", role), ("_communication_progress", progress), ("_previous_published_position_levels", previous), ("_project_final_ratings", ratings), ("_project_data_scope", scope)]:
        monkeypatch.setattr(router, name, value)
    values = {
        PerformanceProjectMember: members,
        PerformanceProjectNodeSnapshot: [node],
        PerformanceNodeTask: tasks,
        PerformanceAuthorizationSnapshotPerson: [SimpleNamespace(employee_no="M1", display_name="快照经理", employment_status="在职")],
        PerformanceIdentityLink: ["M1"], PerformanceNodeTaskAuthorization: [],
    }
    class Db:
        async def scalar(self, query): return 10
        async def get(self, model, key): return SimpleNamespace(source_snapshot_id=20)
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values[query.column_descriptions[0]["entity"]]))
    rows = await router._completion_reminder_rows(1, "work-summary", context(), Db())
    assert {row["employee_no"] for row in rows} == {"E1", "E2", "E3"}
    scoped = await router._completion_reminder_rows(1, "work-summary", context(), Db(), department="集团/研发部")
    assert [row["employee_no"] for row in scoped] == ["E1"]
    assert scoped[0]["department_path"] == "集团/研发部"
    unassigned = await router._completion_reminder_rows(1, "work-summary", context(), Db(), department="未分配部门")
    assert [row["employee_no"] for row in unassigned] == ["E3"]
    assert unassigned[0]["department_path"] == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("function_key", ["performance.frontend.authorize-evaluation-tasks", "performance.frontend.authorize-calibration-tasks"])
async def test_task_authorization_view_without_operation_permission(statistics_db, function_key):
    from fastapi import HTTPException
    from app.performance import projects_router as routes
    db = statistics_db
    target = db.projects[0]
    original_get = db.get

    async def get(model, key):
        return db.cycle if model is routes.PerformanceCycle else await original_get(model, key)
    db.get = get
    assert await routes._task_authorization_projects(1, context(), db, function_key) == [(target, None)]
    with pytest.raises(HTTPException) as denied:
        await routes._task_management_scope(context(), target, db, function_key)
    assert denied.value.detail == "PROJECT_DATA_FORBIDDEN"
    target.administrators = []
    with pytest.raises(HTTPException) as denied:
        await routes._task_authorization_projects(1, context(), db, function_key)
    assert denied.value.detail == "TASK_AUTHORIZATION_FORBIDDEN"


@pytest.mark.asyncio
async def test_task_authorization_view_unions_scopes_without_expanding_operations(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router as routes
    async def scope(_context, _project, _db, key):
        return {"performance.frontend.progress": {"A"}, "performance.frontend.data-view": {"B"}, routes.TASK_EVALUATION_AUTHORIZATION_KEY: {"C"}}[key]
    monkeypatch.setattr(routes, "_task_management_scope", scope)
    assert await routes._task_authorization_view_scope(None, None, None, routes.TASK_EVALUATION_AUTHORIZATION_KEY) == {"A", "B", "C"}
    assert await routes._task_management_scope_or_empty(None, None, None, routes.TASK_EVALUATION_AUTHORIZATION_KEY) == {"C"}
    async def ambiguous(*args):
        raise HTTPException(403, "PROJECT_ADMIN_IDENTITY_AMBIGUOUS")
    monkeypatch.setattr(routes, "_task_management_scope", ambiguous)
    with pytest.raises(HTTPException, match="PROJECT_ADMIN_IDENTITY_AMBIGUOUS"):
        await routes._task_authorization_view_scope(None, None, None, routes.TASK_EVALUATION_AUTHORIZATION_KEY)


@pytest.mark.asyncio
@pytest.mark.parametrize("allowed", [False, True])
async def test_calibration_authorization_view_separates_operation_capabilities(monkeypatch, allowed):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    project_row = SimpleNamespace(id=3, settings={})
    node = SimpleNamespace(id=4, node_id="cal", project_id=3, config={"calibration": {"phases": [{"phase_id": "p1", "assignments": [{"handler_ref": "H", "employee_no": "E", "allow_authorize": True}]}]}})
    task = SimpleNamespace(id=7, phase_id="p1", handler_ref="H", target_employee_no="E", status="pending")
    record = SimpleNamespace(id=8, task_id=7, grantor_employee_no="H", recipient_employee_no="R", created_at=None)
    monkeypatch.setattr(routes, "_task_authorization_projects", AsyncMock(return_value=[(project_row, {"E"})]))
    monkeypatch.setattr(routes, "_task_management_scope_or_empty", AsyncMock(return_value=None if allowed else set()))
    monkeypatch.setattr(routes, "_get_cycle", AsyncMock(return_value=SimpleNamespace(name="周期")))
    monkeypatch.setattr(routes, "calibration_task_scope", lambda *args: True)
    monkeypatch.setattr(routes, "calibration_phase_window", lambda *args: {})
    monkeypatch.setattr(routes, "distribution_summary", lambda *args: {})
    class Db:
        async def scalar(self, statement): return 1
        async def get(self, model, key): return SimpleNamespace(source_snapshot_id=2)
        async def execute(self, statement):
            model = statement.column_descriptions[0]["entity"]
            rows = {routes.PerformanceAuthorizationSnapshotPerson: [], routes.PerformanceProjectNodeSnapshot: [node], routes.PerformanceNodeTask: [task], routes.PerformanceNodeTaskAuthorization: [record]}[model]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))
    result = await routes.project_management_calibration_authorization(1, context(), Db())
    row, = result["items"]
    assert row["task_ids"] == [7] and row["allow_authorize"] is True
    assert row["can_authorize"] is allowed and row["can_revoke"] is allowed
    assert len(row["authorizations"]) == 1


@pytest.mark.asyncio
async def test_member_task_options_disable_management_buttons_even_for_original_handler(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    node = SimpleNamespace(node_id="manager", node_type="evaluation", config={"template": {"executor_role_code": "assessment.line_manager", "executor_types": ["DIRECT_MANAGER"]}})
    member = SimpleNamespace(employee_no="E", direct_supervisor_employee_no="H", hrbp_employee_no=None)
    task = SimpleNamespace(id=7, node_snapshot_id=4, handler_ref="H", target_employee_no="E")
    authorize = AsyncMock(return_value=True)
    monkeypatch.setattr(routes, "_authorize_task_delegation", authorize)
    options = await routes._member_task_options(member, [task], {4: {"node": node, "key": "manager", "label": "上级评估"}}, {}, set(), project("STARTED"), context(), "H", object(), management_only=True)
    assert len(options) == 1 and options[0].can_authorize is False
    authorize.assert_not_awaited()


@pytest.mark.asyncio
async def test_authorization_records_reject_user_without_management_permission(monkeypatch):
    from app.performance import projects_router as router
    from fastapi import HTTPException

    async def denied(*args):
        raise HTTPException(status_code=404, detail="CYCLE_NOT_FOUND")

    monkeypatch.setattr(router, "_task_authorization_projects", denied)
    with pytest.raises(HTTPException) as failure:
        await router.project_management_authorization_records(1, context(), None)
    assert failure.value.status_code == 404


@pytest.mark.asyncio
async def test_authorization_records_apply_project_employee_scope_and_revoke_events(monkeypatch):
    from app.performance import projects_router as router
    from datetime import UTC, datetime
    project = SimpleNamespace(id=3, cycle_ref="cycle:1")
    async def managed(*args): return [(project, {"E1"})]
    monkeypatch.setattr(router, "_task_authorization_projects", managed)
    async def scope(*args): return {"E1"}
    monkeypatch.setattr(router, "_task_management_scope", scope)
    events = [
        SimpleNamespace(id=3, subject_ref="7", employee_no="E1", event_type="PERFORMANCE_TASK_AUTHORIZATION_REVOKED", after_state={"project_id": 3, "authorization_id": 1}),
        SimpleNamespace(id=2, subject_ref="7", employee_no="HIDDEN", event_type="PERFORMANCE_TASK_AUTHORIZED", after_state={"project_id": 3}),
        SimpleNamespace(id=1, subject_ref="7", employee_no="E1", actor_ref="A1", event_type="PERFORMANCE_TASK_AUTHORIZED", after_state={"project_id": 3, "recipient_ref": "M1", "stage_names": ["上级评估"]}, event_at=datetime(2026, 11, 1, tzinfo=UTC)),
    ]
    class Db:
        async def scalar(self, query): return SimpleNamespace(node_type="evaluation")
        async def get(self, model, key): return None
        async def execute(self, query): return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: events))
    result = await router.project_management_authorization_records(1, context("performance.projects.manage"), Db())
    assert len(result["authorization_records"]) == 1
    assert result["authorization_records"][0]["status"] == "已撤销"
    assert result["authorization_records"][0]["can_revoke"] is False


def test_task_authorization_migration_and_effective_handler_sql_round_trip():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text, select
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.performance.models import PerformanceNodeTask
    from app.performance.task_authorization_service import task_handler_condition
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0290_performance_task_authorizations.py"
    spec = importlib.util.spec_from_file_location("task_authorization_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE performance_projects (id BIGINT PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE performance_node_tasks (id BIGINT PRIMARY KEY, project_id BIGINT, cycle_ref TEXT, handler_ref TEXT, revoked_at TIMESTAMP)"))
        connection.execute(text("INSERT INTO performance_node_tasks VALUES (1, 3, 'C1', 'ORIGINAL', NULL)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert migration.down_revision == "0289_pm_task_drafts"
            def visible(actor):
                return connection.execute(select(PerformanceNodeTask.id).where(task_handler_condition(actor))).scalars().all()
            assert visible("ORIGINAL") == [1]
            assert visible("DELEGATE") == []
            connection.execute(text("INSERT INTO performance_node_task_authorizations (id, task_id, project_id, cycle_ref, authorization_type, grantor_employee_no, recipient_employee_no, reason, status) VALUES (1, 1, 3, 'C1', 'AUTHORIZE', 'ORIGINAL', 'DELEGATE', '测试授权', 'ACTIVE')"))
            assert visible("ORIGINAL") == [1]
            assert visible("DELEGATE") == [1]
            connection.execute(text("UPDATE performance_node_task_authorizations SET status='REPLACED' WHERE id=1"))
            connection.execute(text("INSERT INTO performance_node_task_authorizations (id, task_id, project_id, cycle_ref, authorization_type, grantor_employee_no, recipient_employee_no, reason, status) VALUES (2, 1, 3, 'C1', 'TRANSFER', 'ORIGINAL', 'RECIPIENT', '测试转交', 'ACTIVE')"))
            assert visible("ORIGINAL") == []
            assert visible("DELEGATE") == []
            assert visible("RECIPIENT") == [1]
            connection.execute(text("UPDATE performance_node_task_authorizations SET status='REVOKED' WHERE id=2"))
            assert visible("ORIGINAL") == [1]
            assert visible("RECIPIENT") == []
            assert connection.scalar(text("SELECT handler_ref FROM performance_node_tasks WHERE id=1")) == "ORIGINAL"
            with pytest.raises(RuntimeError, match="禁止删除"):
                migration.downgrade()
            connection.execute(text("DELETE FROM performance_node_task_authorizations"))
            migration.downgrade()
            migration.upgrade()
    engine.dispose()


@pytest.mark.asyncio
async def test_task_authorization_persists_without_rewriting_handler_or_answers(monkeypatch):
    from app.performance import projects_router as router
    from app.performance.models import PerformanceNodeTaskAuthorization
    task = SimpleNamespace(id=7, project_id=3, member_snapshot_id=10, cycle_ref="C1", handler_ref="ORIGINAL", target_employee_no="E1", task_kind="evaluation", status="pending", submitted_at=None, available_at=None, due_at=None, answers={"field": "submitted-history"}, draft_answers={"field": "draft-history"}, answer_version=4)
    node = SimpleNamespace(id=5, project_id=3, node_type="evaluation", node_id="leader", name="上级评估", config={})
    project = SimpleNamespace(id=3, cycle_ref="C1", status="STARTED", settings={})
    recipient = SimpleNamespace(employee_no="RECIPIENT", display_name="被授权人", employment_status="在职")
    async def actor(*args, **kwargs): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ORIGINAL")
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    from unittest.mock import AsyncMock
    monkeypatch.setattr(router, "_task_management_scope", AsyncMock(return_value=None))
    records = []
    class Db:
        async def execute(self, statement):
            if statement.column_descriptions[0]["entity"] is PerformanceNodeTaskAuthorization:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: records))
            return SimpleNamespace(first=lambda: (task, node, project))
        async def refresh(self, *args, **kwargs): pass
        async def get(self, model, key): return SimpleNamespace(source_snapshot_id=20)
        async def scalar(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is not None and entity.__name__ == "PerformanceProject":
                return project
            return recipient if entity is not None and entity.__name__ == "PerformanceAuthorizationSnapshotPerson" else 10
        def add(self, item):
            if isinstance(item, PerformanceNodeTaskAuthorization): records.append(item)
        async def flush(self):
            for index, record in enumerate(records, 1): record.id = index
        async def commit(self): pass
    await router.create_task_delegation(3, 7, router.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", reason="授权代办"), context(), Db())
    assert records[0].authorization_type == "AUTHORIZE"
    assert task.handler_ref == "ORIGINAL"
    assert task.answers == {"field": "submitted-history"}
    assert task.draft_answers == {"field": "draft-history"}
    assert task.answer_version == 4
    assert await router._task_handlers(Db(), task) == {"ORIGINAL", "RECIPIENT"}


@pytest.mark.asyncio
async def test_task_delegation_grantor_and_reauthorize_boundaries(monkeypatch):
    from app.performance import projects_router as router
    from fastapi import HTTPException
    task = SimpleNamespace(id=1, handler_ref="ORIGINAL", target_employee_no="E1")
    node = SimpleNamespace(node_type="evaluation")
    project = SimpleNamespace(settings={})
    active = [SimpleNamespace(recipient_employee_no="DELEGATE", authorization_type="AUTHORIZE", authorization_settings={"allow_reauthorize": False})]
    async def delegations(*args): return active
    async def scope(*args): raise HTTPException(status_code=403, detail="PROJECT_DATA_FORBIDDEN")
    monkeypatch.setattr(router, "_task_delegations", delegations)
    monkeypatch.setattr(router, "_project_data_scope", scope)
    assert await router._authorize_task_delegation(task, node, project, context(), "ORIGINAL", None)
    assert not await router._authorize_task_delegation(task, node, project, context(), "DELEGATE", None)


@pytest.mark.asyncio
async def test_task_delegation_parent_revoke_replaces_descendants(monkeypatch):
    from app.performance import projects_router as router
    task = SimpleNamespace(id=7, project_id=3, task_kind="evaluation", cycle_ref="C1", target_employee_no="E1", answer_version=9, answers={"grade": "A"}, draft_answers={"grade": "B"})
    parent = SimpleNamespace(id=11, status="ACTIVE", grantor_employee_no="ORIGINAL", recipient_employee_no="RECIPIENT", authorization_settings={}, revoked_by_employee_no=None, revoked_at=None)
    child = SimpleNamespace(id=12, status="ACTIVE", grantor_employee_no="RECIPIENT", recipient_employee_no="CHILD", authorization_settings={"parent_authorization_id": 11})
    project = SimpleNamespace(id=3, cycle_ref="C1")
    async def actor(*args, **kwargs): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ORIGINAL")
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    class Db:
        async def execute(self, statement):
            return SimpleNamespace(first=lambda: (task, SimpleNamespace(), project, parent), scalars=lambda: SimpleNamespace(all=lambda: [parent, child]))
        async def refresh(self, *args, **kwargs): pass
        async def scalar(self, statement): return project
        def add(self, item): pass
        async def commit(self): pass
    await router.revoke_task_delegation(3, 7, 11, context(), Db())
    assert parent.status == "REVOKED"
    assert child.status == "REPLACED"
    assert task.answers == {"grade": "A"} and task.draft_answers == {"grade": "B"}


@pytest.mark.asyncio
async def test_revoke_task_authorization_preserves_submitted_and_draft_answers(monkeypatch):
    from app.performance import projects_router as router
    task = SimpleNamespace(id=7, project_id=3, task_kind="evaluation", cycle_ref="C1", target_employee_no="E1", answer_version=9, answers={"grade": "A"}, draft_answers={"grade": "B"})
    record = SimpleNamespace(id=11, status="ACTIVE", grantor_employee_no="ORIGINAL", recipient_employee_no="RECIPIENT")
    project = SimpleNamespace(id=3, cycle_ref="C1")
    async def actor(*args, **kwargs): return SimpleNamespace(actor_type="EMPLOYEE", actor_ref="ORIGINAL")
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", actor)
    class Db:
        async def execute(self, statement): return SimpleNamespace(first=lambda: (task, SimpleNamespace(), project, record), scalars=lambda: SimpleNamespace(all=lambda: []))
        async def refresh(self, *args, **kwargs): pass
        async def scalar(self, statement): return project
        def add(self, item): pass
        async def commit(self): pass
    result = await router.revoke_task_delegation(3, 7, 11, context(), Db())
    assert result == {"id": 11, "status": "REVOKED", "answer_version": 9}
    assert task.answers == {"grade": "A"}
    assert task.draft_answers == {"grade": "B"}
    assert record.revoked_by_employee_no == "ORIGINAL"


@pytest.mark.asyncio
async def test_authorization_postgres_migration_and_reopen():
    import os
    if os.getenv("RUN_PERFORMANCE_DB_TEST") != "1":
        pytest.skip("需显式启用本地隔离数据库验收")
    import importlib.util
    from pathlib import Path
    from uuid import uuid4
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    assert settings.DB_HOST in {"127.0.0.1", "localhost"} and settings.APP_ENV != "prod"
    schema = "pm_auth_" + uuid4().hex
    engine = create_async_engine(settings.db_url_async)
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0290_performance_task_authorizations.py"
    spec = importlib.util.spec_from_file_location("authorization_pg_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    try:
        async with engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            await connection.execute(text("CREATE TABLE performance_projects (id BIGINT PRIMARY KEY)"))
            await connection.execute(text("CREATE TABLE performance_node_tasks (id BIGINT PRIMARY KEY)"))
            def upgrade(sync):
                with Operations.context(MigrationContext.configure(sync)):
                    migration.upgrade()
            await connection.run_sync(upgrade)
            await connection.execute(text("INSERT INTO performance_projects VALUES (1)"))
            await connection.execute(text("INSERT INTO performance_node_tasks VALUES (1)"))
            await connection.execute(text("INSERT INTO performance_node_task_authorizations (task_id,project_id,cycle_ref,authorization_type,grantor_employee_no,recipient_employee_no,reason,authorization_settings) VALUES (1,1,'C1','AUTHORIZE','A','B','test',CAST(:settings AS JSONB))"), {"settings": '{"allow_reauthorize":true}'})
        async with engine.begin() as connection:
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            assert (await connection.execute(text("SELECT recipient_employee_no, authorization_settings->>'allow_reauthorize' FROM performance_node_task_authorizations"))).one() == ("B", "true")
            await connection.execute(text("UPDATE performance_node_task_authorizations SET status='REVOKED'"))
        async with engine.begin() as connection:
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            assert await connection.scalar(text("SELECT status FROM performance_node_task_authorizations")) == "REVOKED"
            def downgrade(sync):
                with Operations.context(MigrationContext.configure(sync)):
                    migration.downgrade()
            with pytest.raises(RuntimeError, match="禁止删除"):
                await connection.run_sync(downgrade)
            await connection.execute(text("DELETE FROM performance_node_task_authorizations"))
            await connection.run_sync(downgrade)
            await connection.run_sync(upgrade)
    finally:
        async with engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await engine.dispose()


def _reporting_filter_people():
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people

    return [SimpleNamespace(**vars(person)) for person in build_snapshot_people([
        RosterAuthorizationInput(employee_no=employee_no, display_name=employee_no, direct_supervisor_source_value=manager,
                                 company_org="集团", department=department, employment_status="在职")
        for employee_no, manager, department in [
            ("E1", "M1", "研发"), ("E2", "E1", "研发"), ("E3", "M2", "销售"),
            ("M1", "M2", "管理"), ("M2", "M3", "管理"), ("M3", "M4", "管理"),
            ("M4", None, "管理"), ("EMPTY", None, "研发"),
        ]
    ])]


@pytest.mark.parametrize("field,operator,expected", [
    ("directLeader", "include", {"M1", "E3"}),
    ("directLeader", "exclude", {"E1", "E2", "M2", "M3", "M4", "EMPTY"}),
    ("superior", "include", {"E1", "E2", "E3", "M1"}),
    ("superior", "exclude", {"M2", "M3", "M4", "EMPTY"}),
])
def test_reporting_filter_direct_indirect_and_exclusion(field, operator, expected):
    condition = {"field": field, "operator": operator, "values": [" M2 ", "M2", "UNKNOWN"]}
    rules = PerformanceProjectService._validate_rules({"groups": [{"conditions": [condition]}]})
    assert rules["groups"][0]["conditions"][0]["values"] == ["M2", "UNKNOWN"]
    target = project()
    _, _, _, target.settings = PerformanceProjectService._validate_payload({"name": target.name, "evaluator_rules": rules})
    assert PerformanceProjectService.serialize(target)["evaluator_rules"] == rules
    selected = PerformanceProjectService._select_people(_reporting_filter_people(), target.settings)
    assert {person.employee_no for person in selected} == expected


@pytest.mark.parametrize("field", ["directLeader", "superior"])
@pytest.mark.parametrize("operator", ["before", "not_before", "after", "not_after"])
def test_reporting_filter_rejects_date_operators(field, operator):
    with pytest.raises(ProjectValidationError, match="筛选条件不合法"):
        PerformanceProjectService._validate_rules({"groups": [{"conditions": [{
            "field": field, "operator": operator, "values": ["M1"],
        }]}]})


@pytest.mark.parametrize("field", ["directLeader", "superior"])
@pytest.mark.parametrize("values", [[], [" "], [1], "M1", None])
def test_reporting_filter_rejects_empty_or_non_string_values(field, values):
    with pytest.raises(ProjectValidationError):
        PerformanceProjectService._validate_rules({"groups": [{"conditions": [{
            "field": field, "operator": "include", "values": values,
        }]}]})


def test_reporting_filter_preserves_and_or_scope_and_group_preview():
    rules = {"groups": [
        {"conditions": [{"field": "superior", "operator": "include", "values": ["M4"]},
                        {"field": "directLeader", "operator": "include", "values": ["M1"]}]},
        {"conditions": [{"field": "superior", "operator": "include", "values": ["M4"]},
                        {"field": "department", "operator": "include", "values": ["销售"]}]},
    ]}
    scope = {"groups": [{"conditions": [{"field": "department", "operator": "include", "values": ["集团/研发", "集团/销售"]}]}]}
    settings = {"evaluator_rules": PerformanceProjectService._validate_rules(rules), "scope_rules": scope}
    people = _reporting_filter_people()
    assert {person.employee_no for person in PerformanceProjectService._select_people(people, settings)} == {"E1", "E3"}
    assert [person.employee_no for person in PerformanceProjectService._matching_people(people, settings, group_index=0)] == ["E1"]
    assert [person.employee_no for person in PerformanceProjectService._matching_people(people, settings, group_index=1)] == ["E3"]


def test_reporting_filter_cycle_self_missing_parent_and_dict_protection():
    people = [
        {"employee_no": "E", "direct_supervisor_employee_no": "M1"},
        {"employee_no": "M1", "direct_supervisor_employee_no": "M2"},
        {"employee_no": "M2", "direct_supervisor_employee_no": "E"},
        {"employee_no": "SELF", "direct_supervisor_employee_no": "SELF"},
        {"employee_no": "BROKEN", "direct_supervisor_employee_no": "MISSING"},
    ]
    by_employee = {person["employee_no"]: person for person in people}
    assert PerformanceProjectService._person_values(people[0], by_employee)["superior"] == {"M1", "M2"}
    assert PerformanceProjectService._person_values(people[1], by_employee)["superior"] == {"M2", "E"}
    assert PerformanceProjectService._person_values(people[3], by_employee)["superior"] == set()
    assert PerformanceProjectService._person_values(people[3], by_employee)["directLeader"] == "SELF"
    assert PerformanceProjectService._person_values(people[4], by_employee)["superior"] == {"MISSING"}
    rules = {"groups": [{"conditions": [{"field": "superior", "operator": "include", "values": ["SELF"]}]}]}
    assert PerformanceProjectService._select_people(people, {"evaluator_rules": rules}) == []
    rules["groups"][0]["conditions"][0]["operator"] = "exclude"
    assert PerformanceProjectService._select_people(people, {"evaluator_rules": rules}) == people


@pytest.mark.asyncio
@pytest.mark.parametrize("field,selected_manager,expected", [
    ("directLeader", "M1", {"E1"}),
    ("superior", "M4", {"E1", "E2", "E3"}),
])
async def test_reporting_filter_preview_start_share_unchanged_cycle_snapshot(monkeypatch, field, selected_manager, expected):
    from copy import deepcopy
    from app.performance import project_service, models

    people = _reporting_filter_people()
    next(person for person in people if person.employee_no == "M1").employment_status = "离职"
    cycle = SimpleNamespace(cycle_ref="cycle:one", leaver_enabled=False)
    snapshot = SimpleNamespace(id=7, status="LOCKED")
    target = project()
    target.settings = {
        "template_id": 11,
        "evaluator_rules": PerformanceProjectService._validate_rules({"groups": [{"conditions": [
            {"field": field, "operator": "include", "values": [selected_manager]},
            {"field": "department", "operator": "include", "values": ["研发", "销售"]},
        ]}]}),
        "flow_settings": {"node_settings": {"view": {"result_view": {"automatic_enabled": True}}}},
        "configuration_completed": True,
    }
    workflow = SimpleNamespace(content_library=[], nodes=[
        {"node_id": "summary", "node_type": "work_summary", "name": "总结", "include_final_result": True, "executor_types": ["SUBJECT"]},
        {"node_id": "view", "node_type": "result_view", "name": "结果"},
    ])
    live_people = deepcopy(people)

    async def forbidden_roster(*_args):
        raise AssertionError("汇报链筛选禁止读取实时花名册")
    monkeypatch.setattr(project_service, "_canonical_roster_rows", forbidden_roster)

    class Db:
        def __init__(self):
            self.added = []
        async def scalar(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            return cycle if entity is models.PerformanceCycle else snapshot if entity is models.PerformanceAuthorizationSnapshot else None
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            assert entity in {models.PerformanceAuthorizationSnapshotPerson, models.PerformanceProjectMember,
                              models.PerformanceCycleProjectManager, models.PerformanceRole}
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
        async def refresh(self, _obj, **kwargs):
            pass

    db = Db()
    service = PerformanceProjectService(db)
    before = deepcopy([vars(person) for person in people])
    matched, tasks, reports = await service.preview_people(cycle, target.settings)
    assert {person.employee_no for person in matched} == expected
    assert tasks == matched and reports == []
    assert await service.evaluator_count(cycle, target.settings["evaluator_rules"]) == len(expected)
    for person in live_people:
        person.direct_supervisor_employee_no = "NEW_MANAGER"
        person.display_name = "实时已改名"
    assert {person.employee_no for person in (await service.preview_people(cycle, target.settings))[0]} == expected
    await service.start_project(target, actor_type="PORTAL_USER", actor_id=1)
    members = [obj for obj in db.added if isinstance(obj, models.PerformanceProjectMember)]
    generated = [obj for obj in db.added if isinstance(obj, models.PerformanceNodeTask)]
    assert {person.employee_no for person in members} == expected
    assert {task.target_employee_no for task in generated} == expected
    assert {person.employee_no: person.direct_supervisor_employee_no for person in members} == {
        person.employee_no: person.direct_supervisor_employee_no for person in people if person.employee_no in expected
    }
    assert [vars(person) for person in people] == before
    assert target.status == "STARTED"


@pytest.fixture
def management_member_data(monkeypatch):
    from datetime import UTC, datetime
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    from app.performance import models
    target = SimpleNamespace(id=1, cycle_ref="C1", settings={})
    members = [models.PerformanceProjectMember(id=index, snapshot_id=7, employee_no=f"E{index}", display_name=f"员工{index}") for index in (1, 2)]
    def node(index, kind, role="assessment.line_manager", final=False):
        template = {"executor_role_code": role, "include_final_result": final, "content": [{"content_id": "content", "type": "work_summary", "name": "评价", "items": [{"id": "text", "label": "说明", "kind": "fill"}]}]}
        return SimpleNamespace(id=index, project_id=1, node_id=f"node-{index}", name=f"环节{index}", node_type=kind, node_order=index, config={"template": template})
    nodes = [node(10, "work_summary", "assessment.reviewee"), node(20, "evaluation", final=True), node(30, "result_communication")]
    def task(index, node_id=20, employee_no="E1", submitted=True):
        return SimpleNamespace(id=index, project_id=1, cycle_ref="C1", node_snapshot_id=node_id, member_snapshot_id=7, target_employee_no=employee_no, handler_ref=f"M{index}", task_kind=next(row.node_type for row in nodes if row.id == node_id), status="completed" if submitted else "pending", submitted_at=datetime(2026, 1, index, tzinfo=UTC) if submitted else None, available_at=None, due_at=None, answer_version=1, revoked_at=None, answers={"text": f"已提交{index}" if submitted else "未提交秘密", "unknown": "未知字段"}, draft_answers={"text": "草稿秘密"})
    tasks = [task(1, 10), task(2), task(3), task(4, submitted=False), task(5, 30), task(6, 30)]
    class Db:
        def __init__(self): self.queries = []
        async def scalar(self, query):
            self.queries.append(query)
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            if "performance_result_openings" in sql: return None
            if "performance_cycles" in sql:
                return SimpleNamespace(name="测试周期", start_at=datetime(2026, 1, 1, tzinfo=UTC), end_at=datetime(2026, 12, 31, tzinfo=UTC))
            assert "performance_project_member_snapshots.project_id = 1" in sql
            assert "performance_project_members.employee_no = 'E1'" in sql
            if "performance_project_members.id = 999" in sql: return None
            return members[0]
        async def get(self, model, key):
            return target if model is models.PerformanceProject else None
        async def execute(self, query):
            self.queries.append(query)
            entity = query.column_descriptions[0]["entity"]
            if entity is models.PerformanceAuthorizationSnapshotPerson:
                return SimpleNamespace(all=lambda: [(task.handler_ref, f"冻结处理人{task.id}") for task in tasks])
            if entity is models.PerformanceNodeTaskAuthorization:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []), all=lambda: [], first=lambda: None)
            values = nodes if entity is models.PerformanceProjectNodeSnapshot else tasks if entity is models.PerformanceNodeTask else members
            rows = list(values)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows), all=lambda: rows, first=lambda: rows[0] if rows else None)
    monkeypatch.setattr(routes, "_get_project", AsyncMock(return_value=target))
    monkeypatch.setattr(routes, "_project_data_scope", AsyncMock(return_value=None))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="ADMIN")))
    monkeypatch.setattr(routes, "load_subject_visibility_rules", AsyncMock(return_value={"activity_manager": [], "hrbp": []}))
    monkeypatch.setattr(routes, "_snapshot_supervisor_names", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "_communication_progress", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "_communication_progress_detail", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "_delegatable_stages", AsyncMock(return_value={}))
    return SimpleNamespace(routes=routes, project=target, members=members, nodes=nodes, tasks=tasks, db=Db(), task=task, node=node)


@pytest.mark.asyncio
async def test_management_detail_defaults_latest_communication_merges_tasks_and_hides_drafts(management_member_data):
    data = management_member_data
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    assert detail["root_review_id"] == 1
    assert detail["default_active_tab"] == "management-node-30"
    assert detail["task_id"] == 6
    assert [tab["node_id"] for tab in detail["management_tabs"]] == ["node-30", "node-20", "node-10"]
    final = detail["management_tabs"][1]
    assert len(final["form_schema"]) == 2
    assert len(final["answers"]) == 2
    assert set(final["answers"].values()) == {"已提交2", "已提交3"}
    assert "冻结处理人2" in final["form_schema"][0]["name"]
    assert final["status"] == "pending"
    assert detail["person"]["visibility_role"] == "activity_manager"
    assert not detail["editable"] and not detail["submit_allowed"]
    assert detail["draft_answers"] == {} and not detail["has_draft"]
    assert "草稿秘密" not in str(detail) and "未提交秘密" not in str(detail) and "未知字段" not in str(detail)
    task_sql = [str(query.compile(compile_kwargs={"literal_binds": True})) for query in data.db.queries if "performance_node_tasks" in str(query)]
    assert all("performance_node_tasks.member_snapshot_id = 7" in sql for sql in task_sql)
    assert "performance_project_members.id = 1" in str(data.db.queries[0].compile(compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["forbidden", "outside_scope", "foreign_root"])
async def test_management_detail_denies_before_content_read(management_member_data, monkeypatch, scenario):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    data = management_member_data
    if scenario == "forbidden":
        monkeypatch.setattr(data.routes, "_project_data_scope", AsyncMock(side_effect=HTTPException(403, "PROJECT_DATA_FORBIDDEN")))
    if scenario == "outside_scope":
        monkeypatch.setattr(data.routes, "_project_data_scope", AsyncMock(return_value={"E2"}))
    with pytest.raises(HTTPException) as error:
        await data.routes._project_member_detail(data.project, "E1", context(), data.db, 999 if scenario == "foreign_root" else 1)
    assert error.value.status_code == (403 if scenario == "forbidden" else 404)
    assert len(data.db.queries) == (1 if scenario == "foreign_root" else 0)


@pytest.mark.asyncio
async def test_management_detail_falls_back_to_final_and_respects_reference_projection(management_member_data):
    data = management_member_data
    data.tasks[:] = [task for task in data.tasks if task.node_snapshot_id != 30]
    data.nodes[1].config["template"]["content"].append({"content_slot": "reference", "reference_kind": "node", "reference_value": "node-10", "reference_settings": {"page_name": "总结参考", "content_settings": {"content": {"root": {"allowView": False}}}}})
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    assert detail["default_active_tab"] == "management-node-20"
    summary = next(tab for tab in detail["management_tabs"] if tab["node_id"] == "node-10")
    assert summary["node_name"] == "总结参考"
    assert summary["form_schema"] == [] and summary["answers"] == {}


@pytest.mark.asyncio
async def test_management_detail_okr_loaded_only_when_configured_without_handler_task(management_member_data, monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import okr_provider
    data = management_member_data
    periods = [okr_provider.OkrView(period_id="current", period_label="本期"), okr_provider.OkrView(period_id="previous", period_label="上期")]
    fetch = AsyncMock(return_value=periods)
    monkeypatch.setattr(okr_provider, "fetch_employee_okrs", fetch)
    await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    fetch.assert_not_awaited()
    data.nodes[-1].config["template"]["content"].append({"content_slot": "reference", "reference_kind": "more", "reference_value": "okr"})
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    fetch.assert_awaited_once_with(data.db, "E1")
    okr = detail["management_tabs"][-1]
    assert okr["kind"] == "okr" and okr["task_id"] is None and okr["okr"].period_label == "本期"
    assert okr["okrs"] == periods


@pytest.mark.asyncio
async def test_management_detail_masks_360_until_anonymous_projection_is_available(management_member_data):
    data = management_member_data
    data.nodes[1].config["template"]["executor_role_code"] = "assessment.reviewer_360"
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    feedback = detail["management_tabs"][1]
    assert feedback["form_schema"] == [] and feedback["answers"] == {}
    assert feedback["task_id"] is None and feedback["submitted_by"] is None and feedback["submitted_at"] is None
    assert "M2" not in str(detail) and "冻结处理人2" not in str(detail)


@pytest.mark.asyncio
async def test_management_detail_360_stage_view_exposes_fill_or_remind_for_anonymous_node(management_member_data):
    from unittest.mock import AsyncMock
    data = management_member_data
    data.nodes[1].config["template"]["executor_role_code"] = "assessment.reviewer_360"
    for index in (2, 3, 4):
        data.tasks[index - 1].submitted_at = None
        data.tasks[index - 1].status = "pending"
    # actor 是 360 任务的处理人：应显示「填写评估」
    for index in (2, 3, 4):
        data.tasks[index - 1].handler_ref = "ADMIN"
    data.routes.resolve_trusted_performance_actor = AsyncMock(return_value=SimpleNamespace(actor_ref="ADMIN"))
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    stage = next(view for view in detail["stage_views"] if view["node_id"] == "node-20")
    assert stage["anonymous"] is True
    assert stage["can_fill"] is True and stage["reminder_target"] is None
    assert stage["task_id"] == 4
    # actor 非处理人：应显示「催办」
    for index in (2, 3, 4):
        data.tasks[index - 1].handler_ref = "M4"
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    stage = next(view for view in detail["stage_views"] if view["node_id"] == "node-20")
    assert stage["can_fill"] is False
    assert stage["reminder_target"]


@pytest.mark.asyncio
@pytest.mark.parametrize("column_count", [1, 2])
async def test_management_list_dynamic_final_ratings_empty_page_and_sort_validation(management_member_data, monkeypatch, column_count):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    data = management_member_data
    schema = [{"id": "result", "fields": [{"id": f"grade-{i}", "label": f"指标{i}", "type": "rating", "options": [{"id": "a", "label": "优秀", "color": "#123456", "foreground": "#ffffff"}]} for i in range(column_count)]}]
    schema_loader = AsyncMock(return_value=schema)
    monkeypatch.setattr(data.routes, "_matrix_node_schema", schema_loader)
    data.tasks[2].answers = {f"grade-{i}": "a" for i in range(column_count)}
    data.tasks[-1].answers = {f"grade-{i}": "invalid" for i in range(column_count)}
    page = await data.routes.list_project_members(1, None, 1, 1, "rating:grade-0", "asc", context(), data.db)
    assert page.total == 2 and len(page.items) == 1
    assert len(page.rating_columns) == column_count
    schema_loader.assert_awaited_once()
    assert len([query for query in data.db.queries if query.column_descriptions[0]["entity"] is data.routes.PerformanceProjectNodeSnapshot]) == 1
    first = page.items[0]
    assert first.root_review_id == first.id and first.project_id == 1 and first.can_view_detail
    assert first.ratings["rating:grade-0"].model_dump() == {"label": "优秀", "color": "#123456", "foreground": "#ffffff"}
    assert first.rating == ("优秀" if column_count == 1 else None)
    page = await data.routes.list_project_members(1, None, 99, 1, None, None, context(), data.db)
    assert page.items == [] and len(page.rating_columns) == column_count
    data.tasks[2].submitted_at = None
    items, _ = await data.routes._project_member_rows(data.project, None, None, None, None, context(), data.db)
    assert all(value is None for item in items for value in item.ratings.values())
    with pytest.raises(HTTPException) as error:
        await data.routes._project_member_rows(data.project, None, None, "rating:__dict__", "asc", context(), data.db)
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_cycle_member_endpoints_union_projects_and_keep_view_export_intersection(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    from fastapi import HTTPException
    project_a = SimpleNamespace(id=11, name="A")
    project_b = SimpleNamespace(id=12, name="B")
    project_c = SimpleNamespace(id=13, name="C")
    cycle = SimpleNamespace(id=77)
    access = SimpleNamespace(cycles=[cycle], manage_projects=[(project_a, cycle), (project_b, cycle), (project_c, cycle)])
    row_a = routes.ProjectMemberResponse(id=101, root_review_id=101, project_id=11, employee_no="E1", display_name="张三", rating_columns=[{"key": "rating:a", "label": "项目评级"}], ratings={"rating:a": {"label": "优秀"}})
    row_b = routes.ProjectMemberResponse(id=102, root_review_id=102, project_id=12, employee_no="E2", display_name="李四", rating_columns=[{"key": "rating:b", "label": "阶段评级"}], ratings={"rating:b": {"label": "良好"}})
    monkeypatch.setattr(routes, "resolve_frontend_access", AsyncMock(return_value=access))
    calls = []
    async def scope(_context, project, _db, function):
        calls.append((project.id, function))
        if project.id == 13:
            raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
        if function == "performance.frontend.data-view":
            return {"E1", "E2"}
        return {"E2"} if project.id == 11 else None
    monkeypatch.setattr(routes, "_project_data_scope", scope)
    async def rows(project, scope_value, keyword, sort_by, sort_order, _context, _db):
        assert sort_by is None and sort_order is None
        candidates = [row_a] if project.id == 11 else [row_b]
        return ([row for row in candidates if scope_value is None or row.employee_no in scope_value], [{"key": "rating:a", "label": "项目评级"}] if project.id == 11 else [{"key": "rating:b", "label": "阶段评级"}])
    monkeypatch.setattr(routes, "_project_member_rows", rows)
    result = await routes.cycle_project_members(77, None, 1, 1, "name", "asc", context(), object())
    assert result.total == 2 and [item.employee_no for item in result.items] == ["E1"]
    assert {column.key for column in result.rating_columns} == {"rating:a", "rating:b"}
    assert all(item.can_view_detail is False or item.project_id in {11, 12} for item in result.items)
    assert calls == [(11, "performance.frontend.data-view"), (12, "performance.frontend.data-view"), (13, "performance.frontend.data-view")]
    calls.clear()
    exported = await routes.export_cycle_project_members(77, None, "name", "asc", context(), object())
    assert exported.total == 1 and exported.items[0].employee_no == "E2"
    assert calls == [(11, "performance.frontend.data-view"), (11, "performance.frontend.export-members"), (12, "performance.frontend.data-view"), (12, "performance.frontend.export-members"), (13, "performance.frontend.data-view")]


@pytest.mark.asyncio
async def test_cycle_member_endpoints_reject_unknown_full_cycle_sort_key(monkeypatch):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.performance import projects_router as routes
    project = SimpleNamespace(id=11, name="A")
    cycle = SimpleNamespace(id=77)
    monkeypatch.setattr(routes, "resolve_frontend_access", AsyncMock(return_value=SimpleNamespace(cycles=[cycle], manage_projects=[(project, cycle)])))
    monkeypatch.setattr(routes, "_project_data_scope", AsyncMock(return_value=None))
    monkeypatch.setattr(routes, "_project_member_rows", AsyncMock(return_value=([], [])))
    with pytest.raises(HTTPException) as error:
        await routes.cycle_project_members(77, None, 1, 50, "rating:missing", "asc", context(), object())
    assert error.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("timing,expected", [({"start_at": "2099-01-01T00:00:00Z"}, "not_started"), ({"end_at": "2020-01-01T00:00:00Z"}, "overdue")])
async def test_management_detail_task_status_uses_submission_and_window(management_member_data, timing, expected):
    data = management_member_data
    data.tasks[:] = [task for task in data.tasks if task.node_snapshot_id != 20]
    task = data.task(7, submitted=False)
    task.status = "completed"
    data.tasks.append(task)
    data.nodes[1].config["time"] = timing
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    tab = next(tab for tab in detail["management_tabs"] if tab["node_id"] == "node-20")
    assert tab["status"] == expected
    assert tab["answers"] == {} and tab["form_schema"] == []


@pytest.mark.asyncio
async def test_management_member_api_root_and_dynamic_export_contract(management_member_data, monkeypatch):
    import httpx
    from fastapi import FastAPI
    from unittest.mock import AsyncMock
    data = management_member_data
    app = FastAPI()
    app.include_router(data.routes.router, prefix="/api/v1")
    app.dependency_overrides[data.routes.get_session] = lambda: data.db
    app.dependency_overrides[data.routes.get_performance_access_context] = lambda: context()
    monkeypatch.setattr(data.routes, "_matrix_node_schema", AsyncMock(return_value=[{"id": "result", "fields": [{"id": "grade", "label": "最终评级", "type": "rating", "options": [{"id": "a", "label": "优秀"}]}]}]))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        detail_url = "/api/v1/performance/projects/1/members/E1/detail"
        response = await client.get(detail_url + "?root_review_id=1")
        assert response.status_code == 200, response.text
        assert response.json()["root_review_id"] == 1
        assert response.json()["default_active_tab"] == "management-node-30"
        assert (await client.get(detail_url + "?root_review_id=999")).status_code == 404
        assert (await client.get(detail_url + "?root_review_id=0")).status_code == 422
        response = await client.get("/api/v1/performance/projects/1/members/export?sort_by=rating:grade&sort_order=asc")
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body["items"], list) and body["total"] == 2
        assert body["rating_columns"] == [{"key": "rating:grade", "label": "最终评级"}]
        assert all(item["rating_columns"] == body["rating_columns"] for item in body["items"])
        assert (await client.get("/api/v1/performance/projects/1/members?sort_by=rating:unknown")).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("voluntary,submitted,expected", [
    (True, False, "ok"),
    (True, True, ("TASK_ALREADY_SUBMITTED", 409)),
    (False, False, ("TASK_NOT_VOLUNTARY", 409)),
])
async def test_360_giveup_route_branches(monkeypatch, voluntary, submitted, expected):
    """放弃评估路由：自愿+未提交成功撤销；已提交/非自愿拒绝。"""
    from datetime import UTC, datetime
    from fastapi import HTTPException
    from app.performance import review_360_feedback_router as feedback

    now = datetime.now(UTC)
    proj = project("STARTED")
    proj.id = 1
    proj.cycle_ref = "C1"
    node = SimpleNamespace(id=10, node_id="feedback", node_type="evaluation", config={"template": {"executor_role_code": "assessment.reviewer_360"}}, node_order=1)

    class FakeTask:
        def __init__(self):
            self.id = 101
            self.project_id = 1
            self.node_snapshot_id = 10
            self.task_kind = "evaluation"
            self.target_employee_no = "E1"
            self.handler_ref = "REVIEWER"
            self.submitted_at = now if submitted else None
            self.status = "completed" if submitted else "pending"
            self.revoked_at = None
            self.member_snapshot_id = 7
            self.source_type = "VOLUNTARY" if voluntary else "INVITE"

    task = FakeTask()
    db = SimpleNamespace(commit_count=0)
    # scalar：task 查询
    scalars = [task]
    async def fake_scalar(query):
        return scalars.pop(0) if scalars else None
    async def fake_commit():
        db.commit_count += 1
    added_events = []
    db.add = lambda record: added_events.append(record)

    async def fake_get_project(*a): return proj
    async def fake_locked_snapshot(*a): return SimpleNamespace(id=2)
    async def fake_actor(*a): return "REVIEWER"
    async def fake_nodes(*a): return [node]
    async def fake_eval_node(*a, **k): return node
    async def fake_latest(*a): return 7
    monkeypatch.setattr(feedback, "_get_project", fake_get_project)
    monkeypatch.setattr(feedback, "_locked_snapshot", fake_locked_snapshot)
    monkeypatch.setattr(feedback, "_resolve_cycle_member_employee", fake_actor)
    monkeypatch.setattr(feedback, "_project_nodes", fake_nodes)
    monkeypatch.setattr(feedback, "_evaluation_node", fake_eval_node)
    monkeypatch.setattr(feedback, "_latest_member_snapshot_id", fake_latest)
    db.scalar = fake_scalar
    db.commit = fake_commit

    if expected == "ok":
        result = await feedback.giveup_voluntary_evaluation(1, feedback.GiveUpPayload(task_id=101, node_id="feedback"), context=context(), db=db)
        assert result.task_id == 101
        assert task.revoked_at is not None
        assert db.commit_count == 1
    else:
        detail, status = expected
        with pytest.raises(HTTPException) as raised:
            await feedback.giveup_voluntary_evaluation(1, feedback.GiveUpPayload(task_id=101, node_id="feedback"), context=context(), db=db)
        assert (raised.value.status_code, raised.value.detail) == (status, detail)
        assert task.revoked_at is None


@pytest.mark.asyncio
async def test_sync_node_task_times_updates_all_tasks_including_calibration_and_completed():
    from datetime import UTC, datetime
    from app.performance.project_service import PerformanceProjectService
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    now = datetime.now(UTC)
    eval_node = PerformanceProjectNodeSnapshot(id=1, project_id=1, node_id="review-360", node_type="evaluation", node_order=1, name="360评估", config={})
    calib_node = PerformanceProjectNodeSnapshot(id=2, project_id=1, node_id="calibration-1", node_type="calibration", node_order=2, name="校准", config={})
    review_node = PerformanceProjectNodeSnapshot(id=3, project_id=1, node_id="result-reconsideration", node_type="result_reconsideration", node_order=3, name="复议", config={})
    pending = PerformanceNodeTask(id=10, project_id=1, cycle_ref="cycle:1", member_snapshot_id=3, node_snapshot_id=1, target_employee_no="E1", handler_ref="H1", task_kind="evaluation", status="pending", available_at=now, due_at=now)
    completed = PerformanceNodeTask(id=11, project_id=1, cycle_ref="cycle:1", member_snapshot_id=3, node_snapshot_id=1, target_employee_no="E2", handler_ref="H2", task_kind="evaluation", status="completed", available_at=now, due_at=now, submitted_at=now)
    calib_task = PerformanceNodeTask(id=12, project_id=1, cycle_ref="cycle:1", member_snapshot_id=3, node_snapshot_id=2, target_employee_no="E3", handler_ref="C1", task_kind="calibration", phase_id="first", status="pending", available_at=now, due_at=now)
    review_task = PerformanceNodeTask(id=13, project_id=1, cycle_ref="cycle:1", member_snapshot_id=3, node_snapshot_id=3, target_employee_no="E4", handler_ref="H4", task_kind="result_reconsideration", phase_id="", status="pending", available_at=now, due_at=now)

    class Db:
        async def execute(self, query):
            text = str(query)
            if "FROM performance_project_node_snapshots" in text:
                rows = [eval_node, calib_node, review_node]
            elif "FROM performance_node_tasks" in text:
                params = query.compile().params
                rows = [task for task in (pending, completed, calib_task, review_task) if task.node_snapshot_id == params.get("node_snapshot_id_1")]
            else:
                rows = []
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

    node_times = {
        "review-360": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"},
        "calibration-1": {"phase_times": {"first": {"start_at": "2026-09-21T00:00:00Z", "end_at": "2026-09-28T00:00:00Z"}}},
        "result-reconsideration": {"appeal_deadline": "2026-10-05T00:00:00Z"},
    }
    await PerformanceProjectService(Db())._sync_node_task_times(SimpleNamespace(id=1), node_times)
    from datetime import datetime as _dt
    assert pending.available_at == _dt.fromisoformat("2026-09-20T00:00:00Z")
    assert pending.due_at == _dt.fromisoformat("2026-09-30T00:00:00Z")
    assert completed.available_at == _dt.fromisoformat("2026-09-20T00:00:00Z")
    assert completed.due_at == _dt.fromisoformat("2026-09-30T00:00:00Z")
    assert calib_task.available_at == _dt.fromisoformat("2026-09-21T00:00:00Z")
    assert calib_task.due_at == _dt.fromisoformat("2026-09-28T00:00:00Z")
    assert review_task.available_at == now
    assert review_task.due_at == _dt.fromisoformat("2026-10-05T00:00:00Z")


@pytest.mark.asyncio
async def test_management_member_reminder_preview_returns_bot_card_fields(management_member_data):
    data = management_member_data
    data.tasks[:] = [task for task in data.tasks if not (task.node_snapshot_id == 20 and task.submitted_at is not None)]
    preview = await data.routes.project_member_reminder_preview(1, "E1", "node-20", 4, context(), data.db)
    assert preview["title"] == "绩效任务提醒"
    assert "为@员工1完成环节20" in preview["description"]
    assert preview["stage_label"] == "环节20"
    assert preview["cycle_name"] == "测试周期"
    assert preview["cycle_start_at"] == "2026-01-01T00:00:00+00:00"
    assert preview["cycle_end_at"] == "2026-12-31T00:00:00+00:00"
    assert preview["reminder_name"] in {"M4", "冻结处理人4"}
    assert preview["stage_type"] == "环节20"


@pytest.mark.asyncio
async def test_management_member_reminder_preview_denies_self_or_missing_target(management_member_data):
    from fastapi import HTTPException
    data = management_member_data
    # task(4) 是 node-20 的未提交 pending 任务，预览必须能取到；node-10 的 task(1) 已提交 → 无 reminder_target → 404
    with pytest.raises(HTTPException) as error:
        await data.routes.project_member_reminder_preview(1, "E1", "node-10", 1, context(), data.db)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_management_member_remind_forwards_to_shared_sender(management_member_data, monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import models as pm_models
    data = management_member_data
    data.project.status = "STARTED"
    task = data.task(4, submitted=False)
    sending = AsyncMock(return_value=(True, None))
    monkeypatch.setattr(data.routes, "_task_handlers", AsyncMock(return_value=["M4"]))
    monkeypatch.setattr(data.routes, "_send_performance_task_reminder", sending)
    monkeypatch.setattr(data.routes, "_can_manage_project_like_overview", AsyncMock(return_value=True))
    monkeypatch.setattr(data.routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="ADMIN", actor_type="PORTAL_USER", actor_id=1)))
    audit = SimpleNamespace(append_event=lambda _input: None)
    monkeypatch.setattr(data.routes, "PerformanceAuditService", lambda _db: audit)
    class Db:
        async def execute(self, query):
            entity = query.column_descriptions[0]["entity"]
            rows = [task] if entity is pm_models.PerformanceNodeTask else []
            node = data.nodes[1]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows), all=lambda: rows, first=lambda: (task, node))
        async def get(self, model, key):
            return data.project if model is pm_models.PerformanceProject else None
        async def commit(self): pass
    result = await data.routes.project_member_remind(1, "E1", SimpleNamespace(node_id="node-20", task_id=4), context(), Db())
    assert result["delivery_status"] == "success"
    assert result["accepted_task_ids"] == [4]
    sending.assert_awaited_once()
    sent = sending.call_args.args[0]
    assert sent.id == 4 and sent.target_employee_no == "E1"


@pytest.mark.asyncio
async def test_delegation_roles_follow_frozen_config_and_matching_handler(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    member = SimpleNamespace(employee_no="E1", direct_supervisor_employee_no="BOTH", hrbp_employee_no="BOTH")
    roles = [{"type": "REAL_LINE_MANAGER", "levels": ["DIRECT_MANAGER"]}, {"type": "HRBP"},
             {"type": "SPECIFIED_PERSON", "people": [{"employee_no": "BOTH", "display_name": "重叠处理人"}, {"employee_no": "P1", "display_name": "指定处理人"}]},
             {"type": "DEPARTMENT_HEAD", "levels": ["CURRENT_DEPARTMENT"]}]
    node = SimpleNamespace(node_id="appeal", node_type="result_reconsideration", name="复议", config={"template": {"executor_config": {"mode": "MULTI_ROLE", "roles": roles}}})
    stages = {10: {"key": "result-reconsideration", "label": "结果复议处理", "node": node}}
    tasks = [SimpleNamespace(id=index, node_snapshot_id=10, handler_ref=handler, revoked_at=None) for index, handler in enumerate(["BOTH", "P1", "OUTSIDE"], 1)]
    monkeypatch.setattr(routes, "_authorize_task_delegation", AsyncMock(return_value=True))
    options = await routes._member_task_options(member, tasks, stages, {}, None, project("STARTED"), context(), "ADMIN", object())
    assert [(item.task_id, item.role_key) for item in options] == [(1, "DIRECT_SUPERVISOR"), (1, "HRBP"), (1, "SPECIFIED_PERSON"), (2, "SPECIFIED_PERSON")]
    assert all(item.stage_id == "appeal" for item in options)
    roles[:] = [{"type": "SPECIFIED_PERSON", "people": [{"employee_no": "P1", "display_name": "指定处理人"}]}]
    options = await routes._member_task_options(member, tasks, stages, {}, None, project("STARTED"), context(), "ADMIN", object())
    assert [(item.task_id, item.role_key) for item in options] == [(2, "SPECIFIED_PERSON")]
    roles[:] = [{"type": "REAL_LINE_MANAGER", "levels": ["LEVEL_1_MANAGER"]}]
    options = await routes._member_task_options(member, tasks, stages, {}, None, project("STARTED"), context(), "ADMIN", object())
    assert options == []


@pytest.mark.asyncio
async def test_delegation_stage_ids_distinguish_nodes_and_group_same_template_across_projects(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    monkeypatch.setattr(routes, "_authorize_task_delegation", AsyncMock(return_value=True))
    member = SimpleNamespace(direct_supervisor_employee_no="M1", hrbp_employee_no=None)
    all_options = []
    for project_id, node_ids in [(1, ["review-one", "review-two"]), (2, ["review-one"])]:
        target = SimpleNamespace(id=project_id)
        nodes = [SimpleNamespace(id=project_id * 10 + index, node_id=node_id, node_type="evaluation", name="相同中文名", config={"template": {"executor_role_code": "assessment.line_manager", "executor_types": ["DIRECT_MANAGER"]}}) for index, node_id in enumerate(node_ids)]
        stages = await routes._delegatable_stages(object(), target, nodes)
        tasks = [SimpleNamespace(id=node.id, node_snapshot_id=node.id, handler_ref="M1") for node in nodes]
        all_options.extend(await routes._member_task_options(member, tasks, stages, {}, None, target, context(), "ADMIN", object()))
    assert [option.stage_key for option in all_options] == ["manager-review"] * 3
    assert [option.stage_id for option in all_options] == ["review-one", "review-two", "review-one"]
    assert routes.ProjectMemberTaskOption(task_id=1, stage_key="manager-review", stage_label="评估", handler_ref="M1").stage_id is None


@pytest.mark.asyncio
async def test_delegation_completed_and_not_started_tasks_remain_delegatable_but_revoked_does_not(monkeypatch):
    from app.performance import projects_router as routes
    from unittest.mock import AsyncMock
    monkeypatch.setattr(routes, "_task_management_scope", AsyncMock(return_value=None))
    node = SimpleNamespace(node_type="evaluation")
    for values in [{"status": "completed"}, {"submitted_at": "2026-01-01"}, {"available_at": "2099-01-01"}]:
        task = SimpleNamespace(id=1, handler_ref="M1", target_employee_no="E1", **values)
        assert await routes._authorize_task_delegation(task, node, project("STARTED"), context(), "M1", object(), {})
    revoked = SimpleNamespace(id=1, handler_ref="M1", target_employee_no="E1", revoked_at="2026-01-01")
    assert not await routes._authorize_task_delegation(revoked, node, project("STARTED"), context(), "M1", object(), {})
    calibration = SimpleNamespace(project_id=1, node_type="calibration", config={"calibration": {"role_code": "assessment.calibrator", "phases": [{"phase_id": "p1", "assignments": [{"handler_ref": "M1", "employee_no": "E1", "allow_authorize": True}]}]}})
    task = SimpleNamespace(id=1, project_id=1, task_kind="calibration", phase_id="p1", handler_ref="M1", target_employee_no="E1", status="completed")
    assert await routes._authorize_task_delegation(task, calibration, project("STARTED"), context(), "M1", object(), {})


@pytest.fixture
def task_delegation_backend(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    from app.performance import models
    task = models.PerformanceNodeTask(id=7, project_id=3, cycle_ref="C1", member_snapshot_id=10, node_snapshot_id=5, target_employee_no="E1", handler_ref="ORIGINAL", task_kind="evaluation", status="pending", answer_version=4, answers={"field": "history"}, draft_answers={"field": "draft"})
    task2 = models.PerformanceNodeTask(id=9, project_id=3, cycle_ref="C1", member_snapshot_id=10, node_snapshot_id=5, target_employee_no="E1", handler_ref="ORIGINAL", task_kind="evaluation", status="pending", answer_version=4, answers={"field": "history"}, draft_answers={"field": "draft"})
    node = models.PerformanceProjectNodeSnapshot(id=5, project_id=3, node_id="review", node_type="evaluation", name="评估", config={"template": {"executor_role_code": "assessment.line_manager"}})
    target = SimpleNamespace(id=3, cycle_ref="C1", status="STARTED", settings={}, name="测试项目")
    recipient = SimpleNamespace(employee_no="RECIPIENT", display_name="被授权人", employment_status="在职", direct_supervisor_employee_no="ORIGINAL")
    identity = SimpleNamespace(actor_ref="ORIGINAL", actor_type="EMPLOYEE")
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(side_effect=lambda *args, **kwargs: identity))
    scope = AsyncMock(return_value=None)
    monkeypatch.setattr(routes, "_task_management_scope", scope)
    notices = AsyncMock(return_value=SimpleNamespace(errors=[], status="success"))
    monkeypatch.setattr(routes, "send_notification", notices)
    class Db:
        def __init__(self):
            self.records = []
            self.events = []
            self.commits = 0
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            active = [record for record in self.records if record.status == "ACTIVE"]
            return SimpleNamespace(first=lambda: (task, node, target), scalars=lambda: SimpleNamespace(all=lambda: active if entity is models.PerformanceNodeTaskAuthorization else [recipient]), all=lambda: [(task, node, target), (task2, node, target)])
        async def scalar(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is models.PerformanceProject: return target
            if entity is models.PerformanceAuthorizationSnapshotPerson: return recipient
            if entity is routes.User: return SimpleNamespace(id=1, feishu_user_id="open-id")
            if entity is models.PerformanceNodeTaskAuthorization:
                sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
                return next((record for record in self.records
                             if f"performance_node_task_authorizations.task_id = {record.task_id}" in sql
                             and f"performance_node_task_authorizations.grantor_employee_no = '{record.grantor_employee_no}'" in sql
                             and f"performance_node_task_authorizations.authorization_type = '{record.authorization_type}'" in sql
                             and (record.authorization_settings or {}).get("idempotency_key")
                             and record.authorization_settings["idempotency_key"] in sql), None)
            return 10
        async def get(self, model, key):
            if model is models.PerformanceProject: return target
            if model is models.PerformanceOtherSetting: return None
            return SimpleNamespace(source_snapshot_id=20)
        async def refresh(self, *args, **kwargs): pass
        def add(self, row):
            if isinstance(row, models.PerformanceNodeTaskAuthorization): self.records.append(row)
            else: self.events.append(row)
        async def flush(self):
            for index, record in enumerate(self.records, 1): record.id = index
        async def commit(self): self.commits += 1
    return SimpleNamespace(routes=routes, models=models, task=task, node=node, project=target, recipient=recipient, identity=identity, db=Db(), scope=scope, notices=notices)


@pytest.mark.asyncio
@pytest.mark.parametrize("action,handlers,title,verb", [("AUTHORIZE", {"ORIGINAL", "RECIPIENT"}, "绩效任务授权通知", "已授权"), ("TRANSFER", {"RECIPIENT"}, "绩效任务转交通知", "已转交")])
async def test_delegation_empty_reason_effective_handlers_and_operation_notice(task_delegation_backend, action, handlers, title, verb):
    data = task_delegation_backend
    result = await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action=action, recipient_employee_no="RECIPIENT", notify_original=True), context(), data.db)
    assert result["notification_status"] == "success"
    assert await data.routes._task_handlers(data.db, data.task) == handlers
    assert data.db.records[0].reason == ""
    assert data.task.handler_ref == "ORIGINAL" and data.task.answers == {"field": "history"} and data.task.draft_answers == {"field": "draft"} and data.task.answer_version == 4
    assert data.db.commits == 1 and len(data.db.events) == 1
    message = data.notices.await_args.args[0].message
    assert message.title_template == title and verb in message.content_template


@pytest.mark.asyncio
async def test_delegation_candidates_and_write_reject_same_out_of_scope_recipient(task_delegation_backend):
    from fastapi import HTTPException
    data = task_delegation_backend
    data.scope.return_value = {"E1"}
    assert await data.routes.task_delegation_candidates(3, 7, context(), data.db) == []
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", reason=""), context(), data.db)
    assert (error.value.status_code, error.value.detail) == (403, "TASK_AUTHORIZATION_RECIPIENT_OUTSIDE_SCOPE")
    assert not data.db.records and not data.db.events and data.db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("employment_status", ["离职", "已离职"])
async def test_delegation_candidates_and_write_reject_inactive_recipient(task_delegation_backend, employment_status):
    from fastapi import HTTPException
    data = task_delegation_backend
    data.recipient.employment_status = employment_status
    assert await data.routes.task_delegation_candidates(3, 7, context(), data.db) == []
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="TRANSFER", recipient_employee_no="RECIPIENT"), context(), data.db)
    assert (error.value.status_code, error.value.detail) == (422, "TASK_AUTHORIZATION_RECIPIENT_INVALID")
    assert not data.db.records


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["AUTHORIZE", "TRANSFER"])
async def test_reconsideration_effective_delegate_reads_and_submits_real_task(task_delegation_backend, monkeypatch, action):
    from fastapi import HTTPException
    from unittest.mock import AsyncMock
    from app.performance import reconsideration_service
    data = task_delegation_backend
    data.task.task_kind = data.node.node_type = "result_reconsideration"
    template = {"content": [{"content_id": "recon", "type": "work_summary", "name": "复议反馈", "items": [{"id": "feedback", "label": "反馈说明", "settings": {"required": True}}]}]}
    data.node.config = {"template": template}
    monkeypatch.setattr(reconsideration_service, "reconsideration_for_task", AsyncMock(return_value=SimpleNamespace(id=1, version=1, result_snapshot={"schema_version": 1, "source_result": {}, "form_schema": [], "answers": {}})))
    monkeypatch.setattr(reconsideration_service, "reconsideration_tasks", AsyncMock(return_value=[data.task]))
    monkeypatch.setattr(data.routes, "_self_summary_template", AsyncMock(return_value=template))
    monkeypatch.setattr(data.routes, "_sync_automatic_openings", AsyncMock())
    await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action=action, recipient_employee_no="RECIPIENT"), context(), data.db)
    data.identity.actor_ref = "RECIPIENT"
    task, node = await data.routes._self_summary_task(7, context(), data.db, "evaluation")
    assert task is data.task and node is data.node
    if action == "TRANSFER":
        data.identity.actor_ref = "ORIGINAL"
        with pytest.raises(HTTPException) as error:
            await data.routes._self_summary_task(7, context(), data.db, "evaluation")
        assert error.value.status_code == 404
        data.identity.actor_ref = "RECIPIENT"
    result = await data.routes._save_self_summary(7, data.routes.SelfSummaryAnswersPayload(answers={"feedback": "<p>已复核</p>", "keep_result": "keep"}, version=4), True, context(), data.db, "evaluation")
    assert result["version"] == 5 and data.task.status == "completed"
    assert "feedback" not in data.task.answers and data.task.answers["keep_result"] == "keep"
    assert data.task.handler_ref == "ORIGINAL"
    assert data.db.events[-1].actor_ref == "RECIPIENT"


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["AUTHORIZE", "TRANSFER"])
async def test_delegation_create_ignores_completed_and_node_time_but_keeps_task_history(task_delegation_backend, action):
    from datetime import UTC, datetime
    data = task_delegation_backend
    data.task.status = "completed"
    data.task.submitted_at = datetime(2026, 1, 2, tzinfo=UTC)
    data.task.completed_at = datetime(2026, 1, 2, tzinfo=UTC)
    data.task.available_at = datetime(2099, 1, 1, tzinfo=UTC)
    before = (data.task.status, data.task.submitted_at, data.task.completed_at, dict(data.task.answers))
    result = await data.routes.create_task_delegation(
        3,
        7,
        data.routes.PerformanceTaskAuthorizationPayload(action=action, recipient_employee_no="RECIPIENT"),
        context(),
        data.db,
    )
    assert result["status"] == "ACTIVE" and not data.db.records[0].read_only
    assert (data.task.status, data.task.submitted_at, data.task.completed_at, data.task.answers) == before


@pytest.mark.asyncio
async def test_delegation_transfer_replaces_previous_authorizations(task_delegation_backend):
    data = task_delegation_backend
    await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT"), context(), data.db)
    assert await data.routes._task_handlers(data.db, data.task) == {"ORIGINAL", "RECIPIENT"}
    data.recipient.employee_no = "TRANSFERRED"
    await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="TRANSFER", recipient_employee_no="TRANSFERRED", reason="  "), context(), data.db)
    assert [record.status for record in data.db.records] == ["REPLACED", "ACTIVE"]
    assert data.db.records[1].reason == ""
    assert await data.routes._task_handlers(data.db, data.task) == {"TRANSFERRED"}
    assert data.task.handler_ref == "ORIGINAL" and data.task.answers == {"field": "history"}


@pytest.mark.asyncio
async def test_delegation_reconsideration_fallback_only_when_configured_roles_unresolved(monkeypatch):
    from app.performance import projects_router as routes
    from unittest.mock import AsyncMock
    member = SimpleNamespace(snapshot_id=1, employee_no="E1", direct_supervisor_employee_no=None, hrbp_employee_no=None)
    target = SimpleNamespace(settings={"flow_settings": {"node_settings": {"appeal": {"result_reconsideration": {"handler_employee_nos": ["F1"]}}}}})
    node = SimpleNamespace(node_type="result_reconsideration", node_id="appeal", name="复议", config={"template": {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}}})
    task = SimpleNamespace(id=1, node_snapshot_id=10, handler_ref="F1", status="pending")
    stages = {10: {"key": "result-reconsideration", "label": "复议", "node": node}}
    monkeypatch.setattr(routes, "_authorize_task_delegation", AsyncMock(return_value=True))
    class Db:
        async def get(self, *args): return SimpleNamespace(source_snapshot_id=20)
        async def execute(self, *args): return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [SimpleNamespace(employee_no="F1")]))
    options = await routes._member_task_options(member, [task], stages, {}, None, target, context(), "ADMIN", Db())
    assert [option.role_key for option in options] == ["SPECIFIED_PERSON"]
    member.hrbp_employee_no = "H1"
    assert await routes._member_task_options(member, [task], stages, {}, None, target, context(), "ADMIN", Db()) == []


@pytest.mark.asyncio
async def test_delegation_task_map_omits_revoked_and_allows_completed(monkeypatch):
    from app.performance import projects_router as routes
    from unittest.mock import AsyncMock
    member = SimpleNamespace(direct_supervisor_employee_no="M1", hrbp_employee_no=None)
    node = SimpleNamespace(node_type="evaluation", node_id="manager", config={"template": {"executor_role_code": "assessment.line_manager"}})
    stages = {10: {"key": "manager-review", "label": "评估", "node": node}}
    tasks = [SimpleNamespace(id=1, node_snapshot_id=10, handler_ref="M1", status="completed"), SimpleNamespace(id=2, node_snapshot_id=10, handler_ref="M1", revoked_at="2026-01-01")]
    authorize = AsyncMock(return_value=True)
    monkeypatch.setattr(routes, "_authorize_task_delegation", authorize)
    options = await routes._member_task_options(member, tasks, stages, {}, None, project("STARTED"), context(), "ADMIN", object())
    assert len(options) == 1 and options[0].task_id == 1 and options[0].can_authorize
    authorize.assert_awaited_once()


@pytest.mark.asyncio
async def test_delegation_recipient_scope_preserves_identity_denial(task_delegation_backend):
    from fastapi import HTTPException
    data = task_delegation_backend
    data.scope.side_effect = HTTPException(403, "PROJECT_ADMIN_IDENTITY_AMBIGUOUS")
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT"), context(), data.db)
    assert error.value.detail == "PROJECT_ADMIN_IDENTITY_AMBIGUOUS"
    assert not data.db.records


@pytest.mark.asyncio
async def test_delegation_candidates_batch_returns_intersection_for_both_tasks(task_delegation_backend):
    data = task_delegation_backend
    data.recipient.employee_no = "CANDIDATE"
    result = await data.routes.delegation_candidates_batch(data.routes.DelegationCandidatesBatchPayload(project_id=3, task_ids=[7, 9]), context(), data.db)
    assert [{"project_id": row["project_id"], "task_id": row["task_id"], "candidates": [person["employee_no"] for person in row["candidates"]]} for row in result] == [
        {"project_id": 3, "task_id": 7, "candidates": ["CANDIDATE"]},
        {"project_id": 3, "task_id": 9, "candidates": ["CANDIDATE"]},
    ]


@pytest.mark.asyncio
async def test_delegation_candidates_batch_empty_ids_returns_no_rows(task_delegation_backend):
    data = task_delegation_backend
    assert await data.routes.delegation_candidates_batch(data.routes.DelegationCandidatesBatchPayload(project_id=3, task_ids=[]), context(), data.db) == []


@pytest.mark.asyncio
async def test_task_delegation_idempotency_key_returns_existing_without_new_record(task_delegation_backend):
    data = task_delegation_backend
    first = await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", reason="", idempotency_key="idem-1"), context(), data.db)
    assert first["idempotent"] is not True and first["status"] == "ACTIVE" and first["id"] == 1
    second = await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", reason="", idempotency_key="idem-1"), context(), data.db)
    assert second["idempotent"] is True and second["id"] == 1
    assert len(data.db.records) == 1 and len(data.db.events) == 1 and data.db.commits == 1
    other = await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="TRANSFER", recipient_employee_no="RECIPIENT", reason="", idempotency_key="idem-2"), context(), data.db)
    assert other["idempotent"] is not True and other["id"] == 2 and len(data.db.records) == 2 and len(data.db.events) == 2 and data.db.commits == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["active", "report_only", "last_member", "denied", "archived", "repeated"])
async def test_remove_project_member_deletes_member_tasks_and_maintains_snapshot(monkeypatch, scenario):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    from app.performance import models as pm_models
    project = SimpleNamespace(id=1, cycle_ref="C1", status="STARTED", evaluated_count=2, project_ref="P1",
                              settings={"evaluator_rules": {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": ["E1"]}]}]}})
    generation = ["E2"] if scenario == "report_only" else ["E1"] if scenario == "last_member" else ["E1", "E2"]
    project.evaluated_count = len(generation)
    project.settings["evaluator_rules"]["groups"].append({"conditions": [{"field": "department", "operator": "include", "values": ["研发"]}, {"field": "employee", "operator": "exclude", "values": ["E9"]}]})
    snapshot = SimpleNamespace(id=7, source_filter={"task_generation_employee_nos": generation})
    remaining = sorted(set(generation) - {"E1"})
    member = SimpleNamespace(id=5, snapshot_id=7, employee_no="E1")
    task_rows = [SimpleNamespace(id=11), SimpleNamespace(id=12)]
    deleted_tasks = []
    deleted_recons = []
    deleted_openings = []
    deleted_member = []
    calibration_node = SimpleNamespace(id=30, node_type="calibration",
                                       config={"calibration": {"phases": [{"phase_id": "p1", "rule_sources": [{"rule_id": "r1", "assignments": [{"handler_ref": "H1", "employee_no": "E1"}, {"handler_ref": "H1", "employee_no": "E2"}]}], "assignments": [{"handler_ref": "H1", "employee_no": "E1"}, {"handler_ref": "H1", "employee_no": "E2"}]}], "evaluated_count": 2, "assigned_count": 2, "unassigned_count": 0}})
    eval_node = SimpleNamespace(id=31, node_type="evaluation", config={})
    calibration_phase = calibration_node.config["calibration"]["phases"][0]
    calibration_phase["assignments"] = [{"handler_ref": "H1", "employee_no": no} for no in generation]
    calibration_phase["rule_sources"][0]["assignments"] = list(calibration_phase["assignments"])
    calibration_node.node_id = "cal"
    rule = {"rule_id": "r1", "subject_groups": [{"conditions": [{"operator": "INCLUDE", "values": ["H1"]}]}], "scope": "PROJECT_ALL", "allow_authorize": False}
    calibration_phase["rule_sources"][0]["rule"] = rule
    project.settings["flow_settings"] = {"node_settings": {"cal": {"calibration": {"phases": [{"phase_id": "p1", "rules": [rule]}]}}}}

    class Db:
        async def refresh(self, row, **kwargs):
            assert row is project and kwargs["with_for_update"]
            if scenario == "archived": project.status = "ARCHIVED"
        async def scalar(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            if "performance_cycles" in sql:
                return SimpleNamespace(cycle_ref="C1")
            if "performance_project_member_snapshots" in sql and "ORDER BY" in sql:
                return snapshot
            if "performance_project_members" in sql and "employee_no = 'E1'" in sql:
                return None if deleted_member else member
            return None
        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            if "performance_node_tasks" in sql:
                if "DELETE" in sql.upper():
                    deleted_tasks.append(sql)
                    return SimpleNamespace()
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [row.id for row in task_rows]))
            if "performance_result_reconsiderations" in sql:
                deleted_recons.append(sql)
                return SimpleNamespace()
            if "performance_result_openings" in sql:
                deleted_openings.append(sql)
                return SimpleNamespace()
            if "performance_project_node_snapshots" in sql:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [calibration_node, eval_node]))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
        async def delete(self, obj):
            deleted_member.append(obj)
        async def commit(self):
            pass

    monkeypatch.setattr(routes, "_project_started", AsyncMock(return_value=project))
    monkeypatch.setattr(routes, "_can_manage_project_like_overview", AsyncMock(return_value=scenario != "denied"))
    audit = SimpleNamespace(append_event=lambda _input: None)
    monkeypatch.setattr(routes, "PerformanceAuditService", lambda _db: audit)
    monkeypatch.setattr(PerformanceProjectService, "project_audience", AsyncMock(return_value=([member], [SimpleNamespace(employee_no=no) for no in generation], [])))
    if scenario in {"denied", "archived"}:
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as rejected:
            await routes.remove_project_member(1, "E1", context(), Db(), root_review_id=5)
        assert rejected.value.status_code == (403 if scenario == "denied" else 409)
        assert not deleted_member and not deleted_tasks
        return
    result = await routes.remove_project_member(1, "E1", context(), Db(), root_review_id=5)
    assert result == {"code": 0, "data": {}, "msg": "操作成功"}
    assert project.evaluated_count == len(remaining)
    assert snapshot.source_filter["task_generation_employee_nos"] == remaining
    assert deleted_member == [member]
    assert len(deleted_tasks) == 1 and "performance_node_tasks" in deleted_tasks[0]
    assert len(deleted_recons) == len(deleted_openings) == 1
    assert "target_employee_no = 'E1'" in deleted_tasks[0] or "performance_node_tasks.id IN" in deleted_tasks[0]
    assert project.settings["evaluator_rules"]["groups"][0]["conditions"][-1] == {"field": "employee", "operator": "exclude", "values": ["E1"]}
    assert project.settings["evaluator_rules"]["groups"][1]["conditions"][-1]["values"] == ["E9", "E1"]
    frozen = calibration_node.config["calibration"]
    expected_assignments = [{"handler_ref": "H1", "employee_no": no} for no in remaining]
    assert frozen["phases"][0]["assignments"] == expected_assignments
    assert frozen["phases"][0]["rule_sources"][0]["assignments"] == expected_assignments
    assert (frozen["evaluated_count"], frozen["assigned_count"], frozen["unassigned_count"]) == (len(remaining), len(remaining), 0)
    if scenario == "last_member":
        from app.performance.calibration_service import extend_calibration_member
        people = {no: SimpleNamespace(employee_no=no, direct_supervisor_employee_no=None) for no in ["E1", "H1"]}
        restored, delta = extend_calibration_member(calibration_node, project.settings["flow_settings"], people, [], "E1")
        assert restored["evaluated_count"] == 1 and len(delta[0]["assignments"]) == 1
        added_rules = PerformanceProjectService.adjust_evaluator_rules(project.settings["evaluator_rules"], include=["E1"])
        assert [person.employee_no for person in PerformanceProjectService._matching_people([people["E1"]], {"evaluator_rules": added_rules})] == ["E1"]
    if scenario == "repeated":
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as repeated:
            await routes.remove_project_member(1, "E1", context(), Db(), root_review_id=5)
        assert repeated.value.status_code == 404 and project.evaluated_count == len(remaining)
        assert len(deleted_member) == 1


@pytest.mark.asyncio
async def test_remove_project_member_guards_missing_member_and_root_mismatch(monkeypatch):
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.performance import projects_router as routes
    from app.performance import models as pm_models
    project = SimpleNamespace(id=1, cycle_ref="C1", status="STARTED", evaluated_count=1, settings={})
    snapshot = SimpleNamespace(id=7, source_filter={"task_generation_employee_nos": ["E1"]})
    member = SimpleNamespace(id=5, snapshot_id=7, employee_no="E1")

    class Db:
        async def refresh(self, row, **kwargs): pass
        async def scalar(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            if "performance_cycles" in sql:
                return SimpleNamespace(cycle_ref="C1")
            if "performance_project_member_snapshots" in sql and "ORDER BY" in sql:
                return snapshot
            return None
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    monkeypatch.setattr(routes, "_project_started", AsyncMock(return_value=project))
    monkeypatch.setattr(routes, "_can_manage_project_like_overview", AsyncMock(return_value=True))
    with pytest.raises(HTTPException) as missing:
        await routes.remove_project_member(1, "E1", context(), Db(), root_review_id=None)
    assert missing.value.status_code == 404

    class DbWithMember(Db):
        async def scalar(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            if "performance_project_members" in sql and "employee_no = 'E1'" in sql:
                return member
            return await super().scalar(query)

    with pytest.raises(HTTPException) as mismatch:
        await routes.remove_project_member(1, "E1", context(), DbWithMember(), root_review_id=99)
    assert mismatch.value.status_code == 409 and mismatch.value.detail == "ROOT_REVIEW_ID_MISMATCH"


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["AUTHORIZE", "TRANSFER"])
@pytest.mark.parametrize("status", ["ACTIVE", "REPLACED", "REVOKED"])
async def test_delegation_idempotency_survives_completion_and_lost_permission(task_delegation_backend, action, status):
    from fastapi import HTTPException
    data = task_delegation_backend
    payload = data.routes.PerformanceTaskAuthorizationPayload(action=action, recipient_employee_no="RECIPIENT", reason=" reason ", idempotency_key="lifecycle", notify_original=True)
    first = await data.routes.create_task_delegation(3, 7, payload, context(), data.db)
    data.db.records[0].status = status
    data.task.status = "completed"
    data.scope.side_effect = HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    again = await data.routes.create_task_delegation(3, 7, payload, context(), data.db)
    assert again == {**first, "status": status, "idempotent": True}
    assert len(data.db.records) == len(data.db.events) == data.db.commits == data.notices.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{"recipient_employee_no": "OTHER"}, {"reason": "changed"}, {"notify_original": False}, {"scope_mode": "PARTIAL"}, {"no_origin_reviewer_authorize": True}])
async def test_delegation_idempotency_rejects_changed_body_before_state_checks(task_delegation_backend, change):
    from fastapi import HTTPException
    data = task_delegation_backend
    body = dict(action="TRANSFER", recipient_employee_no="RECIPIENT", reason="reason", idempotency_key="body", notify_original=True)
    await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(**body), context(), data.db)
    data.task.status = "completed"
    data.scope.side_effect = HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(**{**body, **change}), context(), data.db)
    assert (error.value.status_code, error.value.detail) == (409, "TASK_IDEMPOTENCY_CONFLICT")
    assert len(data.db.records) == len(data.db.events) == data.db.commits == data.notices.await_count == 1


@pytest.mark.asyncio
async def test_delegation_idempotency_does_not_restore_another_grantors_key(task_delegation_backend):
    from fastapi import HTTPException
    data = task_delegation_backend
    payload = data.routes.PerformanceTaskAuthorizationPayload(action="TRANSFER", recipient_employee_no="RECIPIENT", idempotency_key="private")
    await data.routes.create_task_delegation(3, 7, payload, context(), data.db)
    data.identity.actor_ref = "STRANGER"
    data.scope.side_effect = HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, payload, context(), data.db)
    assert (error.value.status_code, error.value.detail) == (403, "TASK_AUTHORIZATION_FORBIDDEN")
    assert len(data.db.records) == 1 and data.db.commits == 1


@pytest.mark.asyncio
async def test_delegation_same_active_transfer_recipient_new_key_is_conflict(task_delegation_backend):
    from fastapi import HTTPException
    data = task_delegation_backend
    body = dict(action="TRANSFER", recipient_employee_no="RECIPIENT", notify_original=True)
    await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(**body, idempotency_key="one"), context(), data.db)
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(**body, idempotency_key="two"), context(), data.db)
    assert (error.value.status_code, error.value.detail) == (409, "TASK_ALREADY_TRANSFERRED")
    assert len(data.db.records) == len(data.db.events) == data.db.commits == data.notices.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["evaluation", "result_reconsideration"])
@pytest.mark.parametrize("choice", [None, False, True])
async def test_delegation_no_original_handler_confirmation_skip_or_write(task_delegation_backend, kind, choice):
    from fastapi import HTTPException
    data = task_delegation_backend
    data.task.handler_ref = ""
    data.task.task_kind = data.node.node_type = kind
    payload = data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", no_origin_reviewer_authorize=choice, notify_original=True)
    if choice is None:
        with pytest.raises(HTTPException) as error:
            await data.routes.create_task_delegation(3, 7, payload, context(), data.db)
        assert (error.value.status_code, error.value.detail) == (422, "NO_ORIGIN_REVIEWER_CONFIRMATION_REQUIRED")
    else:
        result = await data.routes.create_task_delegation(3, 7, payload, context(), data.db)
        assert result["status"] == ("ACTIVE" if choice else "SKIPPED")
        if choice is False:
            assert result == {"id": 0, "task_id": 7, "status": "SKIPPED", "notification_status": "not_requested", "idempotent": False, "skipped": True}
    assert len(data.db.records) == data.db.commits == int(choice is True)
    assert data.notices.await_count == 0
    assert data.task.handler_ref == "" and data.task.answers == {"field": "history"}


@pytest.mark.asyncio
async def test_delegation_no_original_handler_cannot_transfer(task_delegation_backend):
    from fastapi import HTTPException
    data = task_delegation_backend
    data.task.handler_ref = ""
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, 7, data.routes.PerformanceTaskAuthorizationPayload(action="TRANSFER", recipient_employee_no="RECIPIENT", no_origin_reviewer_authorize=True), context(), data.db)
    assert (error.value.status_code, error.value.detail) == (422, "NO_ORIGIN_REVIEWER_TRANSFER_NOT_SUPPORTED")
    assert not data.db.records and not data.db.events and not data.db.commits


@pytest.mark.asyncio
async def test_delegation_candidates_200_boundary_aggregates_shared_reads(task_delegation_backend):
    from pydantic import ValidationError
    from unittest.mock import AsyncMock
    data = task_delegation_backend
    original_execute = data.db.execute
    original_get = data.db.get
    data.db.execute = AsyncMock(side_effect=original_execute)
    data.db.get = AsyncMock(side_effect=original_get)
    payload = data.routes.DelegationCandidatesBatchPayload(project_id=3, task_ids=list(range(1, 201)))
    result = await data.routes.delegation_candidates_batch(payload, context(), data.db)
    assert len(result) == 2
    assert data.db.get.await_count == 2
    assert data.db.execute.await_count == 3
    assert data.routes.resolve_trusted_performance_actor.await_count == 1
    assert data.scope.await_count == 1
    with pytest.raises(ValidationError):
        data.routes.DelegationCandidatesBatchPayload(project_id=3, task_ids=list(range(1, 202)))


@pytest.mark.asyncio
@pytest.mark.parametrize("config_kind", ["legacy", "multi"])
async def test_delegation_manager_roles_follow_frozen_multilevel_chain(monkeypatch, config_kind):
    from unittest.mock import AsyncMock
    from app.performance import projects_router as routes
    member = SimpleNamespace(snapshot_id=1, employee_no="E1", direct_supervisor_employee_no="M0", hrbp_employee_no=None)
    people = {f"M{index}": SimpleNamespace(employee_no=f"M{index}", display_name=f"冻结上级{index}", direct_supervisor_employee_no=f"M{index + 1}" if index < 5 else "M0") for index in range(6)}
    levels = ["DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER", "LEVEL_3_MANAGER_PLUS"]
    template = {"executor_role_code": "assessment.line_manager", "executor_types": levels} if config_kind == "legacy" else {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "REAL_LINE_MANAGER", "levels": levels}]}}
    node = SimpleNamespace(node_type="evaluation", node_id="manager", name="评估", config={"template": template})
    tasks = [SimpleNamespace(id=index, node_snapshot_id=10, handler_ref=handler) for index, handler in enumerate([*people, "OUTSIDE"], 1)]
    monkeypatch.setattr(routes, "_authorize_task_delegation", AsyncMock(return_value=True))
    stages = {10: {"key": "manager-review", "label": "上级评估", "node": node}}
    options = await routes._member_task_options(member, tasks, stages, {}, None, project("STARTED"), context(), "ADMIN", object(), {1: people})
    assert [item.role_key for item in options] == ["DIRECT_SUPERVISOR", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER", "LEVEL_3_MANAGER_PLUS", "LEVEL_3_MANAGER_PLUS", "LEVEL_3_MANAGER_PLUS"]
    assert [item.handler_name for item in options] == [f"冻结上级{index}" for index in range(6)]
    assert "OUTSIDE" not in {item.handler_ref for item in options}


@pytest.fixture
def virtual_reconsideration_backend(task_delegation_backend):
    from datetime import UTC, datetime
    data = task_delegation_backend
    data.node.node_type = "result_reconsideration"
    data.node.config = {"template": {"executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}}}
    member = SimpleNamespace(snapshot_id=10, employee_no="E1", hrbp_employee_no=None, direct_supervisor_employee_no=None)
    appeal = data.models.PerformanceResultReconsideration(id=12, project_id=3, member_snapshot_id=10, node_snapshot_id=5, employee_no="E1", reason="已申请", submitted_at=datetime.now(UTC))
    generated = []
    original_execute, original_scalar, original_get, original_add, original_flush = data.db.execute, data.db.scalar, data.db.get, data.db.add, data.db.flush
    async def execute(statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is data.models.PerformanceResultReconsideration:
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [appeal] if data.appeal else []))
        if entity is data.models.PerformanceNodeTask:
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(generated)), all=lambda: [])
        return await original_execute(statement)
    async def scalar(statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is data.models.PerformanceResultReconsideration:
            return data.appeal
        if entity is data.models.PerformanceProjectMember:
            return member
        return await original_scalar(statement)
    async def get(model, key):
        if model is data.models.PerformanceProjectMemberSnapshot:
            return SimpleNamespace(id=10, project_id=3, source_snapshot_id=20)
        if model is data.models.PerformanceProjectNodeSnapshot:
            return data.node
        return await original_get(model, key)
    def add(row):
        if isinstance(row, data.models.PerformanceNodeTask): generated.append(row)
        else: original_add(row)
    async def flush():
        for task in generated: task.id = 70
        await original_flush()
    data.db.execute, data.db.scalar, data.db.get, data.db.add, data.db.flush = execute, scalar, get, add, flush
    data.member, data.appeal, data.generated = member, appeal, generated
    return data


@pytest.mark.asyncio
async def test_delegation_virtual_reconsideration_discovery_skip_materialize_retry_and_batch_alias(virtual_reconsideration_backend):
    data = virtual_reconsideration_backend
    stages = {5: {"key": "result-reconsideration", "label": "复议", "node": data.node}}
    options = await data.routes._member_task_options(data.member, [], stages, {}, None, data.project, context(), "ORIGINAL", data.db)
    assert len(options) == 1 and options[0].task_id == -12 and options[0].handler_ref == "" and options[0].can_authorize
    assert await data.routes.task_delegation_candidates(3, -12, context(), data.db)
    payload = data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", idempotency_key="virtual", no_origin_reviewer_authorize=False)
    skipped = await data.routes.create_task_delegation(3, -12, payload, context(), data.db)
    assert skipped["id"] == 0 and skipped["status"] == "SKIPPED" and skipped["task_id"] == -12
    assert not data.generated and not data.db.records and data.db.commits == 0
    payload.no_origin_reviewer_authorize = True
    first = await data.routes.create_task_delegation(3, -12, payload, context(), data.db)
    assert first["task_id"] == 70 and len(data.generated) == len(data.db.records) == data.db.commits == 1
    again = await data.routes.create_task_delegation(3, -12, payload, context(), data.db)
    assert again == {**first, "idempotent": True} and len(data.generated) == len(data.db.records) == 1
    batch = await data.routes.delegation_candidates_batch(data.routes.DelegationCandidatesBatchPayload(project_id=3, task_ids=[-12]), context(), data.db)
    assert len(batch) == 1 and batch[0]["task_id"] == -12 and batch[0]["candidates"]


@pytest.mark.asyncio
async def test_delegation_virtual_reconsideration_rejects_missing_appeal_or_existing_handler(virtual_reconsideration_backend):
    from fastapi import HTTPException
    data = virtual_reconsideration_backend
    payload = data.routes.PerformanceTaskAuthorizationPayload(action="AUTHORIZE", recipient_employee_no="RECIPIENT", no_origin_reviewer_authorize=True)
    appeal = data.appeal
    data.appeal = None
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, -12, payload, context(), data.db)
    assert error.value.status_code == 404
    data.appeal = appeal
    data.generated.append(data.task)
    with pytest.raises(HTTPException) as error:
        await data.routes.create_task_delegation(3, -12, payload, context(), data.db)
    assert error.value.status_code == 404
    assert not data.db.records and not data.db.commits
