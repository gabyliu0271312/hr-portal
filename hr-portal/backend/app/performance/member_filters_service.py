import json
from datetime import date

from fastapi import HTTPException

from app.performance.member_columns_service import _value


FILTER_KINDS = {
    "name": "person", "direct_supervisor": "person", "hrbp": "person",
    "department": "organization", "department_path": "organization",
    "job_family": "select", "job_category": "select", "job_sequence": "sequence",
    "position_level": "select", "previous_position_level": "select",
    "hire_date": "date", "employee_type": "select", "project_name": "select",
}
OPERATORS = [{"value": "in", "label": "包含"}, {"value": "not_in", "label": "不包含"}]


def stage_filter_field(node):
    node_type = _value(node, "node_type")
    states = ("not_started", "completed") if node_type in {"project_start", "project_end"} else (
        "pending", "overdue", "completed") if node_type == "result_reconsideration" else (
        "not_started", "pending", "overdue", "completed")
    template = (_value(node, "config", {}) or {}).get("template") or {}
    from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code
    if node_type == "evaluation" and (node_role_code(template) == ROLE_REVIEWER_360 or template.get("executor_label") == "360°评估人"):
        states = (*states, "rejected")
    labels = {"not_started": "未开始", "pending": "待完成", "overdue": "已逾期", "completed": "已完成", "rejected": "已拒绝"}
    return {"key": f"stage:{_value(node, 'node_id')}", "label": _value(node, "name"), "kind": "select",
            "group": ["环节状态"], "operators": OPERATORS,
            "options": [{"value": state, "label": labels[state]} for state in states]}


def rating_filter_field(rating):
    options = []
    for option in rating.get("options", []):
        if option.get("id") is None:
            continue
        label = str(option.get("code") or option.get("label") or option["id"])
        description = option.get("description") or (option.get("label") if option.get("code") else None)
        options.append({"value": str(option["id"]), "label": label,
                        **({"subLabel": str(description)} if description else {}),
                        **({"color": option["color"]} if option.get("color") is not None else {})})
    return {"key": rating["key"], "label": rating["label"], "kind": "select",
            "group": ["当前周期绩效结果"], "operators": OPERATORS, "options": options}


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
    metadata = {field["key"]: field for field in schema.get("_filter_fields", [])}
    for field in fields:
        field.update(metadata.get(field["key"], {}))
        if field["key"].startswith("stage:"):
            field.setdefault("group", ["环节状态"])
            if field["key"] not in metadata:
                field["label"] = field["label"].removesuffix("状态")
        elif field["key"].startswith("rating:"):
            field["group"] = ["当前周期绩效结果"]
        else:
            field.setdefault("group", [])
        if field["key"] == "job_sequence":
            field["label"] = "序列（筛选结果不含子序列）"
    if any(field["key"] == "job_sequence" for field in fields):
        fields.append({"key": "job_sequence_descendants", "label": "序列（筛选结果含子序列）", "kind": "sequence",
                       "group": [], "operators": OPERATORS, "options": []})
    fields.extend(field for key, field in metadata.items() if key.startswith("history_rating:"))
    return fields


def sequence_path(values):
    if not values.get("job_sequence"):
        return None
    parts = [str(values[key]) for key in ("job_family", "job_category") if values.get(key)]
    return parts or [str(values["job_sequence"])]


def sequence_identity(parts):
    return json.dumps(parts, ensure_ascii=False, separators=(",", ":"))


def member_filter_values(item):
    values = dict(_value(item, "column_values", {}) or {})
    overrides = _value(item, "filter_values", {}) or {}
    for key in values:
        if key in overrides:
            values[key] = overrides[key]
    if "name" in values:
        values["name"] = {"value": str(_value(item, "employee_no")), "label": _value(item, "display_name")}
        if _value(item, "avatar_url"):
            values["name"]["avatarUrl"] = _value(item, "avatar_url")
    if "project_name" in values:
        values["project_name"] = {"value": str(_value(item, "project_id")), "label": _value(item, "project_name")}
    parts = sequence_path(values)
    if parts:
        values["job_sequence_descendants"] = sequence_identity(parts)
    for key, value in overrides.items():
        if key.startswith("history_rating:"):
            values[key] = value
    return values


def _option(value):
    if isinstance(value, dict):
        identity = value.get("value")
        if identity is None:
            return None
        option = {"value": str(identity), "label": str(value.get("label") or identity)}
        for key in ("subLabel", "color", "avatarUrl"):
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
        field = fields[condition["key"]]
        if field["key"].startswith("stage:") and field["options"]:
            if not set(condition["values"]) <= {option["value"] for option in field["options"]}:
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
        elif key in {"job_sequence", "job_sequence_descendants"}:
            parts = sequence_path(values)
            if not parts:
                return False
            identities = {sequence_identity(parts[:index]) for index in range(1, len(parts) + 1)} if key == "job_sequence_descendants" else {sequence_identity(parts), actual}
            included = bool(identities.intersection(selected))
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
    configured = {field["key"] for field in schema.get("_filter_fields", [])}
    for field in fields:
        if field["key"] in configured and field["key"].startswith(("rating:", "history_rating:")):
            continue
        if field["key"].startswith("stage:") and field["options"]:
            continue
        if field["kind"] == "sequence":
            roots = {}
            for row in values:
                parts = sequence_path(row)
                if not parts:
                    continue
                if needle and not any(needle in part.casefold() for part in parts):
                    continue
                siblings = roots
                for index, label in enumerate(parts, 1):
                    identity = sequence_identity(parts[:index])
                    node = siblings.setdefault(identity, {"value": identity, "label": label, "_children": {}})
                    siblings = node["_children"]
            def tree(nodes):
                result = []
                for node in sorted(nodes.values(), key=lambda node: (node["label"], node["value"])):
                    children = tree(node["_children"])
                    result.append({"value": node["value"], "label": node["label"], **({"children": children} if children else {})})
                return result
            field["options"] = tree(roots)
            continue
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
