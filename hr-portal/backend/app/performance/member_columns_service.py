"""Trusted member-list column metadata and preference normalization."""

PROFILE_COLUMNS = (
    ("direct_supervisor", "直属上级", 160, "direct_supervisor"),
    ("hrbp", "HRBP", 160, "hrbp"),
    ("job_family", "职族", 140, "job_sequence"),
    ("job_category", "职类", 140, "job_sequence"),
    ("job_sequence", "序列", 160, "job_sequence"),
    ("position_level", "职级", 120, "position_level"),
    ("previous_position_level", "上期职级", 120, "position_level"),
    ("hire_date", "入职日期", 140, "hire_date"),
    ("department", "部门", 180, "department"),
    ("department_path", "部门全路径", 240, "department"),
    ("project_name", "项目名称", 180, None),
    ("employee_type", "人员类型", 140, "employee_type"),
    ("current_employment_status", "当前在职状态", 140, "employment_status"),
)
SNAPSHOT_PROFILE_FIELDS = {
    "direct_supervisor", "job_family", "job_category", "job_sequence",
    "position_level", "hire_date", "department", "department_path", "employee_type",
}
SCHEMA_KEYS = ("columns", "allowed_column_keys", "default_column_keys", "locked_column_keys", "sort_keys")


def _value(item, key, default=None):
    return item.get(key, default) if isinstance(item, dict) else getattr(item, key, default)


def column_schema(rating_columns, allowed_profile_fields, nodes=(), scene="management", *, available_profile_fields=None):
    if scene not in {"management", "evaluation"}:
        raise ValueError("INVALID_MEMBER_COLUMN_SCENE")
    visible = set(allowed_profile_fields or ())
    available = SNAPSHOT_PROFILE_FIELDS if available_profile_fields is None else set(available_profile_fields)
    columns = []
    seen = set()

    def append(key, label, width, *, default=False, locked=False, sortable=True):
        if key in seen:
            return
        seen.add(key)
        columns.append({"key": key, "label": label, "width": width, "locked": locked, "visible_by_default": default or locked, "sortable": sortable})

    append("name", "姓名", 224, locked=True)
    if scene == "evaluation":
        append("status", "状态", 144, default=True)
        append("due_at", "截止时间", 168, default=True)
    for rating in rating_columns or ():
        key = _value(rating, "key")
        if not isinstance(key, str) or not key.startswith("rating:") or len(key) > 256:
            continue
        if _value(rating, "is_360_aggregate", False) or _value(rating, "node_type") == "reviewer_360":
            continue
        append(key, _value(rating, "label") or key, 160, default=True)
    append("completion", "360° 评估率", 144, default=True)
    for key, label, width, permission in PROFILE_COLUMNS:
        if key in available and (permission is None or permission in visible or key in visible):
            append(key, label, width, default=key in {"direct_supervisor", "job_sequence", "position_level", "hire_date", "department"})
    for node in nodes or ():
        node_id = _value(node, "node_id") or _value(node, "id")
        if node_id is None or len(str(node_id)) > 96:
            continue
        config = _value(node, "config", {}) or {}
        template = config.get("template") or {}
        label = _value(node, "name") or _value(node, "label") or template.get("name") or template.get("node_name") or str(node_id)
        append(f"stage:{node_id}", f"{label}状态", 160)
    return {
        "columns": columns,
        "allowed_column_keys": [item["key"] for item in columns],
        "default_column_keys": [item["key"] for item in columns if item["visible_by_default"]],
        "locked_column_keys": [item["key"] for item in columns if item["locked"]],
        "sort_keys": [item["key"] for item in columns if item["sortable"]],
    }


def normalize_column_keys(column_keys, schema):
    allowed = set(schema["allowed_column_keys"])
    locked = [key for key in schema["locked_column_keys"] if key in allowed]
    return list(dict.fromkeys(locked + [key for key in column_keys if isinstance(key, str) and key in allowed]))
