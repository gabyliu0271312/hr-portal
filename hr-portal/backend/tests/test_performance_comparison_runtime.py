from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.performance import comparison_service as service
from app.performance.comparison_service import compare_ratings, project_comparison


def rule(operator="gte", threshold=2):
    return {"id": "r1", "first_node_id": "a", "second_node_id": "b",
            "indicator_diff_rules": [{"content_id": "c", "item_id": "i", "option_ids": ["low", "mid", "high"],
                                      "operator": operator, "threshold": threshold}],
            "show_notice_in_review": True, "fill_in_diff_reason": True, "diff_reason_required": True}


def record(task_id, value, options=None, version=1):
    options = options or ["low", "mid", "high"]
    return {"task_id": task_id, "version": version,
            "schema": [{"id": "c", "allow_multiple": False, "fields": [{"id": "i", "type": "rating",
                       "label": "成果评级", "options": [{"id": item} for item in options]}]}],
            "answers": {"i": value}}


def test_comparison_checks_all_formal_pairs_and_or_matches():
    result = compare_ratings(rule(threshold=1), {"a": [record(1, "low"), record(2, "high")],
                                      "b": [record(3, "high"), record(4, "mid")]})
    assert {(item["first_task_id"], item["second_task_id"]) for item in result["matches"]} == {(1, 3), (1, 4), (2, 4)}
    assert result["rating_signature"]
    assert result["event_sequence"] == 1


def test_comparison_supports_every_operator_and_unknown_values_are_ignored():
    for operator, threshold, expected in [("eq", 2, True), ("gt", 1, True), ("gte", 2, True), ("lt", 3, True), ("lte", 2, True)]:
        result = compare_ratings(rule(operator, threshold), {"a": [record(1, "low")], "b": [record(2, "high")]})
        assert bool(result["matches"]) is expected
    result = compare_ratings(rule(), {"a": [record(1, "__unknown__"), record(2, "invalid")], "b": [record(3, "high")]})
    assert result["matches"] == []


def test_signature_changes_for_difference_disappearance_but_not_comment_or_answer_version():
    base = compare_ratings(rule(), {"a": [record(1, "low", version=1)], "b": [record(2, "high", version=1)]})
    same_rating = compare_ratings(rule(), {"a": [record(1, "low", version=2)], "b": [record(2, "high", version=2)]}, base)
    assert same_rating["rating_signature"] == base["rating_signature"]
    assert same_rating["event_sequence"] == base["event_sequence"]
    changed = compare_ratings(rule(), {"a": [record(1, "high")], "b": [record(2, "high")]}, base)
    assert changed["rating_signature"] != base["rating_signature"]
    assert changed["event_sequence"] == base["event_sequence"] + 1


def test_projection_does_not_leak_hidden_label_or_inaccessible_values():
    comparison = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    schemas = {"a": record(1, "low")["schema"], "b": record(2, "high")["schema"]}
    schemas["a"][0]["fields"][0]["hide_name"] = True
    projected = project_comparison(comparison, schemas, "a")
    assert projected["matches"][0]["label"] == ""
    assert projected["matches"][0]["source_task_id"] == 2
    assert "rating_signature" not in projected
    assert project_comparison(comparison, {"a": [], "b": []}, "a") is None


@pytest.mark.parametrize("current_node_id", ["a", "b"])
def test_projection_resolves_each_sides_authorized_rating_and_whitelists_metadata(current_node_id):
    comparison = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    before = deepcopy(comparison)
    schemas = {"a": record(1, "low")["schema"], "b": record(2, "high")["schema"]}
    schemas["a"][0]["fields"][0]["options"] = [
        {"id": "low", "label": "自评待提升", "code": "3星-", "color": "#fff3e5", "foreground": "#8f4700", "description": "私有说明"},
        {"id": "high", "label": "不应使用的另一选项"},
    ]
    schemas["b"][0]["fields"][0]["options"] = [
        {"id": "high", "label": "上级优秀", "code": "4星", "color": "#d9f5d6", "foreground": "#237b1b", "required": True},
        {"id": "low", "label": "不应使用的另一侧选项"},
    ]
    match = project_comparison(comparison, schemas, current_node_id)["matches"][0]
    assert match["first_rating"] == {"label": "自评待提升", "code": "3星-", "color": "#fff3e5", "foreground": "#8f4700"}
    assert match["second_rating"] == {"label": "上级优秀", "code": "4星", "color": "#d9f5d6", "foreground": "#237b1b"}
    assert "options" not in match and "schema" not in match
    assert comparison == before


@pytest.mark.parametrize("hidden_side", ["a", "b"])
def test_projection_prunes_hidden_rating_metadata_and_group_reason(hidden_side):
    conditions = rule()
    conditions["indicator_diff_rules"].append({**conditions["indicator_diff_rules"][0], "item_id": "hidden"})
    records = {"a": [record(1, "low")], "b": [record(2, "high")]}
    for entries in records.values():
        entry = entries[0]
        entry["schema"][0]["fields"].append({**deepcopy(entry["schema"][0]["fields"][0]), "id": "hidden", "label": "不可见评估项"})
        entry["answers"]["hidden"] = entry["answers"]["i"]
    comparison = compare_ratings(conditions, records)
    comparison["reason"] = "含不可见条件的理由"
    schemas = {node: deepcopy(entries[0]["schema"]) for node, entries in records.items()}
    for schema in schemas.values():
        schema[0]["fields"][0]["options"] = [{"id": "low", "label": "可见低评级"}, {"id": "high", "label": "可见高评级"}]
        schema[0]["fields"][1]["options"] = [{"id": "low", "label": "私有低评级"}, {"id": "high", "label": "私有高评级"}]
    schemas[hidden_side][0]["fields"].pop()
    projected = project_comparison(comparison, schemas, "a")
    assert len(projected["matches"]) == 1
    assert projected["matches"][0]["first_rating"] == {"label": "可见低评级"}
    assert projected["matches"][0]["second_rating"] == {"label": "可见高评级"}
    assert projected["reason"] is None
    assert "私有" not in str(projected) and "不可见" not in str(projected)
    schemas[hidden_side][0]["fields"] = []
    assert project_comparison(comparison, schemas, "a") is None


@pytest.mark.parametrize("options, expected", [
    (None, None),
    ([], None),
    ([{"id": "missing", "label": "其他评级"}], None),
    ([{"id": "low"}], None),
    ([{"id": "low", "label": ""}], None),
    ([{"id": "low", "label": "待提升"}], {"label": "待提升"}),
    ([{"id": "low", "label": "待提升", "code": 3, "color": None, "foreground": 123}], {"label": "待提升"}),
    ([{"id": "low", "label": "待提升", "code": "3星-"}], {"label": "待提升", "code": "3星-"}),
])
def test_projection_rating_metadata_handles_missing_options_and_optional_fields(options, expected):
    comparison = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    schemas = {"a": record(1, "low")["schema"], "b": record(2, "high")["schema"]}
    schemas["a"][0]["fields"][0]["options"] = options
    schemas["b"][0]["fields"][0].pop("options")
    schemas["a"][0]["fields"][0]["hide_name"] = True
    match = project_comparison(comparison, schemas, "a")["matches"][0]
    assert match["first_rating"] == expected
    assert match["second_rating"] is None
    assert match["label"] == ""
    assert match["first_value"] == "low" and match["second_value"] == "high"


def test_option_order_uses_snapshot_despite_current_reordering_or_additions():
    result = compare_ratings(rule(), {"a": [record(1, "low", options=["mid", "low", "high", "new"])],
                                      "b": [record(2, "high")]})
    assert result["matches"][0]["difference"] == 2
    invalid = compare_ratings(rule(), {"a": [record(1, "new", options=["low", "mid", "high", "new"])], "b": [record(2, "high")]})
    assert invalid["matches"] == []


def test_required_optional_and_stale_reason_validation():
    internal = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    schemas = {"a": record(1, "low")["schema"], "b": record(2, "high")["schema"]}
    projected = project_comparison(internal, schemas, "a")
    with pytest.raises(HTTPException, match="DIFF_REASON_REQUIRED"):
        service.validate_submission(internal, projected, "  ", projected["context"])
    with pytest.raises(HTTPException, match="COMPARISON_SOURCE_CHANGED"):
        service.validate_submission(internal, projected, "原因", "stale")
    saved = service.validate_submission(internal, projected, "  原因  ", projected["context"])
    assert saved["reason"] == "原因" and "_contexts" not in saved
    assert service.validate_submission(None, None, None, "stale") is None
    assert service.validate_submission(internal, None, None, None)["reason"] is None


def test_no_formal_source_still_projects_active_rule_flags():
    internal = compare_ratings(rule(), {"a": [record(1, "low")], "b": []})
    schemas = {"a": record(1, "low")["schema"], "b": record(2, "high")["schema"]}
    projected = project_comparison(internal, schemas, "a")
    assert projected["matches"] == [] and projected["show_notice_in_review"]
    assert not projected["reason_required"]


def test_cycle_active_intersection_and_template_isolation():
    frozen = {**rule(), "template_id": 3}
    project = SimpleNamespace(settings={"template_id": 3, "comparison_rules_snapshot": {"version": 1, "rules": [frozen]}})
    assert service.active_rules(project, SimpleNamespace(semester_diff_rules=[{"id": "r1"}])) == [frozen]
    assert not service.active_rules(project, SimpleNamespace(semester_diff_rules=[]))
    project.settings["template_id"] = 4
    assert not service.active_rules(project, SimpleNamespace(semester_diff_rules=[{"id": "r1"}]))


class Rows:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


def runtime(monkeypatch, active=True, hide=False):
    from app.performance import projects_router as routes
    def template(value):
        return {"content": [{"id": "c", "type": "rating", "items": [{"id": "i", "kind": "rating", "label": "成果评级", "options": [{"id": item, "label": item} for item in ["low", "mid", "high"]]}]},
                            {"id": "ref", "content_slot": "reference", "reference_kind": "node", "reference_value": value,
                             "settings": {"allowView": not hide}}]}
    nodes = [SimpleNamespace(id=11, node_id="a", node_type="evaluation", config={"template": template("b")}, name="自评"),
             SimpleNamespace(id=12, node_id="b", node_type="evaluation", config={"template": template("a")}, name="上级评估")]
    tasks = [SimpleNamespace(id=1, node_snapshot_id=11, task_kind="evaluation", member_snapshot_id=4, target_employee_no="e", project_id=7, cycle_ref="cycle",
                answer_version=1, answers={"i": "low"}, comparison_state=None, status="completed", submitted_at=datetime.now(UTC)),
             SimpleNamespace(id=2, node_snapshot_id=12, task_kind="evaluation", member_snapshot_id=4, target_employee_no="e", project_id=7, cycle_ref="cycle",
                answer_version=2, answers={"i": "high"}, comparison_state=None, status="completed", submitted_at=datetime.now(UTC))]
    project = SimpleNamespace(id=7, cycle_ref="cycle", settings={"template_id": 3, "comparison_rules_snapshot": {"version": 1, "rules": [{**rule(), "template_id": 3}]}})
    db = SimpleNamespace(scalar=AsyncMock(return_value=SimpleNamespace(semester_diff_rules=[{"id": "r1"}] if active else [])),
                         execute=AsyncMock(side_effect=[Rows(nodes), Rows(tasks), Rows([])]))
    monkeypatch.setattr(routes, "_reference_template", AsyncMock(side_effect=lambda task, node, project, db: node.config["template"]))
    monkeypatch.setattr(routes, "_task_visible_content", AsyncMock(side_effect=lambda task, node, db, **kwargs: (record(task.id, "")["schema"], task.answers)))
    return db, project, nodes, tasks


def submission(task_id, version, actor="actual", node_id="a", actor_type="EMPLOYEE", **after):
    return SimpleNamespace(subject_ref=str(task_id), event_type="PERFORMANCE_TASK_SUBMITTED",
                           actor_type=actor_type, actor_ref=actor,
                           after_state={"project_id": 7, "node_id": node_id, "version": version, **after})


@pytest.mark.asyncio
async def test_runtime_reviewer_projection_batches_actual_submitters_from_frozen_people(monkeypatch):
    db, project, nodes, tasks = runtime(monkeypatch)
    tasks[0].handler_ref = "not-the-submitter"
    tasks.append(SimpleNamespace(**{**tasks[0].__dict__, "id": 3}))
    events = [submission(1, 1), submission(3, 1, "delegate"),
              submission(2, 2, "portal-id", "b", "PORTAL_USER",
                         identity_switch={"business_actor_type": "EMPLOYEE", "business_actor_ref": "switched"})]
    db.execute.side_effect = [Rows(nodes), Rows(tasks), Rows(events), Rows([
        ("actual", "冻结提交人"), ("delegate", "授权提交人"), ("switched", "切换身份提交人")])]
    internal, projected = await service.evaluate_task(db, tasks[0], nodes[0], project)
    matches = projected["matches"]
    assert [match["first_reviewer"] for match in matches] == [{"display_name": "冻结提交人"}, {"display_name": "授权提交人"}]
    assert all(match["second_reviewer"] == {"display_name": "切换身份提交人"} for match in matches)
    assert all("reviewer" not in str(match) for match in internal["matches"])
    assert "employee_no" not in str(matches) and "actual" not in str(matches) and "avatar_url" not in str(matches)
    assert db.execute.await_count == 4
    query = db.execute.await_args_list[-1].args[0]
    assert "source_snapshot_id = performance_authorization_snapshot_people.snapshot_id" in str(query)
    assert query.compile().params["id_1"] == tasks[0].member_snapshot_id
    assert query.compile().params["project_id_1"] == project.id


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["missing", "wrong-version", "missing-version", "wrong-project", "wrong-node", "portal", "blank-name", "outside-snapshot"])
async def test_runtime_reviewer_projection_never_invents_identity(monkeypatch, case):
    db, project, nodes, tasks = runtime(monkeypatch)
    tasks[0].handler_ref = "must-not-fallback"
    event = submission(1, 1)
    if case == "wrong-version":
        event.after_state["version"] = 99
    elif case == "missing-version":
        event.after_state.pop("version")
    elif case == "wrong-project":
        event.after_state["project_id"] = 99
    elif case == "wrong-node":
        event.after_state["node_id"] = "other"
    elif case == "portal":
        event.actor_type = "PORTAL_USER"
    events = [] if case == "missing" else [event]
    db.execute.side_effect = [Rows(nodes), Rows(tasks), Rows(events), Rows([("actual", " ")] if case == "blank-name" else [])]
    _, projected = await service.evaluate_task(db, tasks[0], nodes[0], project)
    assert projected["matches"][0]["first_reviewer"] is None
    assert projected["matches"][0]["second_reviewer"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["no-match", "hidden", "historical", "anonymous"])
async def test_runtime_no_visible_or_historical_identity_does_not_query(monkeypatch, case):
    db, project, nodes, tasks = runtime(monkeypatch, active=case != "historical", hide=case == "hidden")
    if case == "no-match":
        tasks[0].answers = {"i": "high"}
    elif case == "anonymous":
        for node in nodes:
            node.config["template"]["executor_label"] = "360°评估人"
    elif case == "historical":
        saved = compare_ratings(rule(), {"a": [record(1, "low", version=99)], "b": [record(2, "high", version=99)]})
        saved["reason"] = "历史理由"
        tasks[0].comparison_state = saved
    _, projected = await service.evaluate_task(db, tasks[0], nodes[0], project, include_history=True)
    assert db.execute.await_count == 2
    if projected:
        assert all(match["first_reviewer"] is None and match["second_reviewer"] is None for match in projected["matches"])


@pytest.mark.asyncio
async def test_shared_reviewer_uses_shared_source_task_and_revision_not_handler_version(monkeypatch):
    db, project, nodes, tasks = runtime(monkeypatch)
    nodes[0].config["template"]["include_final_result"] = True
    member = SimpleNamespace(shared_result_state={"source_task_id": 45, "revision": 8,
        "source_actor_type": "EMPLOYEE", "source_actor_ref": "shared-actual", "submitted_at": "2026-11-20T01:00:00Z"})
    db.scalar.side_effect = [db.scalar.return_value, member]
    db.execute.side_effect = [Rows(nodes), Rows(tasks), Rows([]), Rows([("shared-actual", "共享提交人")])]
    internal, projected = await service.evaluate_task(db, tasks[0], nodes[0], project)
    match = projected["matches"][0]
    assert match["first_task_id"] == 45 and match["first_version"] == 8
    assert match["first_reviewer"] == {"display_name": "共享提交人"}
    assert match["second_reviewer"] is None
    assert "共享提交人" not in str(internal) and "submitter_ref" not in str(internal)


@pytest.mark.asyncio
async def test_draft_override_is_not_attributed_to_previous_formal_submitter(monkeypatch):
    db, project, nodes, tasks = runtime(monkeypatch)
    db.execute.side_effect = [Rows(nodes), Rows(tasks), Rows([submission(1, 1), submission(2, 2, "other", "b")]), Rows([("other", "另一环节提交人")])]
    _, projected = await service.evaluate_task(db, tasks[0], nodes[0], project, {"i": "low"})
    assert projected["matches"][0]["first_reviewer"] is None
    assert projected["matches"][0]["second_reviewer"] == {"display_name": "另一环节提交人"}


@pytest.mark.asyncio
async def test_evaluate_uses_all_formal_results_with_answer_override(monkeypatch):
    db, project, nodes, tasks = runtime(monkeypatch)
    tasks.append(SimpleNamespace(**{**tasks[0].__dict__, "id": 3, "answers": {"i": "mid"}}))
    internal, projected = await service.evaluate_task(db, tasks[0], nodes[0], project, {"i": "low"}, all_formal=True)
    assert len(internal["_contexts"]) == 2
    assert internal["matches"][0]["second_task_id"] == 2
    assert projected["matches"][0]["reference_node_name"] == "上级评估"


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["ordinary", "reference", "management"])
@pytest.mark.parametrize("hidden", [False, True])
async def test_deleted_rule_history_is_authorized_and_inactive(monkeypatch, entry, hidden):
    db, project, nodes, tasks = runtime(monkeypatch, active=False, hide=hidden)
    saved = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    saved["reason"] = "历史理由"
    tasks[0].comparison_state = saved
    options = {"include_history": True}
    if entry == "reference":
        viewer = deepcopy(nodes[0].config["template"])
        viewer["content"].append({"content_slot": "reference", "reference_kind": "node", "reference_value": "a", "settings": {"allowView": not hidden}})
        options["viewer_template"] = viewer
    elif entry == "management":
        options["viewer_schemas"] = {"a": record(1, "low")["schema"], "b": [] if hidden else record(2, "high")["schema"]}
    internal, projected = await service.evaluate_task(db, tasks[0], nodes[0], project, **options)
    assert internal is None
    if hidden:
        assert projected is None
    else:
        assert projected["reason"] == "历史理由" and not projected["active"] and projected["historical"]
        assert not projected["show_notice_in_review"] and not projected["reason_required"]


@pytest.mark.asyncio
@pytest.mark.parametrize("hidden", [False, True])
async def test_overview_projects_comparison_from_current_entry(monkeypatch, hidden):
    from app.performance import projects_router as routes
    db, project, nodes, tasks = runtime(monkeypatch, hide=hidden)
    project.name = "项目"
    project.status = "STARTED"
    nodes[0].config["template"]["executor_role_code"] = "assessment.reviewee"
    cycle = SimpleNamespace(id=9, name="周期", start_at=None, end_at=None)
    access = SimpleNamespace(cycle_ids={9}, review_projects=[(project, cycle)], task_ids_by_project={7: {1}},
                             visible_node_ids_by_project={7: {11}}, voluntary_node_ids_by_project={})
    monkeypatch.setattr(routes, "resolve_frontend_access", AsyncMock(return_value=access))
    monkeypatch.setattr(routes, "project_payload", lambda *_: {})
    monkeypatch.setattr(routes, "_node_timing", lambda *_: {})
    monkeypatch.setattr(routes, "_self_summary_state", lambda *_: (False, False))
    db.get = AsyncMock(return_value=None)
    db.execute = AsyncMock(side_effect=[Rows(nodes), Rows([tasks[0]]), Rows(nodes), Rows(tasks), Rows([])])
    result = await routes.review_overview(7, SimpleNamespace(), db, task_id=1, cycle_id=None)
    payload = result["categories"][0]["nodes"][0]
    assert payload["task_id"] == 1
    if hidden:
        assert payload["comparison"] is None
    else:
        assert payload["comparison"]["matches"][0]["source_task_id"] == 2


@pytest.mark.asyncio
async def test_prepare_preserves_previous_reason_in_audit_and_does_not_store_forged_reason(monkeypatch):
    from app.performance import projects_router as routes
    internal = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    task = SimpleNamespace(comparison_state={"reason": "旧理由"})
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(internal, None)))
    comparison, projected, before = await routes._prepare_task_comparison(None, task, None, None, {}, routes.SelfSummaryAnswersPayload(diff_reason="不能授权的伪造理由"))
    assert before["reason"] == "旧理由" and task.comparison_state["reason"] is None
    assert comparison is not None and projected is None


@pytest.mark.asyncio
async def test_shared_comparison_failure_precedes_formal_write_and_commit(monkeypatch):
    from app.performance import projects_router as routes
    task = SimpleNamespace(handler_ref="actor", actor_drafts=None, draft_answers=None, task_kind="evaluation")
    node = SimpleNamespace(node_id="a")
    member = SimpleNamespace(shared_result_state={"revision": 1, "answers": {"i": "high"}})
    state = deepcopy(member.shared_result_state)
    db = SimpleNamespace(commit=AsyncMock())
    monkeypatch.setattr(routes, "_shared_write_context", AsyncMock(return_value=(member, state)))
    monkeypatch.setattr(routes, "_prepare_task_comparison", AsyncMock(side_effect=HTTPException(400, "DIFF_REASON_REQUIRED")))
    with pytest.raises(HTTPException, match="DIFF_REASON_REQUIRED"):
        await routes._save_shared_task(task, node, routes.SelfSummaryAnswersPayload(answers={"i": "low"}, result_version=1), True,
                                       SimpleNamespace(actor_ref="actor"), None, record(1, "low")["schema"], db)
    assert member.shared_result_state == {"revision": 1, "answers": {"i": "high"}}
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_full_formal_comparison_shared_result_is_not_duplicated(monkeypatch):
    db, project, nodes, tasks = runtime(monkeypatch)
    nodes[0].config["template"]["include_final_result"] = True
    tasks.append(SimpleNamespace(**{**tasks[0].__dict__, "id": 3}))
    cycle = db.scalar.return_value
    member = SimpleNamespace(shared_result_state={"source_task_id": 1, "revision": 6})
    db.scalar = AsyncMock(side_effect=[cycle, member])
    internal, _ = await service.evaluate_task(db, tasks[0], nodes[0], project, {"i": "low"}, all_formal=True)
    assert len(internal["_contexts"]) == 1


@pytest.mark.asyncio
async def test_enqueue_uses_full_formal_signature_and_does_not_swallow_failure(monkeypatch):
    from app.performance import projects_router as routes, comparison_notification_service as notifications
    formal = compare_ratings(rule(), {"a": [record(1, "low")], "b": [record(2, "high")]})
    task = SimpleNamespace(comparison_state={"reason": "原因", "matches": [{"stored": True}]})
    evaluate = AsyncMock(return_value=(formal, None))
    enqueue = AsyncMock(side_effect=RuntimeError("outbox failed"))
    monkeypatch.setattr(service, "evaluate_task", evaluate)
    monkeypatch.setattr(notifications, "enqueue_notifications", enqueue)
    with pytest.raises(RuntimeError, match="outbox failed"):
        await routes._enqueue_task_comparison(None, task, None, None, None, {"reason": "原因", "previous_rating_signature": formal["rating_signature"], "rating_signature": "task-local", "event_sequence": 4})
    assert evaluate.await_args.kwargs == {"all_formal": True}
    assert enqueue.await_args.args[-1]["rating_signature"] == formal["rating_signature"]
    assert task.comparison_state["matches"] == [{"stored": True}]
    assert task.comparison_state["reason"] == "原因"
    assert task.comparison_state["event_sequence"] == 3


def test_actor_reason_drafts_reload_privacy_clear_and_formal_state_preservation():
    task = SimpleNamespace(comparison_state={"rule_id": "r1", "reason": "正式理由", "rating_signature": "stable", "event_sequence": 3})
    service.set_actor_draft(task, "owner", "我的草稿", "ctx-1")
    service.set_actor_draft(task, "delegate", "代理草稿", "ctx-2")
    reloaded = SimpleNamespace(comparison_state=deepcopy(task.comparison_state))
    assert service.actor_draft_projection(reloaded, "owner", {"active": True}) == {"draft_diff_reason": "我的草稿", "draft_comparison_context": "ctx-1", "draft_comparison_reasons": []}
    assert service.actor_draft_projection(reloaded, "delegate", {"active": True})["draft_diff_reason"] == "代理草稿"
    assert service.actor_draft_projection(reloaded, "other", {"active": True})["draft_diff_reason"] is None
    assert service.actor_draft_projection(reloaded, "owner", None)["draft_diff_reason"] is None
    assert service.actor_draft_projection(reloaded, "owner", {"active": False})["draft_diff_reason"] is None
    service.set_actor_draft(task, "owner", None)
    assert "owner" not in task.comparison_state["actor_drafts"]
    assert task.comparison_state["reason"] == "正式理由" and task.comparison_state["rating_signature"] == "stable"
    assert task.comparison_state["actor_drafts"]["delegate"]["reason"] == "代理草稿"


@pytest.mark.asyncio
async def test_shared_draft_reason_explicit_update_omitted_preserves_submit_clears_only_actor(monkeypatch):
    from app.performance import projects_router as routes
    task = SimpleNamespace(id=1, project_id=7, node_snapshot_id=11, member_snapshot_id=4, target_employee_no="e", cycle_ref="cycle",
                           task_kind="evaluation", handler_ref="owner", actor_drafts=None, draft_answers=None, answer_version=1,
                           submitted_at=None, phase_id="", comparison_state={"reason": "正式理由"})
    member = SimpleNamespace(shared_result_state={"revision": 0, "answers": {"i": "high"}})
    actor = SimpleNamespace(actor_ref="owner", actor_type="EMPLOYEE")
    monkeypatch.setattr(routes, "_shared_write_context", AsyncMock(side_effect=lambda *_: (member, deepcopy(member.shared_result_state))))
    monkeypatch.setattr(routes, "_shared_answer_submissions", AsyncMock(return_value=[]))
    monkeypatch.setattr(routes, "_enqueue_task_comparison", AsyncMock())
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(None, {"active": True})))
    monkeypatch.setattr(routes, "PerformanceAuditService", lambda *_: SimpleNamespace(append_event=lambda *_: None))
    db = SimpleNamespace(commit=AsyncMock())
    schema = record(1, "low")["schema"]
    node = SimpleNamespace(node_id="a")
    payload = routes.SelfSummaryAnswersPayload(answers={"i": "low"}, result_version=0, diff_reason="草稿理由", comparison_context="ctx")
    first = await routes._save_shared_task(task, node, payload, False, actor, None, schema, db)
    assert first["draft_diff_reason"] == "草稿理由"
    reloaded = deepcopy(task.comparison_state)
    second = await routes._save_shared_task(task, node, routes.SelfSummaryAnswersPayload(answers={}, result_version=0), False, actor, None, schema, db)
    assert second["draft_diff_reason"] == "草稿理由" and task.comparison_state == reloaded
    service.set_actor_draft(task, "delegate", "他人草稿", "other")
    await routes._save_shared_task(task, node, routes.SelfSummaryAnswersPayload(answers={"i": "low"}, result_version=0), True, actor, None, schema, db)
    assert "owner" not in task.comparison_state["actor_drafts"]
    assert task.comparison_state["actor_drafts"]["delegate"]["reason"] == "他人草稿"
    assert task.comparison_state["reason"] == "正式理由"


@pytest.mark.asyncio
@pytest.mark.parametrize("shared", [False, True])
async def test_discard_clears_actor_reason_draft_only_after_version_validation(monkeypatch, shared):
    from app.performance import projects_router as routes
    from app.performance.models import PerformanceNodeTask
    task = PerformanceNodeTask(id=1, project_id=7, cycle_ref="c", task_kind="evaluation", handler_ref="owner", answer_version=1, draft_answers=None)
    service.set_actor_draft(task, "owner", "reason", "ctx")
    service.set_actor_draft(task, "delegate", "other", "ctx")
    node = SimpleNamespace(config={"template": {"include_final_result": shared}})
    context = SimpleNamespace(effective_employee_no="owner", subject_type="EMPLOYEE", subject_id="owner")
    db = SimpleNamespace(get=AsyncMock(return_value=None), commit=AsyncMock())
    monkeypatch.setattr(routes, "_self_summary_task", AsyncMock(return_value=(task, node)))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_ref="owner")))
    monkeypatch.setattr(routes, "_lock_task_context", AsyncMock())
    monkeypatch.setattr(routes, "_task_edit_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(routes, "_final_result_locked", AsyncMock(return_value=False))
    monkeypatch.setattr(routes, "_task_window", lambda *_: (None, None))
    monkeypatch.setattr(routes, "_overdue_submission_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(routes, "_self_summary_state", lambda *_: (True, True))
    monkeypatch.setattr(routes.shared_results, "member_for_task", AsyncMock(return_value=SimpleNamespace(shared_result_state={"revision": 1})))
    with pytest.raises(HTTPException, match="VERSION_CONFLICT"):
        await routes._discard_task_draft(1, routes.TaskDraftVersionPayload(version=2), context, db, "evaluation", None)
    assert task.comparison_state["actor_drafts"]["owner"]["reason"] == "reason"
    await routes._discard_task_draft(1, routes.TaskDraftVersionPayload(version=1), context, db, "evaluation", None)
    assert "owner" not in task.comparison_state["actor_drafts"]
    assert task.comparison_state["actor_drafts"]["delegate"]["reason"] == "other"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_ordinary_reason_only_draft_reload_omission_clear_and_submit(monkeypatch):
    from app.performance import projects_router as routes
    from app.performance.models import PerformanceNodeTask
    task = PerformanceNodeTask(id=1, project_id=7, cycle_ref="c", task_kind="evaluation", handler_ref="owner", answer_version=1, answers={"i": "low"}, draft_answers=None, status="pending")
    node = SimpleNamespace(node_id="a", node_type="evaluation", config={"template": {}})
    actor = SimpleNamespace(actor_ref="owner", actor_type="EMPLOYEE")
    context = SimpleNamespace(effective_employee_no="owner", subject_type="EMPLOYEE", subject_id="owner")
    db = SimpleNamespace(get=AsyncMock(return_value=None), commit=AsyncMock())
    monkeypatch.setattr(routes, "_self_summary_task", AsyncMock(return_value=(task, node)))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=actor))
    monkeypatch.setattr(routes, "_lock_task_context", AsyncMock())
    monkeypatch.setattr(routes, "_task_edit_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(routes, "_final_result_locked", AsyncMock(return_value=False))
    monkeypatch.setattr(routes, "_task_window", lambda *_: (None, None))
    monkeypatch.setattr(routes, "_overdue_submission_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(routes, "_self_summary_state", lambda *_: (True, True))
    monkeypatch.setattr(routes, "_self_summary_template", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "build_self_summary_schema", lambda *_: record(1, "low")["schema"])
    monkeypatch.setattr(routes, "PerformanceAuditService", lambda *_: SimpleNamespace(append_event=lambda *_: None))
    monkeypatch.setattr(routes, "_enqueue_task_comparison", AsyncMock())
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(None, {"active": True})))
    async def save(submit=False, **kwargs):
        return await routes._save_self_summary(1, routes.SelfSummaryAnswersPayload(answers={"i": "low"}, **kwargs), submit, context, db, "evaluation")
    first = await save(diff_reason="草稿理由", comparison_context="ctx")
    assert first["has_draft"] and first["draft_diff_reason"] == "草稿理由" and task.draft_answers is None
    assert service.actor_draft_projection(SimpleNamespace(comparison_state=deepcopy(task.comparison_state)), "owner", {"active": True})["draft_diff_reason"] == "草稿理由"
    assert (await save())["draft_diff_reason"] == "草稿理由"
    assert (await save(diff_reason=None))["draft_diff_reason"] is None
    await save(diff_reason="再次填写", comparison_context="ctx")
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(side_effect=HTTPException(409, "COMPARISON_SOURCE_CHANGED")))
    with pytest.raises(HTTPException, match="COMPARISON_SOURCE_CHANGED"):
        await save(True)
    assert task.comparison_state["actor_drafts"]["owner"]["reason"] == "再次填写"
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(None, None)))
    result = await save(True)
    assert result["draft_diff_reason"] is None and task.comparison_state is None


def test_reason_payload_length_matches_source_limit():
    from pydantic import ValidationError
    from app.performance.projects_router import SelfSummaryAnswersPayload
    SelfSummaryAnswersPayload(diff_reason="x" * 20000)
    with pytest.raises(ValidationError):
        SelfSummaryAnswersPayload(diff_reason="x" * 20001)
    with pytest.raises(ValidationError):
        SelfSummaryAnswersPayload(comparison_reasons=[{"rule_id": "r1", "diff_reason": "x" * 20001}])


def two_comparisons():
    groups = [compare_ratings({**rule(), "id": key}, {"a": [record(1, "low")], "b": [record(2, "high")]}) for key in ["r1", "r2"]]
    schemas = {"a": record(1, "low")["schema"], "b": record(2, "high")["schema"]}
    projected = [{**project_comparison(group, schemas, "a"), "active": True} for group in groups]
    return service._envelope(groups), service._envelope(projected)


@pytest.mark.asyncio
async def test_two_rules_same_node_only_second_matches_and_each_is_projected(monkeypatch):
    db, project, nodes, tasks = runtime(monkeypatch)
    first = {**rule(threshold=3), "template_id": 3}
    second = {**rule(), "id": "r2", "template_id": 3}
    project.settings["comparison_rules_snapshot"]["rules"] = [first, second]
    db.scalar.return_value.semester_diff_rules = [{"id": "r1"}, {"id": "r2"}]
    db.execute.side_effect = [Rows(nodes), Rows(tasks), Rows(nodes), Rows(tasks), Rows([])]
    internal, projected = await service.evaluate_task(db, tasks[0], nodes[0], project)
    assert [group["rule_id"] for group in internal["groups"]] == ["r1", "r2"]
    assert not internal["groups"][0]["matches"] and internal["groups"][1]["matches"]
    assert [group["rule_id"] for group in projected["groups"]] == ["r1", "r2"]
    assert not projected["groups"][0]["reason_required"] and projected["groups"][1]["reason_required"]
    assert {match["rule_id"] for match in service.comparison_prompts(projected)} == {"r2"}
    reasons = [{"rule_id": "r2", "diff_reason": "second only", "comparison_context": projected["groups"][1]["context"]}]
    state = service.validate_submission(internal, projected, None, None, reasons)
    assert state["groups"][0]["reason"] is None and state["groups"][1]["reason"] == "second only"


@pytest.mark.asyncio
async def test_two_group_submission_is_atomic_and_reasons_and_contexts_are_independent(monkeypatch):
    from app.performance import projects_router as routes
    internal, projected = two_comparisons()
    task = SimpleNamespace(comparison_state={"reason": "previous"})
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(internal, projected)))
    reasons = [{"rule_id": group["rule_id"], "diff_reason": f"reason-{group['rule_id']}", "comparison_context": group["context"]} for group in projected["groups"]]
    with pytest.raises(HTTPException, match="DIFF_REASON_REQUIRED"):
        await routes._prepare_task_comparison(None, task, None, None, {}, routes.SelfSummaryAnswersPayload(comparison_reasons=reasons[:1]))
    assert task.comparison_state == {"reason": "previous"}
    stale = deepcopy(reasons)
    stale[1]["comparison_context"] = "stale-r2"
    with pytest.raises(HTTPException, match="COMPARISON_SOURCE_CHANGED"):
        await routes._prepare_task_comparison(None, task, None, None, {}, routes.SelfSummaryAnswersPayload(comparison_reasons=stale))
    assert task.comparison_state == {"reason": "previous"}
    with pytest.raises(HTTPException, match="COMPARISON_REASONS_REQUIRED"):
        service.validate_submission(internal, projected, "must not copy", projected["context"])
    await routes._prepare_task_comparison(None, task, None, None, {}, routes.SelfSummaryAnswersPayload(comparison_reasons=reasons))
    assert task.comparison_state["groups"]["r1"]["reason"] == "reason-r1"
    assert task.comparison_state["groups"]["r2"]["reason"] == "reason-r2"
    assert projected["groups"][1]["reason"] == "reason-r2"


@pytest.mark.parametrize("invalid", ["duplicate", "unauthorized"])
def test_group_reason_ids_must_be_unique_and_authorized(invalid):
    internal, projected = two_comparisons()
    entries = [{"rule_id": "r1", "diff_reason": "first"}, {"rule_id": "r1" if invalid == "duplicate" else "hidden", "diff_reason": "second"}]
    with pytest.raises(HTTPException, match="COMPARISON_REASON_INVALID"):
        service.validate_submission(internal, projected, None, None, entries)


def test_group_drafts_reload_are_private_and_clear_independently():
    _, projected = two_comparisons()
    task = SimpleNamespace(comparison_state={"groups": {"r1": {"rule_id": "r1", "reason": "formal1"}, "r2": {"rule_id": "r2", "reason": "formal2"}}})
    reasons = [{"rule_id": group["rule_id"], "diff_reason": f"draft-{group['rule_id']}", "comparison_context": group["context"]} for group in projected["groups"]]
    service.set_actor_draft(task, "owner", None, comparison_reasons=reasons, comparison=projected)
    reloaded = SimpleNamespace(comparison_state=deepcopy(task.comparison_state))
    assert service.actor_draft_projection(reloaded, "owner", projected)["draft_comparison_reasons"] == reasons
    assert service.actor_draft_projection(reloaded, "other", projected)["draft_comparison_reasons"] == []
    service.set_actor_draft(task, "owner", None, comparison_reasons=[{"rule_id": "r1", "diff_reason": None}], comparison=projected)
    assert service.actor_draft_projection(task, "owner", projected)["draft_comparison_reasons"] == reasons[1:]
    hidden = service._envelope([projected["groups"][0]])
    assert service.actor_draft_projection(task, "owner", hidden)["draft_comparison_reasons"] == []
    assert task.comparison_state["groups"]["r1"]["reason"] == "formal1"
    assert task.comparison_state["groups"]["r2"]["reason"] == "formal2"


@pytest.mark.asyncio
async def test_deleted_first_rule_history_survives_second_submission_and_has_no_active_notice(monkeypatch):
    from app.performance import projects_router as routes
    db, project, nodes, tasks = runtime(monkeypatch)
    first, second = {**rule(), "template_id": 3}, {**rule(), "id": "r2", "template_id": 3}
    project.settings["comparison_rules_snapshot"]["rules"] = [first, second]
    db.scalar.return_value.semester_diff_rules = [{"id": "r2"}]
    old = compare_ratings(first, {"a": [record(1, "low")], "b": [record(2, "high")]})
    old["reason"] = "historical-r1"
    tasks[0].comparison_state = {"groups": {"r1": old}}
    db.execute.side_effect = [Rows(nodes), Rows(tasks), Rows([])]
    internal, projected = await service.evaluate_task(db, tasks[0], nodes[0], project)
    assert [group["rule_id"] for group in internal["groups"]] == ["r2"]
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(internal, projected)))
    await routes._prepare_task_comparison(db, tasks[0], nodes[0], project, {}, routes.SelfSummaryAnswersPayload(comparison_reasons=[{"rule_id": "r2", "diff_reason": "new-r2", "comparison_context": projected["context"]}]))
    assert tasks[0].comparison_state["groups"]["r1"]["reason"] == "historical-r1"
    monkeypatch.undo()
    db, project, nodes, fresh = runtime(monkeypatch)
    project.settings["comparison_rules_snapshot"]["rules"] = [first, second]
    db.scalar.return_value.semester_diff_rules = [{"id": "r2"}]
    fresh[0].comparison_state = deepcopy(tasks[0].comparison_state)
    db.execute.side_effect = [Rows(nodes), Rows(fresh), Rows(nodes), Rows(fresh), Rows([])]
    _, history = await service.evaluate_task(db, fresh[0], nodes[0], project, include_history=True)
    by_id = {group["rule_id"]: group for group in history["groups"]}
    assert by_id["r1"]["reason"] == "historical-r1" and not by_id["r1"]["active"]
    assert by_id["r1"]["historical"] and not by_id["r1"]["show_notice_in_review"]
    assert by_id["r2"]["reason"] == "new-r2" and by_id["r2"]["active"]


@pytest.mark.asyncio
async def test_router_enqueues_each_formal_group_without_overwriting_other_group(monkeypatch):
    from app.performance import projects_router as routes, comparison_notification_service as notifications
    internal, _ = two_comparisons()
    task = SimpleNamespace(comparison_state={"groups": {group["rule_id"]: {**group, "reason": group["rule_id"]} for group in internal["groups"]}})
    monkeypatch.setattr(service, "evaluate_task", AsyncMock(return_value=(deepcopy(internal), None)))
    enqueue = AsyncMock(return_value=1)
    monkeypatch.setattr(notifications, "enqueue_notifications", enqueue)
    await routes._enqueue_task_comparison(None, task, None, None, None, internal)
    assert [call.args[-1]["rule_id"] for call in enqueue.await_args_list] == ["r1", "r2"]
    assert task.comparison_state["groups"]["r1"]["reason"] == "r1"
    assert task.comparison_state["groups"]["r2"]["reason"] == "r2"
