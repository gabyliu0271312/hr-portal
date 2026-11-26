import json
from datetime import date

from fastapi import HTTPException

from app.performance.member_columns_service import _value


FILTER_KINDS = {
    "name": "person", "direct_supervisor": "person",
    "department": "organization", "department_path": "organization",
    "job_family": "select", "job_category": "select", "job_sequence": "select",
    "position_level": "select", "previous_position_level": "select",
    "hire_date": "date", "employee_type": "select", "project_name": "select",
}
OPERATORS = [{"value": "in", "label": "包含"}, {"value": "not_in", "label": "不包含"}]


def invalid_filter():
    raise HTTPException(status_code=422, detail="INVALID_MEMBER_FILTER")


def parse_member_filters(raw):
    if raw is None:
        return None
    if not isinstance(raw, str) or len(raw) > 65536:
        invalid_filter()
    try:
        result = json.loads(raw)
    except (ValueError, RecursionError):
        invalid_filter()
    if not isinstance(result, dict) or set(result) != {"logic", "conditions"}:
        invalid_filter()
    if result["logic"] not in ("and", "or") or not isinstance(result["conditions"], list) or len(result["conditions"]) > 30:
        invalid_filter()
    for condition in result["conditions"]:
        if not isinstance(condition, dict) or set(condition) != {"key", "op", "values"}:
            invalid_filter()
        key, op, values = condition["key"], condition["op"], condition["values"]
        if not isinstance(key, str) or not key.strip() or len(key) > 256 or op not in ("in", "not_in", "eq", "ne"):
            invalid_filter()
        if not isinstance(values, list) or not 1 <= len(values) <= 100:
            invalid_filter()
        if any(not isinstance(value, str) or not value.strip() or len(value) > 1536 for value in values):
            invalid_filter()
        if op in ("eq", "ne") and len(values) != 1:
            invalid_filter()
    return result


def member_filter_fields(schema, items=()):
    fields = []
    for column in schema.get("columns", []):
        key = column["key"]
        kind = FILTER_KINDS.get(key)
        if key.startswith(("rating:", "stage:")):
            kind = "select"
        if kind:
            label = {"name": "人员", "department": "所属部门", "department_path": "部门（含子部门）"}.get(key, column["label"])
            fields.append({"key": key, "label": label, "kind": kind, "operators": OPERATORS, "options": []})
    return fields


def member_filter_values(item):
    values = dict(_value(item, "column_values", {}) or {})
    overrides = _value(item, "filter_values", {}) or {}
    for key in values:
        if key in overrides:
            values[key] = overrides[key]
    if "name" in values:
        values["name"] = {"value": str(_value(item, "employee_no")), "label": _value(item, "display_name")}
    if "project_name" in values:
        values["project_name"] = {"value": str(_value(item, "project_id")), "label": _value(item, "project_name")}
    return values


def _option(value):
    if isinstance(value, dict):
        identity = value.get("value")
        if identity is None:
            return None
        option = {"value": str(identity), "label": str(value.get("label") or identity)}
        for key in ("subLabel", "color"):
            if value.get(key) is not None:
                option[key] = value[key]
        return option
    if value is None or str(value) == "":
        return None
    return {"value": str(value), "label": str(value)}


def filter_member_rows(items, filters, schema):
    if filters is None or not filters["conditions"]:
        return items
    fields = {field["key"]: field for field in member_filter_fields(schema, items)}
    for condition in filters["conditions"]:
        if condition["key"] not in fields:
            invalid_filter()
        if fields[condition["key"]]["kind"] == "date":
            for value in condition["values"]:
                try:
                    if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
                        invalid_filter()
                except ValueError:
                    invalid_filter()
            if condition["op"] in ("in", "not_in") and (
                len(condition["values"]) != 2 or condition["values"][0] > condition["values"][1]
            ):
                invalid_filter()

    def matches(values, condition):
        key = condition["key"]
        if key not in values:
            return False
        option = _option(values[key])
        actual = option["value"] if option else None
        if actual is None:
            return False
        selected = condition["values"]
        if fields[key]["kind"] == "date" and condition["op"] in ("in", "not_in"):
            included = actual is not None and selected[0] <= actual <= selected[1]
        elif key == "department_path":
            included = actual is not None and any(actual == value or actual.startswith(value.rstrip("/") + "/") for value in selected)
        else:
            included = actual in selected
        return not included if condition["op"] in ("not_in", "ne") else included

    combine = all if filters["logic"] == "and" else any
    return [item for item in items if combine(matches(member_filter_values(item), condition) for condition in filters["conditions"])]


def member_filter_options(items, schema, *, key=None, keyword=None):
    fields = member_filter_fields(schema, items)
    if key is not None:
        fields = [field for field in fields if field["key"] == key]
        if not fields:
            invalid_filter()
    needle = (keyword or "").strip().casefold()
    values = [member_filter_values(item) for item in items]
    for field in fields:
        if field["kind"] == "person" and not needle:
            continue
        options = {}
        for row in values:
            option = _option(row.get(field["key"]))
            if not option:
                continue
            if field["kind"] == "person":
                option.setdefault("subLabel", option["value"])
            candidates = [option]
            if field["key"] == "department_path":
                parts = option["value"].split("/")
                candidates = [{"value": "/".join(parts[:index]), "label": "/".join(parts[:index])} for index in range(1, len(parts) + 1)]
            for candidate in candidates:
                if not needle or needle in candidate["label"].casefold() or needle in candidate["value"].casefold():
                    options.setdefault(candidate["value"], candidate)
        field["options"] = sorted(options.values(), key=lambda option: (option["label"], option["value"]))
        if field["kind"] == "person":
            field["options"] = field["options"][:100]
    return {"fields": fields}
