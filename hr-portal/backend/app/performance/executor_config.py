"""Canonical template executor configuration rules."""
from __future__ import annotations

from copy import deepcopy


EXECUTOR_CONFIG_MODE = "MULTI_ROLE"
ROLE_ORDER = ("REAL_LINE_MANAGER", "HRBP", "DEPARTMENT_HEAD", "SPECIFIED_PERSON")
MANAGER_LEVELS = ("DIRECT_MANAGER", "LEVEL_1_MANAGER")
DEPARTMENT_LEVELS = ("CURRENT_DEPARTMENT", "PARENT_DEPARTMENT", "LEVEL_1_DEPARTMENT")


def default_executor_config() -> dict:
    return {"mode": EXECUTOR_CONFIG_MODE, "roles": [{"type": "HRBP"}]}


def _clean_people(values: object) -> list[dict]:
    if not isinstance(values, list):
        raise ValueError("指定人员配置不合法")
    result: list[dict] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, dict):
            raise ValueError("指定人员配置不合法")
        employee_no = str(value.get("employee_no") or "").strip()
        display_name = str(value.get("display_name") or "").strip()
        if not employee_no or not display_name:
            raise ValueError("指定人员必须包含 employee_no 和 display_name")
        if employee_no in seen:
            continue
        seen.add(employee_no)
        result.append({"employee_no": employee_no, "display_name": display_name})
    if not result:
        raise ValueError("指定人员至少选择一人")
    return result


def normalize_executor_config(value: object | None) -> dict:
    """Normalize the shared multi-role shape used by configurable executor nodes."""
    if value is None:
        return default_executor_config()
    if not isinstance(value, dict) or value.get("mode") != EXECUTOR_CONFIG_MODE:
        raise ValueError("执行人配置模式不合法")
    raw_roles = value.get("roles")
    if not isinstance(raw_roles, list):
        raise ValueError("执行人角色配置不合法")

    by_type: dict[str, dict] = {}
    for raw in raw_roles:
        if not isinstance(raw, dict):
            raise ValueError("执行人角色配置不合法")
        role_type = str(raw.get("type") or "").strip()
        if role_type not in ROLE_ORDER:
            raise ValueError(f"不支持的执行人角色：{role_type}")
        if role_type in by_type:
            raise ValueError(f"执行人角色重复：{role_type}")
        if role_type == "REAL_LINE_MANAGER":
            levels = list(dict.fromkeys(str(item) for item in (raw.get("levels") or [])))
            if not levels or any(item not in MANAGER_LEVELS for item in levels):
                raise ValueError("实线上级至少选择一个有效级别")
            by_type[role_type] = {"type": role_type, "levels": [item for item in MANAGER_LEVELS if item in levels]}
        elif role_type == "DEPARTMENT_HEAD":
            levels = list(dict.fromkeys(str(item) for item in (raw.get("levels") or [])))
            if not levels or any(item not in DEPARTMENT_LEVELS for item in levels):
                raise ValueError("部门负责人至少选择一个有效层级")
            by_type[role_type] = {"type": role_type, "levels": [item for item in DEPARTMENT_LEVELS if item in levels]}
        elif role_type == "SPECIFIED_PERSON":
            by_type[role_type] = {"type": role_type, "people": _clean_people(raw.get("people"))}
        else:
            by_type[role_type] = {"type": role_type}

    if not by_type:
        raise ValueError("至少选择一个环节执行人")
    return {"mode": EXECUTOR_CONFIG_MODE, "roles": [by_type[item] for item in ROLE_ORDER if item in by_type]}


def project_legacy_executor_fields(config: dict) -> tuple[list[str], str]:
    """Project the canonical config into the legacy workflow fields."""
    types: list[str] = []
    labels: list[str] = []
    for role in config["roles"]:
        role_type = role["type"]
        if role_type == "REAL_LINE_MANAGER":
            types.extend(role["levels"])
            labels.append("实线上级")
        elif role_type == "HRBP":
            types.append("HRBP")
            labels.append("HRBP")
        elif role_type == "DEPARTMENT_HEAD":
            types.extend(role["levels"])
            labels.append("部门负责人")
        elif role_type == "SPECIFIED_PERSON":
            types.append("SPECIFIED_PERSON")
            labels.append("指定人员")
    return list(dict.fromkeys(types)), "、".join(labels)


def normalize_result_reconsideration_executor(node: dict) -> dict:
    normalized = deepcopy(node)
    config = normalize_executor_config(node.get("executor_config"))
    executor_types, executor_label = project_legacy_executor_fields(config)
    normalized["executor_config"] = config
    normalized["executor_types"] = executor_types
    normalized["executor_label"] = executor_label
    return normalized
