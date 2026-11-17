from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.performance.comparison_config_service import (
    PerformanceComparisonConfigService, direction_warnings, rating_items, shared_items,
)
from app.performance.comparison_schema import ComparisonCandidatesPayload, ComparisonRule
from app.performance.cycles_router import CyclePatch, CyclePayload, comparison_options, router
from app.performance.models import (
    PerformanceComparisonNotification, PerformanceCycle, PerformanceNodeTask,
    PerformanceProject, PerformanceTemplate, PerformanceTemplateWorkflow,
)


def content(content_id="shared", item_id="rating", options=("a", "b", "c"), **settings):
    return {"content_id": content_id, "type": "custom", "name": "工作评价", "settings": settings,
            "items": [{"id": item_id, "kind": "rating", "label": "评级", "options": [{"id": value} for value in options]}]}


def node(node_id, contents=None, **overrides):
    return {"node_id": node_id, "name": node_id, "node_type": "evaluation",
            "executor_role_code": "assessment.line_manager", "content": contents or [content()], **overrides}


def rule(**overrides):
    return {"template_id": 1, "first_node_id": "a", "second_node_id": "b",
            "indicator_diff_rules": [{"content_id": "shared", "item_id": "rating", "operator": "gte", "threshold": 1}],
            "show_notice_in_review": True, **overrides}


class Db:
    def __init__(self, nodes=None, library=None, started=False):
        self.workflow = SimpleNamespace(nodes=nodes or [node("a"), node("b")], content_library=library or [])
        self.started = started
        self.executed = []

    async def get(self, model, key, **_kwargs):
        if model is PerformanceTemplateWorkflow:
            return self.workflow if key == 1 else None
        if model is PerformanceTemplate:
            return SimpleNamespace(id=key, name="真实模板", template_kind="performance", status="active")

    async def execute(self, statement):
        self.executed.append(statement)
        return SimpleNamespace(scalar_one_or_none=lambda: 1 if self.started else None)


@pytest.mark.asyncio
async def test_candidates_resolve_real_library_exclude_360_and_readonly_and_wrong_types():
    nodes = [node("a", content_bindings={"fill": ["shared"]}, content=[]), node("b"),
             node("360", executor_role_code="assessment.reviewer_360"),
             node("communicate", node_type="result_communication"),
             node("readonly", contents=[{**content(), "items": [{**content()["items"][0], "settings": {"mode": "view"}}]}])]
    nodes[0]["content"] = []
    service = PerformanceComparisonConfigService(Db(nodes, [content()]))
    result = await service.candidates(ComparisonCandidatesPayload(template_ids=[1], first_node_id="a", second_node_id="b"))
    assert [stage["node_id"] for stage in result["templates"][0]["stages"]] == ["a", "b"]
    assert result["items"] == [{"content_id": "shared", "item_id": "rating", "label": "评级", "option_ids": ["a", "b", "c"]}]
    assert len(result["warnings"]) == 2


def test_shared_identity_does_not_match_by_label_or_question_id():
    assert shared_items(node("a"), node("b", [content(content_id="other")]))[0] == []
    assert shared_items(node("a"), node("b", [content(item_id="other")]))[0] == []


@pytest.mark.parametrize("scenario", ["multiple", "duplicate_across_sections", "option_order", "missing_options"])
def test_unsupported_or_ambiguous_items_have_diagnostics(scenario):
    first, second = node("a"), node("b")
    if scenario == "multiple":
        first["content"][0]["settings"]["allowMultiple"] = True
    elif scenario == "duplicate_across_sections":
        first["content"].append(content(content_id="other"))
    elif scenario == "option_order":
        second["content"][0]["items"][0]["options"].reverse()
    else:
        second["content"][0]["items"][0]["options"] = []
    items, rejected = shared_items(first, second)
    assert items == []
    assert ("shared", "rating") in rejected


def test_direction_uses_reference_projection_whitelist_independently():
    first, second = node("a"), node("b")
    relation = {"content_slot": "reference", "reference_kind": "node", "reference_value": "b",
                "reference_settings": {"content_settings": {"shared": {"items": {"rating": {"allowView": False}}}}}}
    first["content"].append(relation)
    items, _ = shared_items(first, second)
    assert len(direction_warnings(1, first, second, items)) == 1
    relation["reference_settings"]["content_settings"]["shared"]["items"]["rating"]["allowView"] = True
    assert direction_warnings(1, first, second, items) == []
    assert len(direction_warnings(1, second, first, items)) == 1


@pytest.mark.asyncio
async def test_server_rule_identity_and_snapshot_preserve_config_keys_freeze_order():
    db = Db()
    service = PerformanceComparisonConfigService(db)
    saved = await service.normalize_rules([rule()], [1])
    assert saved[0]["id"]
    assert "option_ids" not in saved[0]["indicator_diff_rules"][0]
    updated = await service.normalize_rules([rule(send_notification=True)], [1], saved)
    assert updated[0]["id"] == saved[0]["id"]
    cycle = SimpleNamespace(semester_diff_rules=saved)
    snapshot = await service.snapshot(cycle, 1)
    assert snapshot["version"] == 1
    assert snapshot["rules"][0]["indicator_diff_rules"][0]["option_ids"] == ["a", "b", "c"]
    assert set(snapshot["rules"][0]) == set(saved[0])
    db.workflow.nodes[0]["content"][0]["items"][0]["options"].reverse()
    assert snapshot["rules"][0]["indicator_diff_rules"][0]["option_ids"] == ["a", "b", "c"]
    assert await service.snapshot(cycle, 2) == {"version": 1, "rules": []}


@pytest.mark.asyncio
@pytest.mark.parametrize("started", [False, True])
async def test_revision_conflict_cannot_resurrect_deleted_rule(started):
    service = PerformanceComparisonConfigService(Db(started=started))
    cycle = SimpleNamespace(cycle_ref="c", semester_diff_rules=[], comparison_rules_revision=2)
    with pytest.raises(HTTPException) as exc:
        await service.update_rules(cycle, {"semester_diff_rules": [rule()], "comparison_rules_revision": 1}, [1])
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "COMPARISON_RULES_VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_started_cycle_allows_same_value_or_delete_cancels_only_pending_retrying():
    service = PerformanceComparisonConfigService(Db(started=True))
    saved = await service.normalize_rules([rule()], [1])
    cycle = SimpleNamespace(cycle_ref="c", semester_diff_rules=saved, comparison_rules_revision=1)
    await service.update_rules(cycle, {"semester_diff_rules": deepcopy(saved), "comparison_rules_revision": 1}, [1])
    assert cycle.comparison_rules_revision == 1
    changed = deepcopy(saved)
    changed[0]["send_notification"] = True
    with pytest.raises(HTTPException) as exc:
        await service.update_rules(cycle, {"semester_diff_rules": changed, "comparison_rules_revision": 1}, [1])
    assert exc.value.detail["code"] == "COMPARISON_RULES_LOCKED"
    await service.update_rules(cycle, {"semester_diff_rules": [], "comparison_rules_revision": 1}, [1])
    assert cycle.semester_diff_rules == [] and cycle.comparison_rules_revision == 2
    statement = str(service.db.executed[-1].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "'pending', 'retrying'" in statement
    assert "'sent'" not in statement and "'unknown'" not in statement


@pytest.mark.asyncio
async def test_patch_omission_preserves_rules_and_rejects_template_removal():
    service = PerformanceComparisonConfigService(Db())
    saved = await service.normalize_rules([rule()], [1])
    cycle = SimpleNamespace(cycle_ref="c", semester_diff_rules=saved, comparison_rules_revision=1)
    await service.update_rules(cycle, {}, [1])
    assert cycle.semester_diff_rules == saved and cycle.comparison_rules_revision == 1
    with pytest.raises(HTTPException):
        await service.update_rules(cycle, {}, [])
    with pytest.raises(HTTPException) as exc:
        await service.update_rules(cycle, {"semester_diff_rules": []}, [1])
    assert exc.value.detail["code"] == "COMPARISON_RULES_VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_unrecognized_id_rejected_and_only_one_rule_allowed():
    service = PerformanceComparisonConfigService(Db())
    with pytest.raises(HTTPException):
        await service.normalize_rules([rule(id="forged")], [1])
    with pytest.raises(HTTPException):
        await service.normalize_rules([rule(), rule()], [1])
    with pytest.raises(ValidationError):
        CyclePatch(semester_diff_rules=[rule(), rule()])
    assert CyclePatch().model_dump(exclude_unset=True) == {}
    with pytest.raises(ValidationError):
        CyclePatch(semester_diff_rules=None)
    assert ComparisonRule(**rule()).diff_reason_required is True
    assert ComparisonRule(**rule()).fill_in_diff_reason is False


@pytest.mark.asyncio
async def test_multi_template_nodes_never_cross_selected_template():
    service = PerformanceComparisonConfigService(Db())
    with pytest.raises(HTTPException):
        await service.candidates(ComparisonCandidatesPayload(template_ids=[1, 2], first_node_id="a", second_node_id="b"))
    with pytest.raises(HTTPException):
        await service.normalize_rules([rule(template_id=2)], [1])


def test_route_permission_and_static_order():
    routes = [route for route in router.routes]
    target = next(route for route in routes if route.path.endswith("/comparison-options"))
    assert target.endpoint is comparison_options
    assert routes.index(target) < next(index for index, route in enumerate(routes) if route.path == "/performance/cycles/{cycle_id}")
    permission = next(dependency.call for dependency in target.dependant.dependencies if dependency.name == "_")
    assert "performance.cycles.manage" in [cell.cell_contents for cell in permission.__closure__]


def test_outbox_fk_deletion_preserves_evidence_and_model_constraints():
    table = PerformanceComparisonNotification.__table__
    for name in ("project_id", "task_id", "recipient_task_id"):
        assert table.c[name].nullable
        assert next(iter(table.c[name].foreign_keys)).ondelete == "SET NULL"
    assert not table.c.notification_log_id.foreign_keys
    assert table.c.recipient_ref.type.length == 128
    assert table.c.event_sequence.server_default.arg == "0"
    assert PerformanceNodeTask.__table__.c.comparison_state.nullable
    assert str(PerformanceCycle.__table__.c.semester_diff_rules.server_default.arg) == "[]"
    assert any("dispatching" in str(constraint.sqltext) and "unknown" in str(constraint.sqltext)
               for constraint in table.constraints if hasattr(constraint, "sqltext"))


@pytest.mark.asyncio
async def test_started_query_includes_archive_and_snapshot_evidence():
    service = PerformanceComparisonConfigService(Db(started=True))
    assert await service.has_started_projects("c")
    sql = str(service.db.executed[-1].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "'STARTED', 'ARCHIVED'" in sql
    assert "performance_project_node_snapshots" in sql
    assert "comparison_rules_snapshot" in sql
    assert "start_at" not in sql
    assert "performance_audit_events" in sql
    assert "PERFORMANCE_PROJECT_STARTED" in sql
    assert sql.count("cycle_ref = 'c'") == 2


@pytest.mark.asyncio
async def test_duplicate_ids_within_section_and_missing_stable_ids_reject_every_ambiguous_field():
    first = node("a")
    first["content"][0]["items"].append(deepcopy(first["content"][0]["items"][0]))
    valid, rejected = rating_items(first)
    assert valid == {} and len(rejected) == 2
    first = node("a")
    first["content"][0].pop("content_id")
    assert rating_items(first)[0] == {}


@pytest.mark.asyncio
async def test_snapshot_hydrates_real_question_levels_not_question_name():
    class QuestionDb(Db):
        async def execute(self, statement):
            question = SimpleNamespace(id=42, display_mode="标签样式", description="")
            level_rule = SimpleNamespace(config={"levels": [{"id": "high"}, {"id": "low"}]})
            return SimpleNamespace(all=lambda: [(question, level_rule)])

    rating = content()
    rating["items"][0].pop("options")
    rating["items"][0]["ratingOptionId"] = "42"
    service = PerformanceComparisonConfigService(QuestionDb([node("a", [rating]), node("b", [rating])]))
    rules = await service.normalize_rules([rule()], [1])
    frozen = await service.snapshot(SimpleNamespace(semester_diff_rules=rules), 1)
    assert frozen["rules"][0]["indicator_diff_rules"][0]["option_ids"] == ["high", "low"]


@pytest.mark.asyncio
async def test_summary_lock_is_cycle_global_even_when_project_scope_is_empty():
    from app.performance.cycle_service import PerformanceCycleService

    class SummaryDb:
        def __init__(self):
            self.statements = []

        async def execute(self, statement):
            self.statements.append(statement)
            if hasattr(statement, "selects"):
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: ["cycle:1"]))
            return SimpleNamespace(all=lambda: [("cycle:1", 0, 0)])

    cycle = SimpleNamespace(cycle_ref="cycle:1")
    db = SummaryDb()
    result = await PerformanceCycleService(db).list_summaries([cycle], project_refs=set())
    assert result == {"cycle:1": (0, 0, [])}
    assert cycle._comparison_rules_editable is False
    lock_sql = str(db.statements[0].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "PERFORMANCE_PROJECT_STARTED" in lock_sql
    assert "project_ref" not in lock_sql


@pytest.mark.asyncio
async def test_same_rule_cannot_be_kept_while_removing_its_template():
    service = PerformanceComparisonConfigService(Db())
    saved = await service.normalize_rules([rule()], [1])
    cycle = SimpleNamespace(cycle_ref="c", semester_diff_rules=saved, comparison_rules_revision=1)
    with pytest.raises(HTTPException):
        await service.update_rules(cycle, {"semester_diff_rules": saved, "comparison_rules_revision": 1}, [])


@pytest.mark.asyncio
async def test_candidates_permission_allow_and_deny():
    target = next(route for route in router.routes if route.path.endswith("/comparison-options"))
    permission = next(dependency.call for dependency in target.dependant.dependencies if dependency.name == "_")
    context = SimpleNamespace(permission_codes={"performance.cycles.manage"})
    assert await permission(context) is context
    with pytest.raises(HTTPException) as exc:
        await permission(SimpleNamespace(permission_codes={"performance.templates.manage"}))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_project_copy_excludes_runtime_snapshot_but_deep_copies_business_settings(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance.project_service import PerformanceProjectService

    target = SimpleNamespace(id=1, project_ref="p", cycle_ref="c", name="项目", description=None,
                             administrators=[], status="STARTED", evaluated_count=1,
                             settings={"template_id": 1, "flow_settings": {}, "business": {"keep": [1]},
                                       "comparison_rules_snapshot": {"version": 1, "rules": [rule()]}})

    class CopyDb:
        def add(self, obj):
            obj.id = 2
        async def flush(self):
            pass
        async def commit(self):
            pass
        async def refresh(self, _obj):
            pass

    service = PerformanceProjectService(CopyDb())
    service.validate_template = AsyncMock()
    service._validate_distribution_template_options = AsyncMock()
    service._validate_manual_opening_policy = AsyncMock()
    monkeypatch.setattr(service, "_validate_payload", lambda values, existing: (values["name"], None, [], existing))
    monkeypatch.setattr(service, "serialize", lambda _project: {})
    monkeypatch.setattr(service.audit, "append_event", lambda _event: None)
    result = await service.copy_project(target, actor_type="EMPLOYEE", actor_id=1)
    assert "comparison_rules_snapshot" not in result.settings
    result.settings["business"]["keep"].append(2)
    assert target.settings["business"]["keep"] == [1]
    assert "comparison_rules_snapshot" in target.settings


@pytest.mark.asyncio
async def test_start_freezes_snapshot_under_cycle_lock_and_already_started_is_not_backfilled(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance.project_service import PerformanceProjectService
    from app.performance import models

    source = node("a", include_final_result=True)
    view = {"node_id": "view", "node_type": "result_view", "name": "结果"}
    db = Db([source, node("b"), view])
    service_config = PerformanceComparisonConfigService(db)
    rules = await service_config.normalize_rules([rule()], [1])
    cycle = SimpleNamespace(cycle_ref="c", semester_diff_rules=rules)
    target = SimpleNamespace(id=1, project_ref="p", cycle_ref="c", name="项目", status="DRAFT", settings={
        "template_id": 1, "configuration_completed": True, "evaluator_rules": {"groups": [{"conditions": []}]},
        "flow_settings": {"node_settings": {"view": {"result_view": {"automatic_enabled": True}}}, "node_times": {}},
    })
    person = SimpleNamespace(employee_no="E1", display_name="员工", portal_user_id=None,
                             direct_supervisor_employee_no=None, hrbp_employee_no=None, employee_type="全职",
                             employment_status="在职", job_family=None, job_category=None, standard_position=None,
                             position_level=None, hire_date=None)
    from app.data.employee_roster_contract import ORGANIZATION_FIELDS
    for name in ORGANIZATION_FIELDS:
        setattr(person, name, None)
    lock_queries = []
    added = []

    async def scalar(statement):
        if statement.column_descriptions[0]["entity"] is models.PerformanceCycle:
            assert statement._for_update_arg is not None
            lock_queries.append(statement)
            return cycle
        return None

    async def execute(_statement):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    def add(obj):
        added.append(obj)
        if hasattr(obj, "id") and obj.id is None:
            obj.id = len(added)

    monkeypatch.setattr(db, "scalar", scalar, raising=False)
    monkeypatch.setattr(db, "execute", execute)
    monkeypatch.setattr(db, "add", add, raising=False)
    monkeypatch.setattr(db, "flush", AsyncMock(), raising=False)
    monkeypatch.setattr(db, "commit", AsyncMock(), raising=False)
    monkeypatch.setattr(db, "refresh", AsyncMock(), raising=False)
    service = PerformanceProjectService(db)
    monkeypatch.setattr(service, "_cycle_snapshot_people", AsyncMock(return_value=(SimpleNamespace(id=7, status="LOCKED"), [person])))
    monkeypatch.setattr(service, "_classify_people", lambda *_: ([person], []))
    monkeypatch.setattr(service, "_expired_node_names", lambda *_: [])
    monkeypatch.setattr(service, "_validate_schedule", lambda *_, **__: None)
    monkeypatch.setattr(service, "_validate_distribution_start_readiness", lambda *_: None)
    monkeypatch.setattr(service, "serialize", lambda _project: {})
    events = []
    monkeypatch.setattr(service.audit, "append_event", events.append)
    monkeypatch.setattr("app.performance.project_service.validate_executor_roles", AsyncMock())
    await service.start_project(target, actor_type="EMPLOYEE", actor_id=1)
    assert len(lock_queries) == 1
    assert target.status == "STARTED"
    assert target.settings["comparison_rules_snapshot"]["rules"][0]["indicator_diff_rules"][0]["option_ids"] == ["a", "b", "c"]
    event = next(event for event in events if event.event_type == "PERFORMANCE_PROJECT_STARTED")
    assert event.cycle_ref == "c"
    target.settings.pop("comparison_rules_snapshot")
    await service.start_project(target, actor_type="EMPLOYEE", actor_id=1)
    assert "comparison_rules_snapshot" not in target.settings


@pytest.mark.asyncio
async def test_create_response_returns_server_id_revision_and_reopen_rules(monkeypatch):
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock
    from app.performance.cycle_service import PerformanceCycleService
    from app.performance.cycles_router import create_cycle, get_cycle

    db = Db()
    created = []

    def add(obj):
        created.append(obj)
        obj.id = 11

    monkeypatch.setattr(db, "add", add, raising=False)
    monkeypatch.setattr(db, "flush", AsyncMock(), raising=False)
    monkeypatch.setattr(db, "commit", AsyncMock(), raising=False)
    monkeypatch.setattr(db, "refresh", AsyncMock(), raising=False)
    monkeypatch.setattr(PerformanceCycleService, "validate_templates", AsyncMock())
    monkeypatch.setattr(PerformanceCycleService, "_sync_snapshot", AsyncMock())
    monkeypatch.setattr(PerformanceCycleService, "snapshot_counts", AsyncMock(return_value=(0, 0)))
    monkeypatch.setattr(PerformanceCycleService, "projects_for_cycle", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.performance.snapshot_service.PerformanceAuthorizationSnapshotService.lock_snapshot", AsyncMock())
    monkeypatch.setattr("app.performance.authorization_service.PerformanceAuditService.append_event", lambda *_: None)
    payload = CyclePayload(name="周期", period_year=2026, period_type="YEAR", template_ids=[1],
                           start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                           end_at=datetime(2026, 12, 31, tzinfo=timezone.utc),
                           lock_rule="IMMEDIATE", semester_diff_rules=[rule()])
    context = SimpleNamespace(permission_codes={"performance.cycles.manage"}, subject_type="EMPLOYEE", subject_id=1)
    response = await create_cycle(payload, context, db)
    assert response.semester_diff_rules[0].id
    assert response.semester_diff_rules[0].id == created[0].semester_diff_rules[0]["id"]
    assert response.comparison_rules_revision == 1
    assert response.comparison_rules_editable is True
    assert response.comparison_rules_editable_reason is None
    monkeypatch.setattr(PerformanceCycleService, "get_cycle", AsyncMock(return_value=created[0]))
    reopened = await get_cycle(11, context, db)
    assert reopened.semester_diff_rules == response.semester_diff_rules
    assert reopened.comparison_rules_revision == response.comparison_rules_revision
    assert reopened.comparison_rules_editable is True
