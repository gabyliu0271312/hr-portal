from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.performance.result_service import resolve_effective_result
from app.performance.self_summary_service import build_self_summary_schema


NOW = datetime(2026, 11, 11, tzinfo=UTC)


def _template(*, calibration=False):
    items = [
        {"id": "rating", "kind": "rating", "options": [{"id": "A"}, {"id": "B"}]},
        {"id": "text", "kind": "fill"},
        {"id": "locked", "kind": "fill", "settings": {"mode": "view"} if calibration else {}},
        {"id": "internal", "kind": "fill", "settings": {"mode": "hidden"} if calibration else {"allowView": False}},
    ]
    return {"include_final_result": not calibration, "content": [
        {"id": "result", "type": "custom", "items": items}
    ]}


def _nodes():
    return [
        SimpleNamespace(id=10, node_type="evaluation", node_order=1, config={"template": _template()}),
        SimpleNamespace(id=20, node_type="calibration", node_order=2, config={
            "template": _template(calibration=True), "calibration": {"phases": [
                {"phase_id": "p2"}, {"phase_id": "p1"}
            ]}
        }),
        SimpleNamespace(id=30, node_type="calibration", node_order=3, config={
            "template": _template(calibration=True), "calibration": {"phases": [{"phase_id": "last"}]}
        }),
    ]


def _task(task_id=1, *, node=10, phase="", kind="evaluation", answers=None, **kwargs):
    values = {"id": task_id, "node_snapshot_id": node, "task_kind": kind, "phase_id": phase,
              "status": "completed", "submitted_at": NOW, "revoked_at": None,
              "answers": {"rating": "A", "locked": "base", "internal": "secret"} if answers is None else answers,
              "draft_answers": {"rating": "B"}}
    return SimpleNamespace(**{**values, **kwargs})


def _calibration(task_id=2, phase="p2", *, node=20, answers=None, **kwargs):
    return _task(task_id, node=node, phase=phase, kind="calibration",
                 answers={"rating": "B"} if answers is None else answers, **kwargs)


def _appeal(*, full=False):
    schema = build_self_summary_schema(_template(calibration=True))
    contents = [{"task_id": 1, "form_schema": deepcopy(schema),
                 "answers": {"rating": "A", "locked": "frozen-visible"}}]
    snapshot = {"form_schema": schema, "source_result": {"contents": contents},
                "answers": {"rating": "A", "locked": "frozen-visible"}}
    if full:
        snapshot.update(full_result_answers={"rating": "A", "locked": "frozen-visible", "internal": "frozen-secret"},
                        full_result_source_task_ids=[1])
    return SimpleNamespace(closed_at=NOW, withdrawn_at=None, node_snapshot_id=40,
                           result_snapshot=snapshot, effective_result=None)


def _decision(*, answers=None, **kwargs):
    return _task(4, node=40, kind="result_reconsideration",
                 answers={"keep_result": "change", "rating": "B"} if answers is None else answers, **kwargs)


def _assert_conflict(nodes, tasks, **kwargs):
    with pytest.raises(HTTPException) as exc:
        resolve_effective_result(nodes, tasks, **kwargs)
    assert exc.value.status_code == 409
    assert exc.value.detail == "CALIBRATION_SOURCE_CONFLICT"


@pytest.mark.parametrize("tasks", [[], [_task(status="pending")], [_task(submitted_at=None)],
                                    [_task(revoked_at=NOW)], [_task(answers={})]])
def test_empty_and_unsubmitted_final_are_empty_without_reading_drafts(tasks):
    result = resolve_effective_result(_nodes(), tasks)
    assert result["answers"] == {}
    assert result["calibrated"] is False
    if not tasks or not tasks[0].status == "completed" or tasks[0].submitted_at is None or tasks[0].revoked_at:
        assert result["source_task"] is None
        assert result["source_kind"] is None
        assert result["source_tasks"] == []


def test_final_preserves_internal_fields_but_discards_unknown_keys():
    nodes = _nodes()
    nodes[0].config["template"]["content"][0]["items"][-1]["settings"]["mode"] = "hidden"
    task = _task(answers={"rating": "A", "internal": {"raw": ["secret"]}, "unknown": "drop"})
    original = deepcopy(task.answers)
    result = resolve_effective_result(nodes, [task])
    assert result["answers"] == {"rating": "A", "internal": {"raw": ["secret"]}}
    assert result["source_task"] is task
    result["answers"]["internal"]["raw"].append("new")
    assert task.answers == original
    assert nodes[0].config["template"]["content"][0]["items"][-1]["settings"]["mode"] == "hidden"


def test_multiple_equal_final_tasks_do_not_lose_submission_metadata():
    first, second = _task(), _task(2)
    result = resolve_effective_result(_nodes(), [first, second])
    assert result["answers"]["rating"] == "A"
    assert result["source_tasks"] == [first, second]


def test_conflicting_final_tasks_never_choose_latest_id_or_time():
    _assert_conflict(_nodes(), [_task(), _task(999, answers={"rating": "B"})])


def test_one_unique_final_node_is_required():
    nodes = _nodes()
    _assert_conflict(nodes[1:], [])
    nodes[1].config["template"]["include_final_result"] = True
    _assert_conflict(nodes, [])


def test_calibration_order_is_frozen_node_and_phase_order_not_task_id_or_time():
    tasks = [_task(), _calibration(999, "p2", answers={"rating": "B", "text": "first"}),
             _calibration(2, "p1", answers={"rating": "A"}),
             _calibration(3, "last", node=30, answers={"text": "last"})]
    result = resolve_effective_result(list(reversed(_nodes())), list(reversed(tasks)))
    assert result["answers"] == {"rating": "A", "text": "last", "locked": "base", "internal": "secret"}
    assert result["source_task"] is tasks[-1]
    assert result["source_kind"] == "calibration"
    assert result["calibrated"] is True
    assert result["source_tasks"] == tasks


def test_unfinished_or_revoked_calibrations_do_not_block_later_submissions():
    tasks = [_task(), _calibration(status="pending"), _calibration(3, "p2", submitted_at=None),
             _calibration(4, "p2", revoked_at=NOW), _calibration(5, "p1", answers={"rating": "B"})]
    result = resolve_effective_result(_nodes(), tasks)
    assert result["answers"]["rating"] == "B"
    assert result["source_tasks"] == [tasks[0], tasks[-1]]


def test_same_phase_conflict_is_not_resolved_by_task_id():
    _assert_conflict(_nodes(), [_task(), _calibration(), _calibration(999, answers={"rating": "A"})])


def test_same_phase_omitted_keys_are_not_competing_updates():
    tasks = [_task(), _calibration(2, answers={"rating": "B"}),
             _calibration(3, answers={"text": "addition"}), _calibration(4, answers={})]
    result = resolve_effective_result(_nodes(), tasks)
    assert result["answers"] == {"rating": "B", "text": "addition", "locked": "base", "internal": "secret"}
    assert result["source_tasks"] == tasks


def test_same_phase_readonly_hidden_and_unknown_values_cannot_override():
    tasks = [_task(), _calibration(2, answers={"rating": "B", "locked": "evil", "internal": "evil", "unknown": "evil"}),
             _calibration(3, answers={"rating": "B", "locked": "different"})]
    result = resolve_effective_result(_nodes(), tasks)
    assert result["answers"] == {"rating": "B", "locked": "base", "internal": "secret"}
    assert result["source_tasks"] == tasks
    assert tasks[1].answers["internal"] == "evil"


@pytest.mark.parametrize("value", [None, ""])
def test_explicit_clearing_is_preserved_for_rating_and_text(value):
    tasks = [_task(answers={"rating": "A", "text": "base"}),
             _calibration(answers={"rating": value, "text": value})]
    assert resolve_effective_result(_nodes(), tasks)["answers"] == {"rating": value, "text": value}


def test_empty_calibration_is_still_formally_calibrated_and_omissions_do_not_erase():
    final, calibration = _task(), _calibration(answers={})
    result = resolve_effective_result(_nodes(), [final, calibration])
    assert result["calibrated"] is True
    assert result["answers"] == final.answers
    assert result["source_task"] is calibration
    assert result["source_kind"] == "calibration"


def test_calibration_can_submit_against_an_empty_final_baseline():
    result = resolve_effective_result(_nodes(), [_calibration()])
    assert result["answers"] == {"rating": "B"}
    assert result["calibrated"] is True


@pytest.mark.parametrize("cutoff,expected,calibrated", [
    ((20, "p2"), "A", False), ((20, "p1"), "B", True), ((30, "last"), "A", True),
])
def test_before_calibration_excludes_current_and_later_phases_and_appeal(cutoff, expected, calibrated):
    tasks = [_task(), _calibration(), _calibration(3, "p1", answers={"rating": "A"}),
             _calibration(5, "last", node=30), _decision()]
    result = resolve_effective_result(_nodes(), tasks, _appeal(full=True), before_calibration=cutoff)
    assert result["answers"]["rating"] == expected
    assert result["calibrated"] is calibrated
    assert result["source_kind"] != "result_reconsideration"


def test_before_calibration_does_not_inspect_conflicting_future_tasks():
    tasks = [_task(), _calibration(), _calibration(3, answers={"rating": "A"})]
    assert resolve_effective_result(_nodes(), tasks, before_calibration=(20, "p2"))["answers"]["rating"] == "A"
    _assert_conflict(_nodes(), tasks, before_calibration=("wrong-id", "p2"))


@pytest.mark.parametrize("mutation", ["section", "type", "options", "repeat", "field"])
def test_incompatible_calibration_projection_conflicts(mutation):
    nodes = _nodes()
    content = nodes[1].config["template"]["content"][0]
    if mutation == "section":
        content["id"] = "other"
    elif mutation == "type":
        content["items"][0]["kind"] = "fill"
    elif mutation == "options":
        content["items"][0]["options"] = [{"id": "C"}]
    elif mutation == "repeat":
        content["settings"] = {"allowMultiple": True}
    else:
        content["items"][0]["id"] = "other"
    _assert_conflict(nodes, [_task(), _calibration()])


@pytest.mark.parametrize("full", [False, True])
def test_closed_reconsideration_change_keeps_internal_and_readonly_baseline(full):
    appeal = _appeal(full=full)
    appeal.effective_result = {"answers": {"internal": "envelope-is-not-answers"}, "contents": [
        {"form_schema": appeal.result_snapshot["form_schema"],
         "answers": {"rating": "B", "locked": "attempt", "internal": "attempt", "unknown": "attempt"}}
    ]}
    tasks = [_task(answers={"rating": "B", "locked": "current", "internal": "current-secret"}),
             _decision(answers={"keep_result": "change", "rating": "B", "locked": "attempt", "internal": "attempt"})]
    original = deepcopy(appeal.result_snapshot)
    result = resolve_effective_result(_nodes(), tasks, appeal)
    assert result["answers"] == {"rating": "B", "locked": "frozen-visible",
                                 "internal": "frozen-secret" if full else "current-secret"}
    assert result["source_kind"] == "result_reconsideration"
    assert result["source_task"] is tasks[-1]
    assert result["source_tasks"] == tasks
    assert appeal.result_snapshot == original


@pytest.mark.parametrize("full", [False, True])
def test_keep_result_preserves_frozen_values_even_if_task_or_effective_values_differ(full):
    appeal = _appeal(full=full)
    appeal.effective_result = {"contents": [{"form_schema": appeal.result_snapshot["form_schema"],
                                           "answers": {"rating": "B"}}]}
    result = resolve_effective_result(_nodes(), [_task(), _decision(answers={"keep_result": "keep", "rating": "B"})], appeal)
    assert result["answers"]["rating"] == "A"
    assert result["answers"]["locked"] == "frozen-visible"
    assert result["answers"]["internal"] == ("frozen-secret" if full else "secret")


def test_full_snapshot_ignores_later_mutation_of_original_source_answers():
    appeal = _appeal(full=True)
    result = resolve_effective_result(_nodes(), [_task(answers={"rating": "B"}), _decision()], appeal)
    assert result["answers"] == {"rating": "B", "locked": "frozen-visible", "internal": "frozen-secret"}


@pytest.mark.parametrize("value", [None, ""])
def test_reconsideration_explicit_clearing_survives_projection(value):
    result = resolve_effective_result(_nodes(), [_task(), _decision(answers={"keep_result": "change", "rating": value})], _appeal(full=True))
    assert result["answers"]["rating"] is value


def test_closed_legacy_effective_contents_without_decision_task_are_usable():
    appeal = _appeal()
    appeal.effective_result = {"contents": [{"form_schema": appeal.result_snapshot["form_schema"], "answers": {"rating": "B"}}]}
    result = resolve_effective_result(_nodes(), [_task()], appeal)
    assert result["answers"] == {"rating": "B", "locked": "frozen-visible", "internal": "secret"}
    assert result["source_kind"] == "result_reconsideration"


@pytest.mark.parametrize("changes", [{"closed_at": None}, {"withdrawn_at": NOW}])
def test_unclosed_or_withdrawn_appeal_is_ignored(changes):
    appeal = _appeal(full=True)
    for key, value in changes.items():
        setattr(appeal, key, value)
    final = _task()
    result = resolve_effective_result(_nodes(), [final, _decision()], appeal)
    assert result["answers"] == final.answers
    assert result["source_kind"] == "evaluation"


@pytest.mark.parametrize("changes", [{"status": "pending"}, {"submitted_at": None}, {"revoked_at": NOW}])
def test_unsubmitted_or_revoked_reconsideration_task_is_not_a_source(changes):
    result = resolve_effective_result(_nodes(), [_task(), _decision(**changes)], _appeal(full=True))
    assert result["answers"]["rating"] == "A"
    assert [task.id for task in result["source_tasks"]] == [1]


def test_reconsideration_disagreement_conflicts_instead_of_choosing_arbitrary_answers():
    _assert_conflict(_nodes(), [_task(), _decision(), _task(5, node=40, kind="result_reconsideration", answers={"keep_result": "change", "rating": "A"})], appeal=_appeal(full=True))


def test_empty_full_frozen_snapshot_is_authoritative_not_a_fallback_signal():
    appeal = _appeal(full=True)
    appeal.result_snapshot["full_result_answers"] = {}
    result = resolve_effective_result(_nodes(), [_task(), _decision(answers={"keep_result": "keep"})], appeal)
    assert result["answers"] == {}
    assert result["source_kind"] == "result_reconsideration"


def test_full_frozen_source_ids_preserve_real_submission_tasks_not_later_changes():
    appeal = _appeal(full=True)
    tasks = [_task(), _calibration(), _decision()]
    result = resolve_effective_result(_nodes(), tasks, appeal)
    assert result["answers"]["internal"] == "frozen-secret"
    assert [task.id for task in result["source_tasks"]] == [1, 4]
    assert result["calibrated"] is True


def test_closed_appeal_does_not_trust_top_level_employee_response_answers():
    appeal = _appeal(full=True)
    appeal.effective_result = {"answers": {"rating": "B", "internal": "leak"},
                              "results": [{"field_id": "rating", "option_id": "B"}]}
    result = resolve_effective_result(_nodes(), [_task()], appeal)
    assert result["answers"] == appeal.result_snapshot["full_result_answers"]


def test_reconsideration_schema_conflicts_remain_explicit():
    appeal = _appeal(full=True)
    appeal.result_snapshot["form_schema"][0]["allow_multiple"] = True
    _assert_conflict(_nodes(), [_task(), _decision()], appeal=appeal)


def test_effective_contents_cannot_silently_disagree_with_submitted_decision():
    appeal = _appeal(full=True)
    appeal.effective_result = {"contents": [{"form_schema": appeal.result_snapshot["form_schema"],
                                           "answers": {"rating": "A"}}]}
    _assert_conflict(_nodes(), [_task(), _decision()], appeal=appeal)


def test_closed_change_ignores_public_communication_fields_without_expanding_final_result():
    appeal = _appeal(full=True)
    communication = build_self_summary_schema({"content": [{
        "id": "communication", "type": "custom", "items": [{"id": "communication-note", "kind": "fill"}],
    }]})
    schema = deepcopy(appeal.result_snapshot["form_schema"]) + communication
    appeal.effective_result = {"contents": [{"form_schema": schema, "answers": {
        "rating": "B", "communication-note": "public feedback", "locked": "attempt",
    }}]}
    original = deepcopy(appeal.effective_result)
    result = resolve_effective_result(_nodes(), [_task(), _decision()], appeal)
    assert result["answers"] == {"rating": "B", "locked": "frozen-visible", "internal": "frozen-secret"}
    assert appeal.effective_result == original


@pytest.mark.parametrize("mutation", ["section", "type", "options"])
def test_closed_change_still_rejects_incompatible_writable_fields_with_communication(mutation):
    appeal = _appeal(full=True)
    schema = deepcopy(appeal.result_snapshot["form_schema"])
    if mutation == "section":
        schema[0]["id"] = "communication"
    elif mutation == "type":
        schema[0]["fields"][0]["type"] = "rich_text"
    else:
        schema[0]["fields"][0]["options"] = [{"id": "C"}]
    appeal.effective_result = {"contents": [{"form_schema": schema, "answers": {"rating": "B"}}]}
    _assert_conflict(_nodes(), [_task(), _decision()], appeal=appeal)


def test_saved_calibration_preserves_missing_readonly_baseline_without_overwriting_existing_value():
    final = _task(answers={"rating": "A"})
    calibration = _calibration(answers={"rating": "B", "locked": "frozen-readonly"})
    assert resolve_effective_result(_nodes(), [final, calibration])["answers"] == {
        "rating": "B", "locked": "frozen-readonly"}
    final.answers["locked"] = "authoritative"
    assert resolve_effective_result(_nodes(), [final, calibration])["answers"]["locked"] == "authoritative"


def test_dictionary_inputs_have_same_contract():
    nodes = [vars(node) for node in _nodes()]
    tasks = [vars(_task()), vars(_calibration())]
    result = resolve_effective_result(nodes, tasks)
    assert result["answers"] == {"rating": "B", "locked": "base", "internal": "secret"}
    assert result["source_task"] is tasks[-1]
