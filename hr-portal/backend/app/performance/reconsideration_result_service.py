"""Immutable employee-result snapshots and pure reconsideration decisions."""
from copy import deepcopy

from fastapi import HTTPException

from app.performance.calibration_service import calibration_template
from app.performance.self_summary_service import (
    build_self_summary_schema,
    iter_self_summary_field_instances,
    project_self_summary_answers,
    sanitize_self_summary_answers,
    self_summary_field_requires_value,
    self_summary_instance_unknown,
    self_summary_value_empty,
)


def _conflict():
    raise HTTPException(409, "RECONSIDERATION_SOURCE_CONFLICT")


def _invalid(field_id="keep_result"):
    raise HTTPException(400, {"code": "VALIDATION_FAILED", "field_id": field_id})


def _fields(schema):
    fields = {}
    for section in schema:
        for field in section.get("fields") or []:
            field_id = field["id"]
            if field_id in fields:
                _conflict()
            fields[field_id] = (section, field)
    return fields


def _signature(section, field):
    return (
        section["id"], field["id"], field["type"], bool(section.get("allow_multiple")),
        [(str(option["id"]), option.get("code"), option.get("label"), bool(option.get("required")))
         for option in field.get("options") or []],
        bool(field.get("allow_unknown")),
    )


def _projection(schema):
    return {key: _signature(*pair) for key, pair in _fields(schema).items()}


def _decision_schema(source_schema, template):
    final = deepcopy(template["final"])
    node = deepcopy(template["node"])
    for content in final.get("content") or []:
        for item in content.get("items") or []:
            if (item.get("settings") or {}).get("mode") == "view":
                item["settings"].pop("mode")
    trusted = _fields(build_self_summary_schema(final))
    local_schema = build_self_summary_schema(calibration_template(node, final, []), include_prompts=True, filling=True)
    local = _fields(local_schema)
    local_sections = {section["id"]: section for section in local_schema}
    projected = []
    for section in source_schema:
        fields = []
        for source_field in section.get("fields") or []:
            field_id = source_field["id"]
            if field_id not in local or field_id not in trusted:
                continue
            if (_signature(section, source_field) != _signature(*trusted[field_id])
                    or _signature(section, source_field) != _signature(*local[field_id])):
                _conflict()
            field = deepcopy(local[field_id][1])
            field["readonly"] = bool(field.get("readonly"))
            if field["readonly"]:
                field["required"] = False
            fields.append(field)
        local_section = local_sections.get(section["id"], section)
        ids = {field["id"] for field in fields}
        elements = [deepcopy(element) for element in local_section.get("elements") or []
                    if element["kind"] == "prompt" or element["id"] in ids]
        if fields or elements:
            projected.append({**deepcopy(local_section), "fields": fields, "elements": elements})
    by_id = {section["id"]: section for section in projected}
    for section in local_schema:
        if section["id"] not in by_id and not section.get("fields") and section.get("elements"):
            by_id[section["id"]] = deepcopy(section)
    return [by_id[section["id"]] for section in local_schema if section["id"] in by_id]


def freeze_result(result, member_snapshot_id, opening_id, result_version, template):
    source = deepcopy(result)
    contents = source.get("contents") or []
    source_schema = contents[0].get("form_schema") or [] if contents else []
    projection = _projection(source_schema)
    source_answers = project_self_summary_answers(source_schema, contents[0].get("answers") or {}, include_readonly=True) if contents else {}
    for content in contents:
        schema = content.get("form_schema") or []
        answers = project_self_summary_answers(schema, content.get("answers") or {}, include_readonly=True)
        if _projection(schema) != projection or answers != source_answers:
            _conflict()
    schema = _decision_schema(source_schema, template)
    return {
        "schema_version": 1,
        "source_result": source,
        "member_snapshot_id": member_snapshot_id,
        "opening_id": opening_id,
        "task_versions": deepcopy(result_version),
        "form_schema": schema,
        "answers": deepcopy(project_self_summary_answers(schema, source_answers, include_readonly=True)),
    }


def _envelope(snapshot):
    if (not isinstance(snapshot, dict) or snapshot.get("schema_version") != 1
            or not isinstance(snapshot.get("source_result"), dict)
            or not isinstance(snapshot.get("form_schema"), list)
            or not isinstance(snapshot.get("answers"), dict)):
        raise HTTPException(409, "RECONSIDERATION_BASELINE_UNAVAILABLE")
    return snapshot


def baseline_schema(snapshot, *, filling=False):
    schema = deepcopy(_envelope(snapshot)["form_schema"])
    for section in schema:
        if "elements" in section:
            section["elements"] = [element for element in section["elements"]
                                   if element["kind"] != "prompt" or filling or not (element.get("prompt") or {}).get("onlyWhenFilling")]
    return schema


def task_result(appeal, node=None, filling=False):
    if isinstance(appeal, dict):
        snapshot = appeal.get("result_snapshot") if "result_snapshot" in appeal else appeal
    else:
        snapshot = getattr(appeal, "result_snapshot", None)
    snapshot = _envelope(snapshot)
    return baseline_schema(snapshot, filling=filling), deepcopy(snapshot["answers"])


def _sanitize(schema, values):
    sanitized = sanitize_self_summary_answers(schema, values)
    projected = project_self_summary_answers(schema, sanitized)
    for section, field, index, value in iter_self_summary_field_instances(schema, values):
        if field["id"] not in values or field.get("readonly"):
            continue
        if not section.get("allow_multiple") and field["type"] != "tag_with_followup" and isinstance(value, list):
            _invalid(field["id"])
        if field["type"] == "rich_text" and value is not None and not isinstance(value, str):
            _invalid(field["id"])
        if field["type"] == "rating" and value is not None and value != "":
            valid = {str(option["id"]) for option in field.get("options") or []}
            if field.get("allow_unknown"):
                valid.add("__unknown__")
            if not isinstance(value, str) or value not in valid:
                _invalid(field["id"])
        if field["type"] == "tag_with_followup" and value is not None:
            tags = value.get("tags") if isinstance(value, dict) else value
            options = {str(option["id"]) for option in field.get("options") or []}
            if not isinstance(tags, list) or any(not isinstance(tag, str) or tag not in options for tag in tags):
                _invalid(field["id"])
            if isinstance(value, dict) and (set(value) - {"tags", "notes", "note"}
                    or "notes" in value and (not isinstance(value["notes"], dict) or set(value["notes"]) - set(tags))):
                _invalid(field["id"])
    return {**sanitized, **projected}


def prepare_decision(snapshot, current_answers, draft, payload, show, submit):
    snapshot = _envelope(snapshot)
    if not isinstance(payload, dict):
        _invalid()
    choice = payload.get("keep_result")
    if ("keep_result" in payload and choice not in ("keep", "change")) or submit and choice is None:
        _invalid()
    if choice is None:
        choice = (draft or {}).get("keep_result", (current_answers or {}).get("keep_result"))
    if choice not in (None, "keep", "change") or not show and choice == "change":
        _invalid()
    baseline = deepcopy(snapshot["answers"])
    if submit and choice == "keep":
        return {**baseline, "keep_result": "keep"}
    schema = snapshot["form_schema"]
    writable = {key for key, (_, field) in _fields(schema).items() if not field.get("readonly")}
    for key in payload:
        if key != "keep_result" and (key not in writable or not show):
            _invalid(key)
    merged = {key: deepcopy(value) for key, value in baseline.items() if key in writable}
    for saved in (current_answers, draft, payload):
        merged.update({key: deepcopy(value) for key, value in (saved or {}).items() if key in writable})
    answers = {**baseline, **_sanitize(schema, merged)}
    if submit:
        for section, field, index, value in iter_self_summary_field_instances(schema, answers):
            if self_summary_instance_unknown(section, answers, index):
                continue
            if self_summary_field_requires_value(field, value) and self_summary_value_empty(field, value):
                _invalid(field["id"])
    if choice is not None:
        answers["keep_result"] = choice
    return answers


def effective_result(snapshot, decision_answers):
    snapshot = _envelope(snapshot)
    result = deepcopy(snapshot["source_result"])
    fields = _fields(snapshot["form_schema"])
    writable = {key for key, (_, field) in fields.items() if not field.get("readonly")}
    for key, value in (decision_answers or {}).items():
        if key != "keep_result" and (key not in fields or key not in writable and value != snapshot["answers"].get(key)):
            _invalid(key)
    payload = {key: value for key, value in (decision_answers or {}).items() if key in writable or key == "keep_result"}
    decision = prepare_decision(snapshot, {}, None, payload, True, True)
    if decision["keep_result"] == "keep":
        return result
    for content in result.get("contents") or []:
        fields = _fields(content.get("form_schema") or [])
        content["answers"] = {**(content.get("answers") or {}), **{
            key: deepcopy(value) for key, value in decision.items() if key in writable and key in fields
        }}
    for region in result.get("regions") or []:
        if region.get("kind") == "result":
            region["contents"] = deepcopy(result.get("contents") or [])
    results = []
    for content in result.get("contents") or []:
        for section in content.get("form_schema") or []:
            for field in section.get("fields") or []:
                if field["type"] != "rating":
                    continue
                value = (content.get("answers") or {}).get(field["id"])
                option = next((item for item in field.get("options") or [] if str(item["id"]) == value), None)
                if option is not None:
                    results.append({"task_id": content["task_id"], "field_id": field["id"],
                                    "option_id": str(option["id"]), "label": str(option.get("label") or "")})
    result["results"] = results
    return result
