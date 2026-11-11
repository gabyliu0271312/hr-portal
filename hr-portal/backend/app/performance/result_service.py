"""Resolve submitted performance results without database access or mutations."""
from copy import deepcopy

from fastapi import HTTPException

from app.performance.self_summary_service import build_self_summary_schema, project_self_summary_answers


def _get(value, key, default=None):
    return value.get(key, default) if isinstance(value, dict) else getattr(value, key, default)


def _conflict():
    raise HTTPException(409, "CALIBRATION_SOURCE_CONFLICT")


def _submitted(task):
    return (_get(task, "revoked_at") is None and _get(task, "status") == "completed"
            and _get(task, "submitted_at") is not None)


def _fields(schema):
    result = {}
    for section in schema:
        for field in section.get("fields") or []:
            if field["id"] in result:
                _conflict()
            result[field["id"]] = (section, field)
    return result


def _compatible(schema, source_schema):
    source = _fields(source_schema)
    for key, (section, field) in _fields(schema).items():
        if key not in source:
            _conflict()
        other_section, other = source[key]
        if (section["id"] != other_section["id"]
                or bool(section.get("allow_multiple")) != bool(other_section.get("allow_multiple"))
                or any(field.get(name) != other.get(name) for name in ("type", "allow_unknown"))
                or {str(option["id"]) for option in field.get("options") or []}
                != {str(option["id"]) for option in other.get("options") or []}):
            _conflict()


def _project(schema, answers, *, writable=False):
    answers = answers or {}
    projected = project_self_summary_answers(schema, answers, include_readonly=not writable)
    for key, (_, field) in _fields(schema).items():
        if key in answers and (not writable or not field.get("readonly")) and answers[key] in (None, ""):
            projected[key] = answers[key]
    return deepcopy(projected)


def _consensus(values):
    if not values:
        return {}
    if any(value != values[0] for value in values[1:]):
        _conflict()
    return deepcopy(values[0])


def _merge_partial(values):
    merged = {}
    for value in values:
        for key, candidate in value.items():
            if key in merged and merged[key] != candidate:
                _conflict()
            merged[key] = deepcopy(candidate)
    return merged


def _contents_answers(result, full_schema, *, allowed_schema=None):
    values = []
    for content in (result or {}).get("contents") or []:
        schema = content.get("form_schema") or []
        _compatible(schema, full_schema)
        if allowed_schema is not None:
            allowed = _fields(allowed_schema)
            schema = [{**section, "fields": [field for field in section.get("fields") or []
                       if field["id"] in allowed and not allowed[field["id"]][1].get("readonly")]}
                      for section in schema]
        values.append(_project(schema, content.get("answers")))
    return _consensus(values)


def _unique_tasks(tasks):
    result = []
    seen = set()
    for task in tasks:
        key = _get(task, "id")
        if key not in seen:
            seen.add(key)
            result.append(task)
    return result


def resolve_effective_result(nodes, tasks, appeal=None, *, before_calibration=None) -> dict:
    nodes = sorted(nodes, key=lambda node: _get(node, "node_order", 0))
    tasks = [task for task in tasks if _get(task, "revoked_at") is None]
    finals = [node for node in nodes if ((_get(node, "config") or {}).get("template") or {}).get("include_final_result")]
    if len(finals) != 1:
        _conflict()
    final = finals[0]
    full_template = deepcopy((_get(final, "config") or {}).get("template") or {})
    for content in full_template.get("content") or []:
        for item in content.get("items") or []:
            (item.get("settings") or {}).pop("mode", None)
    full_schema = build_self_summary_schema(full_template)
    final_fields = _fields(full_schema)
    closed = (before_calibration is None and appeal is not None and _get(appeal, "closed_at") is not None
              and _get(appeal, "withdrawn_at") is None)
    snapshot = (_get(appeal, "result_snapshot") or {}) if closed else {}
    frozen = snapshot.get("full_result_answers")
    has_frozen = isinstance(frozen, dict)
    sources = [task for task in tasks if _get(task, "node_snapshot_id") == _get(final, "id")
               and _get(task, "task_kind") == _get(final, "node_type") and _submitted(task)]
    answers = ({key: deepcopy(value) for key, value in frozen.items() if key in final_fields} if has_frozen else
               _consensus([{key: deepcopy(value) for key, value in (_get(task, "answers") or {}).items()
                            if key in final_fields} for task in sources]))
    source_task = sources[0] if sources else None
    source_kind = "evaluation" if sources else None
    source_tasks = list(sources)
    calibrated = False
    cutoff_found = before_calibration is None
    for node in nodes:
        if _get(node, "node_type") != "calibration":
            continue
        config = _get(node, "config") or {}
        schema = build_self_summary_schema(config.get("template") or {})
        phases = (config.get("calibration") or {}).get("phases") or []
        for phase in phases:
            if before_calibration == (_get(node, "id"), phase.get("phase_id")):
                cutoff_found = True
                break
            submitted = [task for task in tasks if _get(task, "node_snapshot_id") == _get(node, "id")
                         and _get(task, "task_kind") == "calibration"
                         and _get(task, "phase_id") == phase.get("phase_id") and _submitted(task)]
            if not submitted:
                continue
            _compatible(schema, full_schema)
            if not has_frozen:
                readonly = {key for key, (_, field) in _fields(schema).items() if field.get("readonly") and key not in answers}
                baseline = _merge_partial([{key: value for key, value in _project(schema, _get(task, "answers")).items() if key in readonly} for task in submitted])
                answers.update(baseline)
                answers.update(_merge_partial([_project(schema, _get(task, "answers"), writable=True) for task in submitted]))
            calibrated = True
            source_task, source_kind = submitted[0], "calibration"
            source_tasks.extend(submitted)
        if before_calibration is not None and cutoff_found:
            break
    if not cutoff_found:
        _conflict()
    if closed:
        decision_schema = snapshot.get("form_schema") or []
        _compatible(decision_schema, full_schema)
        if has_frozen:
            frozen_ids = {str(value) for value in snapshot.get("full_result_source_task_ids") or []}
            source_tasks = [task for task in tasks if str(_get(task, "id")) in frozen_ids and _submitted(task)]
        else:
            answers.update(_contents_answers(snapshot.get("source_result"), full_schema))
        decisions = [task for task in tasks if _get(task, "task_kind") == "result_reconsideration"
                     and _get(task, "node_snapshot_id") == _get(appeal, "node_snapshot_id") and _submitted(task)]
        choices = {_get(task, "answers", {}).get("keep_result") for task in decisions}
        if len(choices) > 1:
            _conflict()
        if choices != {"keep"}:
            effective = _get(appeal, "effective_result")
            patches = [_project(decision_schema, _get(task, "answers"), writable=True) for task in decisions]
            patch = _consensus(patches)
            if effective is not None:
                effective_patch = _contents_answers(effective, full_schema, allowed_schema=decision_schema)
                if any(key in effective_patch and value != effective_patch[key] for key, value in patch.items()):
                    _conflict()
                patch = {**effective_patch, **patch}
            answers.update(patch)
        source_tasks.extend(decisions)
        source_task = decisions[0] if decisions else (source_tasks[-1] if source_tasks else None)
        source_kind = "result_reconsideration"
    return {"answers": deepcopy(answers), "calibrated": calibrated, "source_task": source_task,
            "source_kind": source_kind, "source_tasks": _unique_tasks(source_tasks)}
