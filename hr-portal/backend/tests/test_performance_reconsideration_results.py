from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.performance.reconsideration_result_service import (
    baseline_schema,
    effective_result,
    freeze_result,
    prepare_decision,
    task_result,
)


def _result(*, readonly=False):
    schema = [{
        "id": "s1", "name": "结果", "allow_multiple": False,
        "fields": [{"id": "rating-1", "type": "rating", "required": True,
                     "readonly": readonly, "options": [{"id": "A", "label": "优秀"}, {"id": "B", "label": "良好"}]}],
    }]
    content = {"task_id": 1, "form_schema": deepcopy(schema), "answers": {"rating-1": "A"}}
    return {
        "project_id": 3, "employee_no": "E001", "results": [
            {"task_id": 1, "field_id": "rating-1", "option_id": "A", "label": "优秀"}
        ], "contents": [content], "regions": [
            {"key": "result", "kind": "result", "contents": [deepcopy(content)]},
            {"key": "reference:x", "kind": "reference", "contents": [deepcopy(content)]},
        ], "content_page_name": "结果",
    }


def _template(*, allow_modify=True):
    final_content = {
        "content_id": "s1", "type": "custom", "name": "结果",
        "content_slot": "fill", "items": [{"id": "rating-1", "kind": "rating", "options": [
            {"id": "A", "label": "优秀"}, {"id": "B", "label": "良好"}
        ], "settings": {"required": True}}],
    }
    node_content = deepcopy(final_content)
    return {
        "node": {"content": [node_content], "calibration_settings": {
            "s1": {"items": {"rating-1": {"allowModify": allow_modify}}}
        }},
        "final": {"content": [final_content]},
    }


def _code(exc):
    return exc.value.detail["code"] if isinstance(exc.value.detail, dict) else exc.value.detail


def test_freeze_result_deepcopies_source_and_freezes_intersection():
    result = _result(readonly=True)
    snapshot = freeze_result(result, 11, 22, {"1": "v1"}, _template())
    assert snapshot["schema_version"] == 1
    assert snapshot["member_snapshot_id"] == 11
    assert snapshot["task_versions"] == {"1": "v1"}
    assert snapshot["answers"] == {"rating-1": "A"}
    assert snapshot["form_schema"][0]["fields"][0]["readonly"] is False
    result["contents"][0]["answers"]["rating-1"] = "B"
    assert snapshot["source_result"]["contents"][0]["answers"]["rating-1"] == "A"


def test_freeze_rejects_inconsistent_task_projection_and_section_collision():
    result = _result()
    second = deepcopy(result["contents"][0])
    second["task_id"] = 2
    second["form_schema"][0]["fields"][0]["options"] = [{"id": "C", "label": "不同"}]
    result["contents"].append(second)
    with pytest.raises(HTTPException) as exc:
        freeze_result(result, 1, 2, {}, _template())
    assert _code(exc) == "RECONSIDERATION_SOURCE_CONFLICT"


def test_task_result_rejects_legacy_missing_snapshot():
    with pytest.raises(HTTPException) as exc:
        task_result({"result_version": {}})
    assert _code(exc) == "RECONSIDERATION_BASELINE_UNAVAILABLE"


def test_prepare_decision_keep_ignores_adjustment_and_change_validates():
    snapshot = freeze_result(_result(), 1, 2, {}, _template())
    kept = prepare_decision(snapshot, {}, {}, {"keep_result": "keep", "rating-1": "B"}, True, True)
    assert kept == {"rating-1": "A", "keep_result": "keep"}
    changed = prepare_decision(snapshot, {}, {}, {"keep_result": "change", "rating-1": "B"}, True, True)
    assert changed == {"rating-1": "B", "keep_result": "change"}


def test_prepare_decision_rejects_hidden_change_unknown_and_missing_choice():
    snapshot = freeze_result(_result(), 1, 2, {}, _template(allow_modify=False))
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, {}, {"keep_result": "change", "rating-1": "B"}, True, True)
    assert _code(exc) == "VALIDATION_FAILED"
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, {}, {"keep_result": "change", "unknown": "x"}, True, True)
    assert _code(exc) == "VALIDATION_FAILED"
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, {}, {"rating-1": "B"}, True, True)
    assert _code(exc) == "VALIDATION_FAILED"
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, {}, {"keep_result": "change"}, False, True)
    assert _code(exc) == "VALIDATION_FAILED"


def test_required_is_checked_only_on_submit():
    snapshot = freeze_result(_result(), 1, 2, {}, _template())
    draft = prepare_decision(snapshot, {}, {}, {"keep_result": "change", "rating-1": None}, True, False)
    assert draft["keep_result"] == "change"
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, {}, {"keep_result": "change", "rating-1": None}, True, True)
    assert _code(exc) == "VALIDATION_FAILED"


def test_effective_result_updates_only_result_region_and_rating_summary():
    snapshot = freeze_result(_result(), 1, 2, {}, _template())
    result = effective_result(snapshot, {"rating-1": "B", "keep_result": "change"})
    assert result["contents"][0]["answers"]["rating-1"] == "B"
    assert result["regions"][0]["contents"][0]["answers"]["rating-1"] == "B"
    assert result["regions"][1]["contents"][0]["answers"]["rating-1"] == "A"
    assert result["results"] == [{"task_id": 1, "field_id": "rating-1", "option_id": "B", "label": "良好"}]


@pytest.mark.parametrize("mutation", ["answers", "type", "repeated", "cross_section", "field_id"])
def test_freeze_conflicts_do_not_choose_an_arbitrary_task(mutation):
    result = _result()
    content = deepcopy(result["contents"][0])
    content["task_id"] = 2
    result["contents"].append(content)
    if mutation == "answers":
        content["answers"]["rating-1"] = "B"
    elif mutation == "type":
        content["form_schema"][0]["fields"][0]["type"] = "rich_text"
    elif mutation == "repeated":
        content["form_schema"][0]["allow_multiple"] = True
    elif mutation == "cross_section":
        section = deepcopy(content["form_schema"][0])
        section["id"] = "other"
        content["form_schema"].append(section)
    else:
        content["form_schema"][0]["fields"][0]["id"] = "other"
    with pytest.raises(HTTPException) as exc:
        freeze_result(result, 1, 2, {}, _template())
    assert exc.value.status_code == 409
    assert _code(exc) == "RECONSIDERATION_SOURCE_CONFLICT"


def test_zero_fields_and_reference_fields_are_not_writable():
    result = _result()
    result["contents"] = []
    snapshot = freeze_result(result, 1, 2, {}, _template())
    assert snapshot["form_schema"] == []
    assert snapshot["answers"] == {}
    assert prepare_decision(snapshot, {}, None, {"keep_result": "keep"}, False, True) == {"keep_result": "keep"}
    with pytest.raises(HTTPException):
        prepare_decision(snapshot, {}, None, {"keep_result": "change", "rating-1": "B"}, True, True)
    assert effective_result(snapshot, {"keep_result": "keep"}) == result


def test_task_baseline_and_effective_results_are_independent_copies():
    snapshot = freeze_result(_result(), 1, 2, {"1": 4}, _template())
    original = deepcopy(snapshot)
    schema, answers = task_result({"result_snapshot": snapshot}, filling=True)
    schema[0]["fields"][0]["readonly"] = True
    answers["rating-1"] = "B"
    shown = baseline_schema(snapshot)
    shown.clear()
    result = effective_result(snapshot, {"keep_result": "change", "rating-1": "B"})
    result["regions"][0]["contents"][0]["answers"]["rating-1"] = "A"
    assert result["contents"][0]["answers"]["rating-1"] == "B"
    assert snapshot == original


def test_keep_draft_retains_valid_adjustments_and_submit_keep_discards_them():
    snapshot = freeze_result(_result(), 1, 2, {}, _template())
    original = deepcopy(snapshot)
    draft = prepare_decision(snapshot, {}, {"keep_result": "change", "rating-1": "B"}, {"keep_result": "keep"}, True, False)
    assert draft == {"rating-1": "B", "keep_result": "keep"}
    kept = prepare_decision(snapshot, {}, draft, {"keep_result": "keep", "unknown": {"evil": True}}, True, True)
    assert kept == {"rating-1": "A", "keep_result": "keep"}
    with pytest.raises(HTTPException):
        prepare_decision(snapshot, {}, draft, {}, True, True)
    assert snapshot == original


@pytest.mark.parametrize("choice", [None, "", "invalid", [], {}])
def test_choice_values_are_explicitly_validated(choice):
    snapshot = freeze_result(_result(), 1, 2, {}, _template())
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, None, {"keep_result": choice}, True, False)
    assert exc.value.status_code == 400


@pytest.mark.parametrize("value", ["C", "__unknown__", [], ["A"], {"id": "B"}, 1])
def test_invalid_rating_and_nonrepeated_value_shapes_are_rejected(value):
    snapshot = freeze_result(_result(), 1, 2, {}, _template())
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, None, {"keep_result": "change", "rating-1": value}, True, False)
    assert exc.value.status_code == 400


def _rich_snapshot(*, repeated=False, readonly=False):
    result = _result()
    section = result["contents"][0]["form_schema"][0]
    section["allow_multiple"] = repeated
    section["fields"].append({"id": "text-1", "type": "rich_text", "required": True})
    result["contents"][0]["answers"]["text-1"] = ["first", "second"] if repeated else "first"
    if repeated:
        result["contents"][0]["answers"]["rating-1"] = ["A", "B"]
    template = _template(allow_modify=not readonly)
    template["final"]["content"][0]["settings"] = {"allowMultiple": repeated}
    template["final"]["content"][0]["items"].append({"id": "text-1", "kind": "fill", "settings": {"required": True}})
    return freeze_result(result, 1, 2, {}, template)


def test_change_preserves_trusted_readonly_and_effective_result_accepts_full_answers():
    snapshot = _rich_snapshot(readonly=True)
    decision = prepare_decision(snapshot, {"rating-1": "B", "text-1": "old"}, None,
                                {"keep_result": "change", "text-1": "new"}, True, True)
    assert decision == {"rating-1": "A", "text-1": "new", "keep_result": "change"}
    assert effective_result(snapshot, decision)["contents"][0]["answers"] == {"rating-1": "A", "text-1": "new"}
    with pytest.raises(HTTPException):
        prepare_decision(snapshot, {}, None, {"keep_result": "change", "rating-1": "A"}, True, False)
    with pytest.raises(HTTPException):
        effective_result(snapshot, {"keep_result": "change", "rating-1": "B", "text-1": "new"})


def test_rich_text_sanitization_and_repeated_required_validation():
    snapshot = _rich_snapshot(repeated=True)
    payload = {"keep_result": "change", "rating-1": ["B", "A"], "text-1": ["<b>ok</b><script>bad</script>", ""]}
    draft = prepare_decision(snapshot, {}, None, payload, True, False)
    assert draft["text-1"] == ["<b>ok</b>", ""]
    with pytest.raises(HTTPException) as exc:
        prepare_decision(snapshot, {}, draft, {"keep_result": "change"}, True, True)
    assert exc.value.detail["field_id"] == "text-1"
    submitted = prepare_decision(snapshot, {}, draft, {"keep_result": "change", "text-1": ["one", "two"]}, True, True)
    assert submitted["rating-1"] == ["B", "A"]


def test_hidden_local_mode_and_source_invisible_fields_are_excluded():
    template = _template()
    template["node"]["calibration_settings"]["s1"]["items"]["rating-1"]["mode"] = "hidden"
    snapshot = freeze_result(_result(), 1, 2, {}, template)
    assert snapshot["form_schema"] == []
    with pytest.raises(HTTPException):
        prepare_decision(snapshot, {}, None, {"keep_result": "change", "rating-1": "B"}, True, True)
    result = _result()
    template = _template()
    template["final"]["content"][0]["items"].append({"id": "secret", "kind": "fill", "settings": {"required": True}})
    snapshot = freeze_result(result, 1, 2, {}, template)
    with pytest.raises(HTTPException):
        prepare_decision(snapshot, {}, None, {"keep_result": "change", "secret": "new"}, True, True)


@pytest.mark.parametrize("snapshot", [None, {}, {"schema_version": 2}, {"schema_version": 1, "source_result": {}}])
def test_legacy_or_incomplete_snapshots_fail_closed(snapshot):
    for action in (
        lambda: baseline_schema(snapshot),
        lambda: task_result({"result_snapshot": snapshot}),
        lambda: prepare_decision(snapshot, {}, None, {"keep_result": "keep"}, True, True),
        lambda: effective_result(snapshot, {"keep_result": "keep"}),
    ):
        with pytest.raises(HTTPException) as exc:
            action()
        assert exc.value.status_code == 409
        assert _code(exc) == "RECONSIDERATION_BASELINE_UNAVAILABLE"


def _tag_snapshot():
    result = _result()
    field = result["contents"][0]["form_schema"][0]["fields"][0]
    field["type"] = "tag_with_followup"
    result["contents"][0]["answers"] = {"rating-1": {"tags": ["A"], "notes": {"A": "before"}}}
    template = _template()
    template["final"]["content"][0]["questionType"] = "tag"
    template["final"]["content"][0]["items"][0]["kind"] = "fill"
    return freeze_result(result, 1, 2, {}, template)


def test_tags_use_shared_projection_and_sanitization():
    snapshot = _tag_snapshot()
    payload = {"keep_result": "change", "rating-1": {"tags": ["B"], "notes": {"B": "<b>yes</b><script>no</script>"}}}
    assert prepare_decision(snapshot, {}, None, payload, True, True)["rating-1"] == {
        "tags": ["B"], "notes": {"B": "<b>yes</b>"}
    }


@pytest.mark.parametrize("value", [
    {"tags": ["secret"]}, {"tags": ["A"], "notes": {"B": "hidden"}},
    {"tags": ["A"], "extra": "hidden"}, {"tags": "A"},
])
def test_invalid_tags_and_unknown_nested_input_are_rejected(value):
    with pytest.raises(HTTPException) as exc:
        prepare_decision(_tag_snapshot(), {}, None, {"keep_result": "change", "rating-1": value}, True, False)
    assert exc.value.status_code == 400


def test_multiple_equal_tasks_update_both_main_results_without_touching_reference():
    result = _result()
    second = deepcopy(result["contents"][0])
    second["task_id"] = 2
    result["contents"].append(second)
    snapshot = freeze_result(result, 1, 2, {"1": 3, "2": 4}, _template())
    updated = effective_result(snapshot, {"keep_result": "change", "rating-1": "B"})
    assert [content["answers"]["rating-1"] for content in updated["contents"]] == ["B", "B"]
    assert [item["task_id"] for item in updated["results"]] == [1, 2]
    assert updated["regions"][1] == result["regions"][1]




def test_final_display_readonly_is_not_inherited_as_write_permission():
    template = _template()
    template["final"]["content"][0]["items"][0]["settings"]["mode"] = "view"
    snapshot = freeze_result(_result(readonly=True), 1, 2, {}, template)
    assert snapshot["form_schema"][0]["fields"][0]["readonly"] is False
    assert snapshot["form_schema"][0]["fields"][0]["required"] is True


def test_frozen_runtime_uses_local_display_and_prompt_visibility():
    template = _template()
    template["node"]["calibration_settings"]["s1"]["settings"] = {"hideDescription": True}
    template["node"]["calibration_settings"]["s1"]["items"]["rating-1"]["hideName"] = True
    template["final"]["content"][0]["description"] = "不展示描述"
    template["final"]["content"][0]["items"].insert(0, {"id": "hint", "kind": "prompt", "prompt": {"content": "填写提示", "allowView": True, "onlyWhenFilling": True}})
    snapshot = freeze_result(_result(), 1, 2, {}, template)
    schema = baseline_schema(snapshot, filling=True)
    assert schema[0]["description"] == ""
    assert schema[0]["fields"][0]["hide_name"] is True
    assert schema[0]["elements"][0]["id"] == "hint"
    assert all(element["kind"] != "prompt" for element in baseline_schema(snapshot)[0]["elements"])


def test_optional_rating_can_be_cleared_without_restoring_baseline():
    template = _template()
    template["final"]["content"][0]["items"][0]["settings"]["required"] = False
    snapshot = freeze_result(_result(), 1, 2, {}, template)
    decision = prepare_decision(snapshot, {}, None, {"keep_result": "change", "rating-1": ""}, True, True)
    result = effective_result(snapshot, decision)
    assert result["contents"][0]["answers"]["rating-1"] == ""
    assert result["results"] == []


@pytest.fixture
def decision_runtime(monkeypatch):
    from app.performance import projects_router as router, reconsideration_service as service
    from app.performance.auth_context import PerformanceAccessContext
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    snapshot = freeze_result(_result(), 11, 22, {"1": 3}, _template())
    appeal = SimpleNamespace(id=4, member_snapshot_id=11, reason="核对事实", result_snapshot=snapshot, effective_result=None,
                             closed_at=None, version=1)
    task = PerformanceNodeTask(id=8, project_id=3, cycle_ref="cycle:one", member_snapshot_id=11,
                               node_snapshot_id=5, target_employee_no="E001", handler_ref="H1",
                               task_kind="result_reconsideration", status="pending", answers={},
                               answer_version=1, revoked_at=None)
    other = PerformanceNodeTask(id=9, project_id=3, cycle_ref="cycle:one", member_snapshot_id=11,
                                node_snapshot_id=5, target_employee_no="E001", handler_ref="H2",
                                task_kind="result_reconsideration", status="pending", answers={},
                                answer_version=1, revoked_at=None)
    node = PerformanceProjectNodeSnapshot(id=5, project_id=3, node_id="appeal", node_type="result_reconsideration",
                                         name="复议处理", node_order=3, config={"template": _template()["node"]})
    context = PerformanceAccessContext(subject_type="EMPLOYEE", subject_id="H1", effective_employee_no="H1", display_name="处理人", account_type="employee", portal_entry_permissions=[], role_grants=[], permission_codes=[])
    project = SimpleNamespace(id=3, cycle_ref="cycle:one", settings={})
    db = SimpleNamespace(get=AsyncMock(return_value=project), commit=AsyncMock())
    monkeypatch.setattr(router, "_self_summary_task", AsyncMock(return_value=(task, node)))
    monkeypatch.setattr(router, "_lock_task_context", AsyncMock(return_value=project))
    monkeypatch.setattr(router, "_task_edit_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(router, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="H1")))
    monkeypatch.setattr(service, "reconsideration_for_task", AsyncMock(return_value=appeal))
    monkeypatch.setattr(service, "reconsideration_tasks", AsyncMock(return_value=[task, other]))
    audit = SimpleNamespace(append_event=lambda event: events.append(event))
    events = []
    monkeypatch.setattr(router, "PerformanceAuditService", lambda _db: audit)
    return SimpleNamespace(router=router, service=service, task=task, other=other, node=node,
                           appeal=appeal, project=project, db=db, context=context, events=events)


@pytest.mark.asyncio
async def test_runtime_draft_submit_resubmit_and_draft_do_not_change_effective_result(decision_runtime):
    data = decision_runtime
    payload = data.router.SelfSummaryAnswersPayload(answers={"rating-1": "B", "keep_result": "change"}, version=1)
    draft = await data.router._save_self_summary(8, payload, False, data.context, data.db, "evaluation")
    assert draft["version"] == 2 and data.other.draft_answers["rating-1"] == "B"
    assert data.appeal.closed_at is None
    submitted = await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "change"}, version=2), True, data.context, data.db, "evaluation")
    assert not submitted["reconsideration_closed"] and submitted["editable"] and submitted["submit_allowed"]
    assert data.appeal.effective_result["contents"][0]["answers"]["rating-1"] == "B"
    assert data.other.status == "completed" and data.other.answer_version == 3
    assert data.appeal.result_snapshot["answers"]["rating-1"] == "A"
    assert data.events[-1].event_type == "PERFORMANCE_RECONSIDERATION_CLOSED"
    first = data.events[-1]
    assert first.actor_ref == "H1" and first.after_state["display_name"] == "处理人"
    assert first.after_state["adjustments"][0]["before"] == "A"
    assert first.after_state["adjustments"][0]["after"] == "B"
    await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "keep"}, version=3), False, data.context, data.db, "evaluation")
    assert data.appeal.effective_result["contents"][0]["answers"]["rating-1"] == "B"
    await data.router._discard_task_draft(8, data.router.TaskDraftVersionPayload(version=4), data.context, data.db, "evaluation", None)
    second = await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "keep"}, version=5), True, data.context, data.db, "evaluation")
    assert second["editable"] and data.appeal.effective_result["contents"][0]["answers"]["rating-1"] == "A"
    assert data.events[-1].before_state["answers"]["rating-1"] == "B"
    assert data.events[-1].after_state["adjustments"][0]["after"] == "A"


@pytest.mark.asyncio
async def test_runtime_keep_discards_hidden_adjustments_and_retains_baseline(decision_runtime):
    data = decision_runtime
    result = await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "keep", "rating-1": "invalid"}, version=1), True, data.context, data.db, "evaluation")
    assert result["answers"] == {"rating-1": "A", "keep_result": "keep"}
    assert data.appeal.effective_result == data.appeal.result_snapshot["source_result"]


@pytest.mark.asyncio
async def test_runtime_version_conflict_does_not_close(decision_runtime):
    data = decision_runtime
    with pytest.raises(HTTPException, match="VERSION_CONFLICT"):
        await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "keep"}, version=9), True, data.context, data.db, "evaluation")
    assert data.appeal.closed_at is None
    data.db.commit.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["360", "ordinary", "missing_source", "missing_template", "wrong_project", "duplicate_view", "duplicate_relation", "with_content"])
async def test_closed_result_reference_types_preserve_frozen_payload(decision_runtime, monkeypatch, scenario):
    data = decision_runtime
    relation = {"content_id": "arbitrary-reference-id", "content_slot": "reference", "reference_kind": "node", "reference_value": "frozen-source"}
    source = SimpleNamespace(id=2, project_id=3, node_id="frozen-source", node_type="evaluation",
        config={"template": {"executor_role_code": "assessment.reviewer_360"}})
    view = SimpleNamespace(id=3, project_id=3, node_id="result-view-1", node_type="result_view",
        config={"template": {"content": [relation]}})
    nodes = [view, source]
    if scenario == "ordinary":
        source.config["template"]["executor_role_code"] = "assessment.line_manager"
    elif scenario == "missing_source":
        nodes = [view]
    elif scenario == "missing_template":
        source.config = {}
    elif scenario == "wrong_project":
        source.project_id = 99
    elif scenario == "duplicate_view":
        nodes.append(SimpleNamespace(id=4, project_id=3, node_id="other-view", node_type="result_view", config={}))
    elif scenario == "duplicate_relation":
        view.config["template"]["content"].append(dict(relation))
    data.appeal.closed_at = datetime.now(UTC)
    data.appeal.effective_result = effective_result(data.appeal.result_snapshot, {"rating-1": "B", "keep_result": "change"})
    data.appeal.effective_result["regions"].extend([
        {"key": "reference:arbitrary-reference-id", "kind": "reference", "reference_kind": "node",
         "title": "360°反馈（自愿评估）", "status": "unavailable", "contents": []},
        {"key": "reference:ordinary", "kind": "reference", "reference_kind": "node", "title": "发展建议", "contents": []},
        {"key": "reference:okr", "kind": "reference", "reference_kind": "okr", "contents": [], "okrs": []},
    ])
    if scenario == "with_content":
        data.appeal.effective_result["regions"][2]["contents"] = [{
            "task_id": 70, "form_schema": _result()["contents"][0]["form_schema"],
            "answers": {"rating-1": "A"}, "reviewer": {"display_name": "评估人"},
        }]
    original = deepcopy(data.appeal.effective_result)
    data.db.scalar = AsyncMock(side_effect=[data.appeal, SimpleNamespace(id=22)])
    data.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: nodes)))
    monkeypatch.setattr(data.router, "_get_project", AsyncMock(return_value=data.project))
    monkeypatch.setattr(data.router, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E001")))
    source_read = AsyncMock(side_effect=AssertionError("must not read mutable final or current answers"))
    monkeypatch.setattr(data.router, "_published_employee_result", source_read)
    from fastapi import FastAPI
    from fastapi.encoders import jsonable_encoder
    from httpx import ASGITransport, AsyncClient
    app = FastAPI()
    app.include_router(data.router.router)
    app.dependency_overrides[data.router.get_session] = lambda: data.db
    app.dependency_overrides[data.router.get_performance_access_context] = lambda: data.context
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/performance/workbench/projects/3/results")
    assert response.status_code == 200
    result = response.json()
    expected = jsonable_encoder(deepcopy(original))
    if scenario in {"360", "with_content"}:
        expected["regions"][2]["reference_kind"] = "reviewer_360"
    assert result == expected
    assert data.appeal.effective_result == original
    assert await data.router._normalize_result_region_kinds(result, data.project, data.db) == expected
    source_read.assert_not_awaited()
    data.db.commit.assert_not_awaited()
    query = str(data.db.execute.call_args.args[0].compile(compile_kwargs={"literal_binds": True}))
    assert "performance_project_node_snapshots.project_id = 3" in query


@pytest.mark.asyncio
async def test_employee_reads_effective_result_without_rereading_mutable_final(decision_runtime, monkeypatch):
    data = decision_runtime
    data.appeal.closed_at = datetime.now(UTC)
    data.appeal.effective_result = effective_result(data.appeal.result_snapshot, {"rating-1": "B", "keep_result": "change"})
    data.db.scalar = AsyncMock(side_effect=[data.appeal, SimpleNamespace(id=22)])
    data.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [])))
    monkeypatch.setattr(data.router, "_get_project", AsyncMock(return_value=data.project))
    monkeypatch.setattr(data.router, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E001")))
    source = AsyncMock(side_effect=AssertionError("must not read final"))
    monkeypatch.setattr(data.router, "_published_employee_result", source)
    result = await data.router.read_my_project_results(3, data.context, data.db)
    assert result["results"][0]["option_id"] == "B"
    source.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "withdraw", "submit"])
async def test_closed_appeal_locks_employee_mutations(decision_runtime, monkeypatch, action):
    data = decision_runtime
    data.appeal.closed_at = datetime.now(UTC)
    data.appeal.submitted_at = data.appeal.closed_at
    data.appeal.withdrawn_at = None
    monkeypatch.setattr(data.service, "submission_context", AsyncMock(return_value=(data.project, None, None, None, data.node, data.appeal)))
    with pytest.raises(HTTPException, match="RECONSIDERATION_CLOSED"):
        if action == "edit":
            await data.service.edit_reconsideration(data.db, 3, "E001", "修改", 1, data.context)
        elif action == "withdraw":
            await data.service.withdraw_reconsideration(data.db, 3, "E001", 1, data.context)
        else:
            await data.service.submit_reconsideration(data.db, 3, "E001", "重发", data.context)
    status = data.service._status(data.project, data.node, data.appeal)
    assert not status["can_edit"] and not status["can_withdraw"] and not status["can_submit"]
    data.db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_http_draft_submit_reopen_result_and_closed_rejection(decision_runtime, monkeypatch):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    data = decision_runtime
    app = FastAPI()
    app.include_router(data.router.router)
    app.dependency_overrides[data.router.get_session] = lambda: data.db
    app.dependency_overrides[data.router.get_performance_access_context] = lambda: data.context
    monkeypatch.setattr(data.router, "_get_project", AsyncMock(return_value=data.project))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        url = "/performance/tasks/8/template-task"
        draft = await client.patch(url + "/draft", json={"answers": {"rating-1": "B", "keep_result": "change"}, "version": 1})
        assert draft.status_code == 200 and draft.json()["version"] == 2
        submitted = await client.post(url + "/submit", json={"answers": {"keep_result": "change"}, "version": 2})
        assert submitted.status_code == 200 and not submitted.json()["reconsideration_closed"]
        schema, answers = await data.router._task_visible_content(data.task, data.node, data.db)
        assert answers["rating-1"] == "B"
        from datetime import timedelta
        data.task.due_at = datetime.now(UTC) - timedelta(seconds=1)
        refused = await client.patch(url + "/draft", json={"answers": {"keep_result": "keep"}, "version": 3})
        assert refused.status_code == 409 and refused.json()["detail"] == "SUBMISSION_NOT_ALLOWED"
        data.db.scalar = AsyncMock(side_effect=[data.appeal, SimpleNamespace(id=22)])
        data.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [])))
        monkeypatch.setattr(data.router, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E001")))
        reopened = await client.get("/performance/workbench/projects/3/results")
        assert reopened.status_code == 200 and reopened.json()["contents"][0]["answers"]["rating-1"] == "B"


@pytest.mark.asyncio
async def test_freeze_published_result_uses_same_employee_result_projection(decision_runtime, monkeypatch):
    data = decision_runtime
    projection = AsyncMock(return_value=(_result(), SimpleNamespace(id=22, result_version={"1": 3}), 11, _template()["final"]))
    monkeypatch.setattr(data.router, "_published_employee_result", projection)
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot
    final = SimpleNamespace(id=2, node_type="evaluation", node_order=1,
        config={"template": {**_template()["final"], "include_final_result": True}})
    source = SimpleNamespace(id=1, project_id=data.project.id, cycle_ref=data.project.cycle_ref,
        member_snapshot_id=11, target_employee_no="E001", node_snapshot_id=2, task_kind="evaluation",
        status="completed", submitted_at=datetime.now(UTC), answers={"rating-1": "A"})
    async def execute(statement):
        entity = statement.column_descriptions[0]["entity"]
        assert entity in {PerformanceNodeTask, PerformanceProjectNodeSnapshot}
        rows = [final] if entity is PerformanceProjectNodeSnapshot else [source]
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))
    data.db.execute = AsyncMock(side_effect=execute)
    snapshot, member_snapshot_id = await data.service.freeze_published_result(data.db, data.project, "E001", data.node, data.context)
    projection.assert_awaited_once_with(data.project, "E001", data.context, data.db, lock=True)
    assert member_snapshot_id == 11 and snapshot["opening_id"] == 22
    assert snapshot["source_result"] == _result()
    assert snapshot["full_result_answers"] == {"rating-1": "A"}
    assert snapshot["full_result_source_task_ids"] == [1]


def test_result_migration_linear_nullable_legacy_and_protected_downgrade(monkeypatch):
    import importlib.util
    from pathlib import Path
    path = Path(__file__).parents[1] / "alembic/versions/0301_pm_reconsideration_result.py"
    spec = importlib.util.spec_from_file_location("pm_result_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0300_pm_reconsideration_lifecycle"
    columns, removed = [], []
    monkeypatch.setattr(migration.op, "add_column", lambda table, column: columns.append(column))
    monkeypatch.setattr(migration.op, "drop_column", lambda table, name: removed.append(name))
    migration.upgrade()
    assert len(columns) == 5 and all(column.nullable for column in columns)
    monkeypatch.setattr(migration.op, "get_bind", lambda: SimpleNamespace(execute=lambda query: SimpleNamespace(scalar=lambda: True)))
    with pytest.raises(RuntimeError, match="RECONSIDERATION_RESULT_HISTORY_EXISTS"):
        migration.downgrade()
    assert not removed
    monkeypatch.setattr(migration.op, "get_bind", lambda: SimpleNamespace(execute=lambda query: SimpleNamespace(scalar=lambda: False)))
    migration.downgrade()
    assert set(removed) == {column.name for column in columns}


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["draft", "submit", "discard"])
async def test_processed_reconsideration_rejects_writes_after_task_deadline(decision_runtime, action):
    from datetime import timedelta
    data = decision_runtime
    data.appeal.closed_at = datetime.now(UTC)
    data.task.due_at = datetime.now(UTC) - timedelta(seconds=1)
    with pytest.raises(HTTPException, match="SUBMISSION_NOT_ALLOWED"):
        if action == "discard":
            await data.router._discard_task_draft(8, data.router.TaskDraftVersionPayload(version=1), data.context, data.db, "evaluation", None)
        else:
            await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "keep"}, version=1), action == "submit", data.context, data.db, "evaluation")
    data.db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_read_only_task_authorization_cannot_submit_reconsideration(decision_runtime, monkeypatch):
    data = decision_runtime
    monkeypatch.setattr(data.router, "_task_edit_allowed", AsyncMock(return_value=False))
    with pytest.raises(HTTPException, match="TASK_AUTHORIZATION_READ_ONLY"):
        await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "keep"}, version=1), True, data.context, data.db, "evaluation")
    data.db.commit.assert_not_called()


def test_adjustments_preserve_repeated_instances_clears_and_rating_options():
    from app.performance.reconsideration_result_service import result_adjustments, submitted_answers
    snapshot = _rich_snapshot(repeated=True)
    answers = {"rating-1": ["B", ""], "text-1": ["first", ""]}
    changes = result_adjustments(snapshot["form_schema"], snapshot["answers"], answers)
    rating = [row for row in changes if row["field_id"] == "rating-1"]
    assert [(row["instance_index"], row["before"], row["after"]) for row in rating] == [(0, "A", "B"), (1, "B", "")]
    assert rating[0]["options"] == [{"id": "A", "label": "优秀"}, {"id": "B", "label": "良好"}]
    assert submitted_answers(snapshot, answers)["text-1"] == ["first", ""]
    result = effective_result(snapshot, {"keep_result": "change", "rating-1": ["B", "A"], "text-1": ["one", "two"]})
    assert [(item["option_id"], item["instance_index"]) for item in result["results"]] == [("B", 0), ("A", 1)]


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_ref,allowed,expected_task", [("H2", True, 9), ("ADMIN", False, None), ("READONLY", False, None)])
async def test_detail_uses_actual_submitter_history_and_only_own_edit_task(decision_runtime, monkeypatch, actor_ref, allowed, expected_task):
    from app.performance import member_reminders
    from app.performance.models import PerformanceAuditEvent
    data = decision_runtime
    data.appeal.closed_at = datetime.now(UTC)
    data.appeal.closed_by_ref = "ACTUAL"
    data.task.answers = data.other.answers = {"keep_result": "change", "rating-1": "B"}
    data.task.submitted_at = data.other.submitted_at = data.appeal.closed_at
    data.task.status = data.other.status = "completed"
    member = SimpleNamespace(snapshot_id=11, employee_no="E001")
    options = [SimpleNamespace(task_id=task.id, role_key="REAL_LINE_MANAGER", role_label="直属上级") for task in [data.task, data.other]]
    people = {no: SimpleNamespace(display_name=name) for no, name in [("H1", "协作一"), ("H2", "协作二"), ("ACTUAL", "真实提交者")]}
    from datetime import timedelta
    older = PerformanceAuditEvent(id=1, event_at=data.appeal.closed_at - timedelta(hours=1), actor_type="EMPLOYEE", actor_ref="H1",
        before_state={"answers": {"rating-1": "B"}}, after_state={"answers": {"rating-1": "A"}})
    same_time = PerformanceAuditEvent(id=2, event_at=data.appeal.closed_at, actor_type="EMPLOYEE", actor_ref="H2",
        before_state={"answers": {"rating-1": "A"}}, after_state={"answers": {"rating-1": "A"}})
    event = PerformanceAuditEvent(id=3, event_at=data.appeal.closed_at, actor_type="EMPLOYEE", actor_ref="ACTUAL",
        before_state={"answers": {"rating-1": "A"}}, after_state={"answers": data.task.answers})
    data.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [older, same_time, event])))
    monkeypatch.setattr(data.router, "_member_task_options", AsyncMock(return_value=options))
    monkeypatch.setattr(data.router, "_delegation_snapshot_people", AsyncMock(return_value=people))
    monkeypatch.setattr(data.router, "_task_handlers", AsyncMock(side_effect=lambda db, task: {task.handler_ref}))
    monkeypatch.setattr(data.router, "_task_edit_allowed", AsyncMock(side_effect=lambda db, task, actor: allowed and task.handler_ref == actor))
    monkeypatch.setattr(member_reminders, "can_remind_member", AsyncMock(return_value=False))
    detail, _ = await data.router._reconsideration_detail(data.project, member, data.node, [data.task, data.other], data.context,
        SimpleNamespace(actor_type="EMPLOYEE", actor_ref=actor_ref), data.db)
    assert detail["status"] == "submitted_editable"
    assert detail["can_edit"] is allowed and detail["edit_task_id"] == expected_task
    assert detail["submitted_by"] == "真实提交者"
    assert detail["submitted_at"] == data.appeal.closed_at.isoformat()
    assert [item["display_name"] for item in detail["history"]] == ["真实提交者", "协作二", "协作一"]
    assert detail["history"][0]["display_name"] == "真实提交者"
    assert detail["history"][0]["adjustments"][0]["after"] == "B"
    assert all(handler["role_label"] == "直属上级" for handler in detail["handlers"])
    assert detail["answers"]["rating-1"] == "B"


@pytest.mark.asyncio
async def test_reconsideration_drawer_reuses_member_tabs_and_keeps_edit_schema(decision_runtime, monkeypatch):
    data = decision_runtime
    member = SimpleNamespace(id=21, snapshot_id=11, employee_no="E001", display_name="员工")
    data.db.scalar = AsyncMock(return_value=member)
    detail = {"reason": "核对事实", "can_edit": True, "edit_task_id": 8,
        "submitted_by": "实际处理人", "submitted_at": "2026-11-15T10:00:00+00:00"}
    tabs = [{"node_id": "appeal", "key": "management-appeal", "reconsideration": detail}]
    management = AsyncMock(return_value={"management_tabs": tabs, "default_active_tab": "management-appeal",
        "stage_views": [], "root_review_id": 21})
    monkeypatch.setattr(data.router, "_project_member_detail", management)
    monkeypatch.setattr(data.router, "_snapshot_supervisor_names", AsyncMock(return_value={}))
    monkeypatch.setattr(data.router, "resolve_subject_visibility_role", AsyncMock(return_value="other"))
    monkeypatch.setattr(data.router, "load_subject_visibility_rules", AsyncMock(return_value={"other": []}))
    monkeypatch.setattr(data.router, "_reference_tabs", AsyncMock(return_value=[]))
    result = await data.router._template_task_detail(data.task, data.node, data.context, data.db, view="drawer")
    assert result["return_view"] == "drawer" and result["default_active_tab"] == "management-appeal"
    assert result["reconsideration"] == detail and result["management_tabs"] == tabs
    assert result["form_schema"][0]["fields"][0]["readonly"] is False
    assert result["answer_submissions"][0]["display_name"] == "实际处理人"
    assert management.await_args.kwargs["skip_scope"] is True
    assert management.await_args.kwargs["source_task_id"] == 8


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["readonly", "other_employee", "other_snapshot", "expired", "withdrawn"])
async def test_reconsideration_reminder_source_is_scoped_and_deadline_bound(decision_runtime, monkeypatch, invalid):
    from datetime import timedelta
    from app.performance import member_reminders
    data = decision_runtime
    from app.performance.models import PerformanceNodeTaskAuthorization, PerformanceProjectNodeSnapshot
    data.project.status = "STARTED"
    source = data.task
    source.handler_ref = "H1"
    source.available_at = None
    source.due_at = datetime.now(UTC) + timedelta(days=1)
    data.db.get = AsyncMock(side_effect=lambda model, key: data.node if model is PerformanceProjectNodeSnapshot else source)
    grants = []
    if invalid == "readonly":
        source.handler_ref = "OTHER"
        grants = [PerformanceNodeTaskAuthorization(recipient_employee_no="H1", read_only=True, authorization_type="AUTHORIZE")]
    elif invalid == "other_employee":
        source.target_employee_no = "OTHER"
    elif invalid == "other_snapshot":
        source.project_id = 99
    elif invalid == "expired":
        source.due_at = datetime.now(UTC) - timedelta(seconds=1)
    else:
        monkeypatch.setattr(data.service, "reconsideration_for_task", AsyncMock(side_effect=HTTPException(404, "TASK_NOT_FOUND")))
    data.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: grants)))
    with pytest.raises(HTTPException, match="PROJECT_MEMBER_REMIND_FORBIDDEN"):
        await member_reminders._member_scope(data.project, "E001", data.context, data.db, source_task_id=8)
    data.db.commit.assert_not_called()
