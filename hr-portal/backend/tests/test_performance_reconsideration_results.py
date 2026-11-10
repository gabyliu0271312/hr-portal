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
async def test_runtime_draft_change_close_and_reject_further_writes(decision_runtime):
    data = decision_runtime
    payload = data.router.SelfSummaryAnswersPayload(answers={"rating-1": "B", "keep_result": "change"}, version=1)
    draft = await data.router._save_self_summary(8, payload, False, data.context, data.db, "evaluation")
    assert draft["version"] == 2 and data.other.draft_answers["rating-1"] == "B"
    assert data.appeal.closed_at is None
    submitted = await data.router._save_self_summary(8, data.router.SelfSummaryAnswersPayload(answers={"keep_result": "change"}, version=2), True, data.context, data.db, "evaluation")
    assert submitted["reconsideration_closed"] and not submitted["editable"] and not submitted["submit_allowed"]
    assert data.appeal.effective_result["contents"][0]["answers"]["rating-1"] == "B"
    assert data.other.status == "completed" and data.other.answer_version == 3
    assert data.appeal.result_snapshot["answers"]["rating-1"] == "A"
    assert data.events[-1].event_type == "PERFORMANCE_RECONSIDERATION_CLOSED"
    with pytest.raises(HTTPException, match="RECONSIDERATION_CLOSED"):
        await data.router._save_self_summary(8, payload, True, data.context, data.db, "evaluation")
    with pytest.raises(HTTPException, match="RECONSIDERATION_CLOSED"):
        await data.router._discard_task_draft(8, data.router.TaskDraftVersionPayload(version=3), data.context, data.db, "evaluation", None)


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
async def test_employee_reads_effective_result_without_rereading_mutable_final(decision_runtime, monkeypatch):
    data = decision_runtime
    data.appeal.closed_at = datetime.now(UTC)
    data.appeal.effective_result = effective_result(data.appeal.result_snapshot, {"rating-1": "B", "keep_result": "change"})
    data.db.scalar = AsyncMock(side_effect=[data.appeal, SimpleNamespace(id=22)])
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
        assert submitted.status_code == 200 and submitted.json()["reconsideration_closed"]
        schema, answers = await data.router._task_visible_content(data.task, data.node, data.db)
        assert answers["rating-1"] == "B"
        refused = await client.patch(url + "/draft", json={"answers": {"keep_result": "keep"}, "version": 3})
        assert refused.status_code == 409 and refused.json()["detail"] == "RECONSIDERATION_CLOSED"
        data.db.scalar = AsyncMock(side_effect=[data.appeal, SimpleNamespace(id=22)])
        monkeypatch.setattr(data.router, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E001")))
        reopened = await client.get("/performance/workbench/projects/3/results")
        assert reopened.status_code == 200 and reopened.json()["contents"][0]["answers"]["rating-1"] == "B"


@pytest.mark.asyncio
async def test_freeze_published_result_uses_same_employee_result_projection(decision_runtime, monkeypatch):
    data = decision_runtime
    projection = AsyncMock(return_value=(_result(), SimpleNamespace(id=22, result_version={"1": 3}), 11, _template()["final"]))
    monkeypatch.setattr(data.router, "_published_employee_result", projection)
    snapshot, member_snapshot_id = await data.service.freeze_published_result(data.db, data.project, "E001", data.node, data.context)
    projection.assert_awaited_once_with(data.project, "E001", data.context, data.db, lock=True)
    assert member_snapshot_id == 11 and snapshot["opening_id"] == 22
    assert snapshot["source_result"] == _result()


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
